import express from "express";
import { jsonrepair } from "jsonrepair";
import { listCachedExaInputs } from "../exa/cacheInput.js";
import { CONFIG } from "../config.js";
import { createSession, deleteSession, getSessionInsights, listSessions, loadGameState, loadGraph, loadPath, loadProfile, loadSession, saveGameState, saveGraph, saveHistory, savePath } from "../db/store.js";
import { devLog, getDevLogs } from "../dev/logs.js";
import { notePrefetchHit, runGeminiBodyJob, runGeminiJob, setPrefetchTelemetry } from "../llm/broker.js";
import { AURA_VOICE_SPEC, auraVoiceSpec } from "../llm/voice.js";
import { buildGraph } from "../pipeline/buildGraph.js";
import { generateCardsForNode } from "../pipeline/cardGenerator.js";
import { evaluateCheck } from "../pipeline/evaluate.js";
import { deriveGoalMode, linearize } from "../pipeline/linearize.js";
import { collectMissionMetadata, deriveMapState, initializeGameState } from "../pipeline/mapState.js";
import type { CardInteractionEvent, GameState, KnowledgeGraph, LessonCard, LessonPath, StudentIntent } from "../types.js";
import { getRequestLanguage } from "../i18n/language.js";
import type { SupportedLanguage } from "../i18n/language.js";

const router = express.Router();
const prefetchedNodeCards = new Map<string, LessonCard[]>();

function prefetchKey(sessionId: string, nodeId: string) {
  return `${sessionId}:${nodeId}`;
}

function activeNode(graph: KnowledgeGraph, path: LessonPath) {
  const nodeId = path.items[path.currentIndex]?.nodeId;
  const node = graph.nodes.find((candidate) => candidate.id === nodeId) ?? graph.nodes[0];
  if (!node) throw new Error("Graph has no nodes.");
  return node;
}

function personalizedOpening(name: string | undefined, topic: string, nodeCount: number, language: SupportedLanguage) {
  const who = name?.trim() || "Learner";
  if (language === "hi") return `${who}, ${topic} के लिए ${nodeCount} छोटे पाठ तैयार हैं। Aura आपकी गति और मदद की ज़रूरत के हिसाब से चलेगा।`;
  return `${who}, ${nodeCount} small lessons are ready for ${topic}. Aura will tune the pace to your profile.`;
}

function applyMasteryDelta(node: KnowledgeGraph["nodes"][number], delta: number, floor = 0) {
  node.mastery = Math.max(floor, Math.min(1, node.mastery + delta));
  if (node.mastery >= 0.8) node.status = "mastered";
  else if (node.status === "mastered") node.status = "active";
}

function advance(graph: KnowledgeGraph, path: LessonPath, gameState: GameState, passed: boolean) {
  const current = activeNode(graph, path);
  if (passed) {
    current.mastery = Math.max(0.8, Math.min(1, current.mastery + 0.2));
    if (current.mastery >= 0.8) current.status = "mastered";
    gameState.completedMissionIds = Array.from(new Set([...gameState.completedMissionIds, current.id]));
    gameState.nodeVisualStates[current.id] = current.mastery >= 0.8 ? "mastered" : "ready";
    gameState.recentEvents.unshift({ type: "MISSION_COMPLETED", nodeId: current.id, rewardText: current.mission?.reward ?? "A new block lights up." });
    if (path.currentIndex < path.items.length - 1) {
      path.currentIndex += 1;
      const next = activeNode(graph, path);
      next.status = "active";
      gameState.activeMissionId = next.id;
      gameState.nodeVisualStates[next.id] = "active";
      gameState.unlockedNodeIds = Array.from(new Set([...gameState.unlockedNodeIds, next.id]));
      gameState.recentEvents.unshift({ type: "NODE_UNLOCKED", nodeId: next.id, reason: "The previous idea warmed up." });
    } else {
      gameState.finalMissionUnlocked = true;
    }
  } else {
    current.status = "shaky";
    applyMasteryDelta(current, -0.1);
    gameState.nodeVisualStates[current.id] = "shaky";
    gameState.recentEvents.unshift({ type: "NODE_BECAME_SHAKY", nodeId: current.id, reason: "This path is getting steep." });
  }
  gameState.recentEvents = gameState.recentEvents.slice(0, 6);
}

