import express from "express";
import { jsonrepair } from "jsonrepair";
import { listCachedResearchInputs } from "../research/cacheInput.js";
import { CONFIG } from "../config.js";
import { createSession, getSessionInsights, getRecentAccuracy, listSessions, loadDueReviews, loadGameState, loadGraph, loadPath, loadProfile, loadReviewCard, loadSession, recordAnswer, reviewStats, saveGameState, saveGraph, saveHistory, savePath, saveReviewCard } from "../db/store.js";
import { createReviewCard, scheduleReview, sortByPriority, dailyNewCardLimit, dailyReviewLimit, type ReviewRating } from "../pipeline/spacedReview.js";
import { devLog, getDevLogs } from "../dev/logs.js";
import { notePrefetchHit, runGeminiBodyJob, runGeminiJob, setPrefetchTelemetry } from "../llm/broker.js";
import { AURA_VOICE_SPEC, auraVoiceSpec } from "../llm/voice.js";
import { buildGraph } from "../pipeline/buildGraph.js";
import { generateCardsForNode, interleaveReviewCards } from "../pipeline/cardGenerator.js";
import { fallbackCardForType } from "../pipeline/fallbacks.js";
import { evaluateCheck } from "../pipeline/evaluate.js";
import { deriveGoalMode, linearize } from "../pipeline/linearize.js";
import { collectMissionMetadata, deriveMapState, initializeGameState } from "../pipeline/mapState.js";
import type { CardInteractionEvent, GameState, KnowledgeGraph, KnowledgeNode, LessonCard, LessonPath, StudentIntent } from "../types.js";
import { getRequestLanguage } from "../i18n/language.js";
import type { SupportedLanguage } from "../i18n/language.js";

const router = express.Router();
const prefetchedNodeCards = new Map<string, LessonCard[]>();
const prefetchingNodeCards = new Set<string>();

function prefetchKey(sessionId: string, nodeId: string) {
  return `${sessionId}:${nodeId}`;
}

function activeNode(graph: KnowledgeGraph, path: LessonPath) {
  const nodeId = path.items[path.currentIndex]?.nodeId;
  const node = graph.nodes.find((candidate) => candidate.id === nodeId) ?? graph.nodes[0];
  if (!node) throw new Error("Graph has no nodes.");
  return node;
}

function extractReviewPairs(cards: LessonCard[]): { front: string; back: string; cardType: string }[] {
  const pairs: { front: string; back: string; cardType: string }[] = [];
  for (const card of cards) {
    switch (card.type) {
      case "mcq": {
        const correct = card.options.find((o) => o.id === card.correctOptionId);
        if (correct) pairs.push({ front: card.prompt, back: correct.text, cardType: "mcq" });
        break;
      }
      case "vocab":
        pairs.push({ front: `What does "${card.word}" mean?`, back: `${card.meaning}. Example: ${card.example}`, cardType: "vocab" });
        break;
      case "fill_blank":
        pairs.push({ front: card.prompt, back: card.acceptedAnswers[0] ?? "", cardType: "fill_blank" });
        break;
      case "true_false":
        pairs.push({ front: card.statement, back: card.correctAnswer ? "True" : "False", cardType: "true_false" });
        break;
      case "flash":
        for (const f of card.cards) pairs.push({ front: f.front, back: f.back, cardType: "flash" });
        break;
      case "morpheme":
        pairs.push({ front: `Break down the word "${card.word}"`, back: card.morphemes.map((m) => `${m.text} (${m.type}: ${m.meaning})`).join(" + "), cardType: "morpheme" });
        break;
      case "connection":
        pairs.push({ front: `How does "${card.previous}" connect to "${card.current}"?`, back: card.bridge, cardType: "connection" });
        break;
      default:
        break;
    }
  }
  return pairs;
}

function nodeReviewPairs(node: KnowledgeNode): { front: string; back: string; cardType: string }[] {
  const pairs: { front: string; back: string; cardType: string }[] = [];
  if (node.comfortCheck?.prompt && node.comfortCheck?.expectedIdea) {
    pairs.push({ front: node.comfortCheck.prompt, back: node.comfortCheck.expectedIdea, cardType: "comfort_check" });
  }
  if (node.keyTerms.length > 0) {
    pairs.push({ front: `What is "${node.keyTerms[0]}" in the context of ${node.topicName}?`, back: node.teachingGoal, cardType: "key_term" });
  }
  if (node.commonConfusions?.length > 0) {
    pairs.push({ front: `True or false: ${node.commonConfusions[0]}`, back: "False — this is a common misconception.", cardType: "misconception" });
  }
  if (node.microLessonPlan?.intuition) {
    pairs.push({ front: `Explain the core idea behind ${node.topicName}.`, back: node.microLessonPlan.intuition, cardType: "core_idea" });
  }
  if (pairs.length === 0) {
    pairs.push({ front: node.topicName, back: node.teachingGoal, cardType: "node_mastered" });
  }
  return pairs;
}

function advance(graph: KnowledgeGraph, path: LessonPath, gameState: GameState, passed: boolean, sessionId?: string, lessonCards?: LessonCard[]) {
  const current = activeNode(graph, path);
  if (passed) {
    current.status = "mastered";
    current.mastery = Math.min(1, current.mastery + 0.45);
    gameState.completedMissionIds = Array.from(new Set([...gameState.completedMissionIds, current.id]));
    gameState.nodeVisualStates[current.id] = "mastered";
    gameState.recentEvents.unshift({ type: "MISSION_COMPLETED", nodeId: current.id, rewardText: current.mission?.reward ?? "A new block lights up." });
    if (sessionId) {
      const cardPairs = lessonCards ? extractReviewPairs(lessonCards) : [];
      const nodePairs = nodeReviewPairs(current);
      const allPairs = cardPairs.length > 0 ? cardPairs : nodePairs;
      for (const pair of allPairs.slice(0, 4)) {
        const reviewCard = createReviewCard(sessionId, current.id, pair.cardType, pair.front, pair.back);
        saveReviewCard(reviewCard);
      }
    }
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
    current.mastery = Math.max(0, current.mastery - 0.1);
    gameState.nodeVisualStates[current.id] = "shaky";
    gameState.recentEvents.unshift({ type: "NODE_BECAME_SHAKY", nodeId: current.id, reason: "This path is getting steep." });
  }
  gameState.recentEvents = gameState.recentEvents.slice(0, 6);
}