function prefetchNextNodeCards(sessionId: string, graph: KnowledgeGraph, path: LessonPath, language: SupportedLanguage = 'en') {
  if (!CONFIG.llmPrefetch) return;
  const nextItem = path.items[path.currentIndex + 1];
  if (!nextItem) return;
  const nextNode = graph.nodes.find((candidate) => candidate.id === nextItem.nodeId);
  if (!nextNode) return;
  const key = prefetchKey(sessionId, nextNode.id);
  if (prefetchedNodeCards.has(key)) return;
  setPrefetchTelemetry("loading", nextNode.topicName);
  devLog("info", "prefetch", "Prefetching next node cards", { sessionId, nodeId: nextNode.id, title: nextNode.topicName });
  void generateCardsForNode(nextNode, "prefetch_node", language)
    .then((cards) => {
      prefetchedNodeCards.set(key, cards);
      setPrefetchTelemetry("ready", nextNode.topicName);
      devLog("info", "prefetch", "Prefetched next node cards", { sessionId, nodeId: nextNode.id, cards: cards.length });
    })
    .catch((error) => {
      setPrefetchTelemetry("failed", nextNode.topicName);
      devLog("warn", "prefetch", "Prefetch failed", { sessionId, nodeId: nextNode.id, message: error instanceof Error ? error.message : String(error) });
    });
}

async function runStudentTurn(sessionId: string, studentMessage: string, language: SupportedLanguage = 'en') {
  const session = loadSession(sessionId);
  const graph = loadGraph(String(session.graph_id));
  const path = loadPath(String(session.lesson_path_id));
  const gameState = loadGameState(sessionId);
  const node = activeNode(graph, path);
  const evaluation = await evaluateCheck(node.comfortCheck, studentMessage, language);
  const passed = evaluation.result === "pass" || evaluation.result === "partial";

  advance(graph, path, gameState, passed);
  const nextNode = activeNode(graph, path);
  const cards = await generateCardsForNode(passed ? nextNode : node, "current_card", language);
  prefetchNextNodeCards(sessionId, graph, path, language);

  const history = JSON.parse(String(session.history_json ?? "[]")) as unknown[];
  saveHistory(sessionId, [...history, { role: "student", message: studentMessage }, { role: "assistant", message: passed ? "Nice, this block is ready for the next step." : "I found a gentler stepping stone.", endedOnCheck: true }]);
  saveGraph(sessionId, graph);
  savePath(sessionId, path);
  saveGameState(sessionId, gameState);

  return {
    assistantMessage: passed ? "Gemma generated the next node." : "Gemma regenerated this node with the current response in mind.",
    transitionAction: passed ? { type: "ADVANCE", nextNodeId: nextNode.id } : { type: "REPAIR_CURRENT", strategy: node.repairStrategies[0] },
    nodeState: { nodeId: nextNode.id, status: nextNode.status, mastery: nextNode.mastery },
    check: nextNode.comfortCheck,
    checkEvaluation: evaluation,
    lessonPathPatch: { type: "NO_CHANGE" },
    liveStudentModelPatch: {},
    mapState: deriveMapState(graph, path, gameState),
    cards,
    gameEvents: gameState.recentEvents,
    gameStatePatch: gameState
  };
}

router.post("/generateLesson", async (req, res, next) => {
  try {
    const topic = String(req.body?.topic ?? "").trim();
    const cacheId = req.body?.cacheId ? String(req.body.cacheId) : undefined;
    const intent = req.body?.intent as StudentIntent | undefined;
    if (!topic || !intent) return res.status(400).json({ error: "topic and intent are required" });
    const language = getRequestLanguage(req);

    devLog("info", "api", "POST /generateLesson", { topic, cacheId: cacheId ?? null, language });
    const profile = loadProfile();
    profile.language = language;
    const goalMode = deriveGoalMode(intent);
    const sessionId = createSession(profile.id, topic, intent, goalMode, language);
    const graph = await buildGraph(topic, profile, { cacheId, intent, language });
    const path = linearize(graph);
    const gameState = initializeGameState(sessionId, graph, path);
    const mapState = deriveMapState(graph, path, gameState);
    const cards = await generateCardsForNode(activeNode(graph, path), "current_card", language);
    devLog("info", "api", "Generated lesson response", { sessionId, graphId: graph.id, nodes: graph.nodes.length, cards: cards.length, cacheId: cacheId ?? null });

    saveGraph(sessionId, graph);
    savePath(sessionId, path);
    saveGameState(sessionId, gameState);
    prefetchNextNodeCards(sessionId, graph, path, language);

    res.json({
      sessionId,
      openingMessage: personalizedOpening(profile.name, topic, graph.nodes.length, language),
      graph,
      lessonPath: path,
      mapState,
      cards,
      gameState,
      missionMetadata: collectMissionMetadata(graph),
      sourceConfidence: "medium"
    });
  } catch (err) {
    next(err);
  }
});

router.post("/node/cards", async (req, res, next) => {
  try {
    const sessionId = String(req.body?.sessionId ?? "");
    const nodeId = String(req.body?.nodeId ?? "");
    if (!sessionId || !nodeId) return res.status(400).json({ error: "sessionId and nodeId are required" });
    const language = getRequestLanguage(req);
    devLog("info", "api", "POST /node/cards", { sessionId, nodeId });
    const session = loadSession(sessionId);
    const graph = loadGraph(String(session.graph_id));
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return res.status(404).json({ error: `Node not found: ${nodeId}` });
    const cached = prefetchedNodeCards.get(prefetchKey(sessionId, nodeId));
    if (cached) {
      prefetchedNodeCards.delete(prefetchKey(sessionId, nodeId));
      notePrefetchHit(node.topicName);
      setPrefetchTelemetry("hit", node.topicName);
      return res.json({ cards: cached, cacheHit: true });
    }
    const cards = await generateCardsForNode(node, "current_card", language);
    devLog("info", "api", "Generated node cards", { sessionId, nodeId, cards: cards.length });
    res.json({ cards, cacheHit: false });
  } catch (err) {
    next(err);
  }
});

router.post("/generateLessonFromImage", async (req, res, next) => {
  try {
    const imageData = String(req.body?.imageData ?? "");
    const mimeType = String(req.body?.mimeType ?? "image/jpeg");
    const intent = req.body?.intent as StudentIntent | undefined;
    if (!imageData || !intent) return res.status(400).json({ error: "imageData and intent are required" });
    const language = getRequestLanguage(req);

    devLog("info", "api", "POST /generateLessonFromImage", { mimeType, bytes: imageData.length });
    const extractionPrompt = {
      contents: [{
        role: "user",
        parts: [
          {
            text: [
              "You are Aura's local image-to-lesson planner.",
              "Inspect this textbook or worksheet image.",
              "Return JSON only with: topic, subject, gradeLevel, learningGoal, visibleFormulas, keyConcepts.",
              "Keep topic short enough to generate a lesson graph."
            ].join("\n")
          },
          { inlineData: { mimeType, data: imageData } }
        ]
      }],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 900,
        responseMimeType: "application/json"
      }
    };
    const raw = await runGeminiBodyJob(extractionPrompt, {
      type: "image_to_graph",
      label: "textbook image to topic",
      json: true,
      maxTokens: 900,
      timeoutMs: 120_000
    });
    const extracted = JSON.parse(jsonrepair(raw)) as {
      topic?: string;
      subject?: string;
      gradeLevel?: string;
      learningGoal?: string;
      keyConcepts?: string[];
    };
    const topic = String(extracted.topic || extracted.keyConcepts?.[0] || "textbook topic").trim();
    const profile = loadProfile();
    profile.language = language;
    const goalMode = deriveGoalMode(intent);
    const sessionId = createSession(profile.id, topic, intent, goalMode, language);
    const graph = await buildGraph(topic, profile, { intent, language });
    graph.sourcePacketIds = Array.from(new Set(["image:gemma_vision", ...graph.sourcePacketIds]));
    const path = linearize(graph);
    const gameState = initializeGameState(sessionId, graph, path);
    const mapState = deriveMapState(graph, path, gameState);
    const cards = await generateCardsForNode(activeNode(graph, path), "current_card", language);

    saveGraph(sessionId, graph);
    savePath(sessionId, path);
    saveGameState(sessionId, gameState);
    prefetchNextNodeCards(sessionId, graph, path, language);

    res.json({
      sessionId,
      openingMessage: personalizedOpening(profile.name, topic, graph.nodes.length, language),
      graph,
      lessonPath: path,
      mapState,
      cards,
      gameState,
      missionMetadata: collectMissionMetadata(graph),
      sourceConfidence: "medium",
      imageExtraction: extracted
    });
  } catch (err) {
    next(err);
  }
});

router.post("/tutor/respond", async (req, res, next) => {
  try {
    const sessionId = String(req.body?.sessionId ?? "");
    const studentMessage = String(req.body?.studentMessage ?? "");
    const language = getRequestLanguage(req);
    devLog("info", "api", "POST /tutor/respond", { sessionId, chars: studentMessage.length });
    res.json(await runStudentTurn(sessionId, studentMessage, language));
  } catch (err) {
    next(err);
  }
});