type DifficultyTone = "gentle" | "normal" | "stretch";

function adaptiveDifficulty(sessionId: string): DifficultyTone {
  const accuracy = getRecentAccuracy(sessionId, 5);
  if (accuracy < 0.65) return "gentle";
  if (accuracy > 0.90) return "stretch";
  return "normal";
}

function prefetchNextNodeCards(sessionId: string, graph: KnowledgeGraph, path: LessonPath, language: SupportedLanguage = 'en') {
  if (!CONFIG.llmPrefetch) return;
  const nextItem = path.items[path.currentIndex + 1];
  if (!nextItem) return;
  const nextNode = graph.nodes.find((candidate) => candidate.id === nextItem.nodeId);
  if (!nextNode) return;
  const key = prefetchKey(sessionId, nextNode.id);
  if (prefetchedNodeCards.has(key) || prefetchingNodeCards.has(key)) return;
  prefetchingNodeCards.add(key);
  setPrefetchTelemetry("loading", nextNode.topicName);
  devLog("info", "prefetch", "Prefetching next node cards", { sessionId, nodeId: nextNode.id, title: nextNode.topicName });
  void generateCardsForNode(nextNode, "prefetch_node", language)
    .then((cards) => {
      prefetchedNodeCards.set(key, cards);
      prefetchingNodeCards.delete(key);
      setPrefetchTelemetry("ready", nextNode.topicName);
      devLog("info", "prefetch", "Prefetched next node cards", { sessionId, nodeId: nextNode.id, cards: cards.length });
    })
    .catch((error) => {
      prefetchingNodeCards.delete(key);
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

  advance(graph, path, gameState, passed, sessionId);
  const difficulty = adaptiveDifficulty(sessionId);
  const nextNode = activeNode(graph, path);
  let cards = await generateCardsForNode(passed ? nextNode : node, "current_card", language, difficulty);
  if (passed) cards = interleaveReviewCards(cards, graph, nextNode.id);
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
      openingMessage: `Built ${graph.nodes.length} source-backed lecture nodes for ${topic}.`,
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
      openingMessage: `Built ${graph.nodes.length} local vision-planned nodes from the image: ${topic}.`,
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
    caches: listCachedResearchInputs(topic).map((cache) => ({
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
    const language = getRequestLanguage(req);
    if (event.eventType === "answer_submitted" && event.sessionId && event.cardId) {
      const correct = (event.payload as any)?.correct === true;
      recordAnswer(event.sessionId, event.cardId, correct, event.telemetry?.responseTimeMs ?? 0);
    }
    if (event.eventType === "hint_requested" || event.eventType === "power_up") {
      return res.json({
        assistantMessage: "Here is a smaller step: look for the one idea that stays the same in the example."
      });
    }
    return res.json(await runStudentTurn(event.sessionId, JSON.stringify(event.payload ?? {}), language));
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
    while (quiz.length < 3) {
      const fb = [
        fallbackCardForType(node, "mcq", quiz.length),
        fallbackCardForType(node, "true_false", quiz.length + 10),
        fallbackCardForType(node, "fill_blank", quiz.length + 20),
      ];
      for (const f of fb) {
        if (QUIZ_TYPES.has(f.type) && quiz.length < 3) quiz.push(f);
      }
      break;
    }
    res.json({ cards: quiz.slice(0, 3), nodeCount: 1, mode: "test", scope: "lesson", topic: node.topicName });
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

// ── Spaced Review API ───────────────────────────────────────────────────

router.get("/reviews/due", (_req, res, next) => {
  try {
    const due = loadDueReviews(dailyReviewLimit);
    const sorted = sortByPriority(due);
    res.json({ reviews: sorted, stats: reviewStats() });
  } catch (err) { next(err); }
});

router.get("/reviews/stats", (_req, res, next) => {
  try {
    res.json(reviewStats());
  } catch (err) { next(err); }
});

router.post("/reviews/:id/answer", (req, res, next) => {
  try {
    const id = String(req.params.id);
    const rating = Number(req.body?.rating) as ReviewRating;
    if (![1, 2, 3, 4].includes(rating)) return res.status(400).json({ error: "rating must be 1-4" });
    const card = loadReviewCard(id);
    if (!card) return res.status(404).json({ error: "Review card not found" });
    const updated = scheduleReview(card, rating);
    saveReviewCard(updated);
    devLog("info", "api", "Review answered", { id, rating, nextDue: updated.dueDate, interval: updated.interval });
    res.json({ card: updated, stats: reviewStats() });
  } catch (err) { next(err); }
});

router.post("/reviews/record-answer", (req, res, next) => {
  try {
    const { sessionId, cardId, correct, responseMs } = req.body ?? {};
    if (!sessionId || !cardId) return res.status(400).json({ error: "sessionId and cardId required" });
    recordAnswer(sessionId, cardId, correct === true, responseMs ?? 0);
    res.json({ accuracy: getRecentAccuracy(sessionId, 5), difficulty: adaptiveDifficulty(sessionId) });
  } catch (err) { next(err); }
});

export default router;