router.post("/chat/ask", async (req, res, next) => {
  try {
    const sessionId = String(req.body?.sessionId ?? "");
    const question = String(req.body?.question ?? "").trim();
    const cardContext = req.body?.cardContext as
      | { type?: string; title?: string; body?: string }
      | undefined;
    if (!question) return res.status(400).json({ error: "question is required" });
    const language = getRequestLanguage(req);
    devLog("info", "api", "POST /chat/ask", { sessionId, chars: question.length });

    let lessonContext = "No active lesson.";
    if (sessionId) {
      try {
        const session = loadSession(sessionId);
        const graph = loadGraph(String(session.graph_id));
        const path = loadPath(String(session.lesson_path_id));
        const node = activeNode(graph, path);
        const cardLine = cardContext
          ? `Current card (${cardContext.type ?? "?"}): ${cardContext.title ?? ""}${cardContext.body ? ` — ${cardContext.body.slice(0, 280)}` : ""}`
          : "";
        lessonContext = [
          `Topic: ${graph.topic}`,
          `Current lesson: ${node.topicName} — ${node.teachingGoal}`,
          cardLine
        ].filter(Boolean).join("\n");
      } catch {}
    }

    const prompt = [
      auraVoiceSpec(language),
      "",
      "You are answering a quick learner question via chat. This is conversational text only. Do NOT generate a card. Do NOT produce JSON. Do NOT advance the lesson. Reply in 2 to 4 short sentences. Answer the specific question. If the learner says they are stuck, name the sticking point and give one concrete next step.",
      "",
      "CONTEXT",
      lessonContext,
      "",
      `Learner asks: ${question}`,
      "",
      "Reply now in plain text only."
    ].join("\n");

    const reply = await runGeminiJob(prompt, {
      type: "chat_reply",
      label: "chat ask",
      maxTokens: 400,
      temperature: 0.45,
      timeoutMs: 30000
    });
    res.json({ reply: reply.trim() });
  } catch (err) {
    next(err);
  }
});

router.get("/dev/cache", (req, res) => {
  const topic = typeof req.query.topic === "string" ? req.query.topic : "";
  res.json({
    topic,
    caches: listCachedExaInputs(topic).map((cache) => ({
      id: cache.id,
      topic: cache.topic,
      subject: cache.curriculum.subject ?? "",
      gradeLevel: cache.curriculum.grade_level ?? "",
      learningGoals: cache.curriculum.learning_goals ?? [],
      constraints: cache.curriculum.constraints ?? [],
      score: cache.score,
      usable: cache.hasGraphInput
    }))
  });
});

router.get("/dev/logs", (req, res) => {
  const limit = Number(req.query.limit ?? 120);
  res.json({ logs: getDevLogs(Number.isFinite(limit) ? limit : 120) });
});

router.post("/card-event", async (req, res, next) => {
  try {
    const event = req.body as CardInteractionEvent;
    if (event.eventType === "hint_requested" || event.eventType === "power_up") {
      return res.json({
        assistantMessage: "Here is a smaller step: look for the one idea that stays the same in the example."
      });
    }
    const session = loadSession(event.sessionId);
    const graph = loadGraph(String(session.graph_id));
    const path = loadPath(String(session.lesson_path_id));
    const gameState = loadGameState(event.sessionId);
    const node = graph.nodes.find((candidate) => candidate.id === event.nodeId) ?? activeNode(graph, path);
    const payload = (event.payload ?? {}) as { correct?: boolean; cardType?: string };
    if (event.eventType === "answer_submitted") {
      applyMasteryDelta(node, payload.correct ? 0.25 : -0.1);
    } else if (event.eventType === "card_completed") {
      const isRecap = payload.cardType === "recap";
      const cap = isRecap ? 0.75 : 0.6;
      node.mastery = Math.min(cap, node.mastery + (isRecap ? 0.2 : 0.08));
      if (node.mastery >= 0.8) node.status = "mastered";
    }
    gameState.nodeVisualStates[node.id] = node.mastery >= 0.8 ? "mastered" : node.status === "shaky" ? "shaky" : "active";
    saveGraph(event.sessionId, graph);
    saveGameState(event.sessionId, gameState);
    return res.json({
      assistantMessage: "Mastery updated.",
      nodeState: { nodeId: node.id, status: node.status, mastery: node.mastery },
      mapState: deriveMapState(graph, path, gameState),
      gameEvents: gameState.recentEvents,
      gameStatePatch: gameState
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/session/:id", (req, res, next) => {
  try {
    deleteSession(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get("/session/:id/state", (req, res, next) => {
  try {
    const session = loadSession(req.params.id);
    const graph = loadGraph(String(session.graph_id));
    const lessonPath = loadPath(String(session.lesson_path_id));
    const gameState = loadGameState(req.params.id);
    res.json({
      graph,
      lessonPath,
      currentNodeId: lessonPath.items[lessonPath.currentIndex]?.nodeId,
      history: JSON.parse(String(session.history_json ?? "[]")),
      sourceConfidence: session.source_confidence,
      mapState: deriveMapState(graph, lessonPath, gameState),
      gameState
    });
  } catch (err) {
    next(err);
  }
});

router.get("/sessions", (_req, res, next) => {
  try {
    res.json({ sessions: listSessions() });
  } catch (err) {
    next(err);
  }
});

router.get("/session/:id/resume", async (req, res, next) => {
  try {
    const session = loadSession(req.params.id);
    const sessionLanguage = (String(session.language ?? 'en')) as SupportedLanguage;
    const graph = loadGraph(String(session.graph_id));
    const lessonPath = loadPath(String(session.lesson_path_id));
    const gameState = loadGameState(req.params.id);
    const mapState = deriveMapState(graph, lessonPath, gameState);
    const node = activeNode(graph, lessonPath);
    const cards = await generateCardsForNode(node, "current_card", sessionLanguage);
    prefetchNextNodeCards(req.params.id, graph, lessonPath, sessionLanguage);
    res.json({
      sessionId: req.params.id,
      graph,
      lessonPath,
      mapState,
      gameState,
      cards,
      missionMetadata: collectMissionMetadata(graph),
      openingMessage: `Resuming: ${session.topic}`,
      sourceConfidence: session.source_confidence ?? "medium",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/session/:id/insights", (req, res, next) => {
  try {
    res.json(getSessionInsights(req.params.id));
  } catch (err) {
    next(err);
  }
});

const QUIZ_TYPES = new Set(["mcq", "fill_blank", "true_false", "quiz", "recall", "dragsort"]);
function quizOnly(cards: LessonCard[]): LessonCard[] {
  return cards.filter((c) => QUIZ_TYPES.has(c.type));
}

router.post("/workspace/:sessionId/revise", async (req, res, next) => {
  try {
    const sessionId = String(req.params.sessionId);
    const language = getRequestLanguage(req);
    devLog("info", "api", "POST /workspace/:id/revise", { sessionId });
    const session = loadSession(sessionId);
    const graph = loadGraph(String(session.graph_id));
    const reviseNodes = graph.nodes
      .filter((n) => n.status === "shaky" || (n.mastery > 0 && n.mastery < 0.6))
      .slice(0, 3);
    if (reviseNodes.length === 0) {
      return res.status(400).json({ error: "Nothing to revise yet." });
    }
    const cards: LessonCard[] = [];
    for (const node of reviseNodes) {
      cards.push(...await generateCardsForNode(node, "current_card", language));
    }
    res.json({ cards, nodeCount: reviseNodes.length, mode: "revise" });
  } catch (err) {
    next(err);
  }
});

router.post("/workspace/:sessionId/test/:nodeId", async (req, res, next) => {
  try {
    const sessionId = String(req.params.sessionId);
    const nodeId = String(req.params.nodeId);
    const language = getRequestLanguage(req);
    devLog("info", "api", "POST /workspace/:id/test/:nodeId", { sessionId, nodeId });
    const session = loadSession(sessionId);
    const graph = loadGraph(String(session.graph_id));
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return res.status(404).json({ error: "Node not found." });
    if (node.status !== "mastered") {
      return res.status(400).json({ error: "Lesson not mastered yet." });
    }
    const raw = await generateCardsForNode(node, "current_card", language);
    const quiz = quizOnly(raw);
    const cards = quiz.length > 0 ? quiz : raw;
    res.json({ cards, nodeCount: 1, mode: "test", scope: "lesson", topic: node.topicName });
  } catch (err) {
    next(err);
  }
});

router.post("/workspace/:sessionId/test", async (req, res, next) => {
  try {
    const sessionId = String(req.params.sessionId);
    const language = getRequestLanguage(req);
    devLog("info", "api", "POST /workspace/:id/test", { sessionId });
    const session = loadSession(sessionId);
    const graph = loadGraph(String(session.graph_id));
    const mastered = graph.nodes.filter((n) => n.status === "mastered");
    if (mastered.length < graph.nodes.length || graph.nodes.length === 0) {
      return res.status(400).json({ error: "Finish all lessons to take the final test." });
    }
    const picks = mastered.slice(0, 8);
    const cards: LessonCard[] = [];
    for (const node of picks) {
      const raw = await generateCardsForNode(node, "current_card", language);
      const quiz = quizOnly(raw);
      cards.push(...(quiz.length > 0 ? quiz : raw.slice(0, 2)));
    }
    res.json({ cards, nodeCount: picks.length, mode: "test", scope: "final" });
  } catch (err) {
    next(err);
  }
});

export default router;
