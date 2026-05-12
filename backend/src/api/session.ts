import express from "express";
import { jsonrepair } from "jsonrepair";
import { listCachedExaInputs } from "../exa/cacheInput.js";
import { CONFIG } from "../config.js";
import { createSession, loadGameState, loadGraph, loadPath, loadProfile, loadSession, saveGameState, saveGraph, saveHistory, savePath } from "../db/store.js";
import { devLog, getDevLogs } from "../dev/logs.js";
import { notePrefetchHit, runGeminiBodyJob, setPrefetchTelemetry } from "../llm/broker.js";
import { buildGraph } from "../pipeline/buildGraph.js";
import { generateCardsForNode } from "../pipeline/cardGenerator.js";
import { evaluateCheck } from "../pipeline/evaluate.js";
import { deriveGoalMode, linearize } from "../pipeline/linearize.js";
import { collectMissionMetadata, deriveMapState, initializeGameState } from "../pipeline/mapState.js";
import type { CardInteractionEvent, GameState, KnowledgeGraph, LessonCard, LessonPath, StudentIntent } from "../types.js";

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

function advance(graph: KnowledgeGraph, path: LessonPath, gameState: GameState, passed: boolean) {
  const current = activeNode(graph, path);
  if (passed) {
    current.status = "mastered";
    current.mastery = Math.min(1, current.mastery + 0.45);
    gameState.completedMissionIds = Array.from(new Set([...gameState.completedMissionIds, current.id]));
    gameState.nodeVisualStates[current.id] = "mastered";
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
    current.mastery = Math.max(0, current.mastery - 0.1);
    gameState.nodeVisualStates[current.id] = "shaky";
    gameState.recentEvents.unshift({ type: "NODE_BECAME_SHAKY", nodeId: current.id, reason: "This path is getting steep." });
  }
  gameState.recentEvents = gameState.recentEvents.slice(0, 6);
}

function prefetchNextNodeCards(sessionId: string, graph: KnowledgeGraph, path: LessonPath) {
  if (!CONFIG.llmPrefetch) return;
  const nextItem = path.items[path.currentIndex + 1];
  if (!nextItem) return;
  const nextNode = graph.nodes.find((candidate) => candidate.id === nextItem.nodeId);
  if (!nextNode) return;
  const key = prefetchKey(sessionId, nextNode.id);
  if (prefetchedNodeCards.has(key)) return;
  setPrefetchTelemetry("loading", nextNode.topicName);
  devLog("info", "prefetch", "Prefetching next node cards", { sessionId, nodeId: nextNode.id, title: nextNode.topicName });
  void generateCardsForNode(nextNode, "prefetch_node")
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

async function runStudentTurn(sessionId: string, studentMessage: string) {
  const session = loadSession(sessionId);
  const graph = loadGraph(String(session.graph_id));
  const path = loadPath(String(session.lesson_path_id));
  const gameState = loadGameState(sessionId);
  const node = activeNode(graph, path);
  const evaluation = await evaluateCheck(node.comfortCheck, studentMessage);
  const passed = evaluation.result === "pass" || evaluation.result === "partial";

  advance(graph, path, gameState, passed);
  const nextNode = activeNode(graph, path);
  const cards = await generateCardsForNode(passed ? nextNode : node);
  prefetchNextNodeCards(sessionId, graph, path);

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

    devLog("info", "api", "POST /generateLesson", { topic, cacheId: cacheId ?? null });
    const profile = loadProfile();
    const goalMode = deriveGoalMode(intent);
    const sessionId = createSession(profile.id, topic, intent, goalMode);
    const graph = await buildGraph(topic, profile, { cacheId, intent });
    const path = linearize(graph);
    const gameState = initializeGameState(sessionId, graph, path);
    const mapState = deriveMapState(graph, path, gameState);
    const cards = await generateCardsForNode(activeNode(graph, path));
    devLog("info", "api", "Generated lesson response", { sessionId, graphId: graph.id, nodes: graph.nodes.length, cards: cards.length, cacheId: cacheId ?? null });

    saveGraph(sessionId, graph);
    savePath(sessionId, path);
    saveGameState(sessionId, gameState);
    prefetchNextNodeCards(sessionId, graph, path);

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
    const cards = await generateCardsForNode(node);
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
    const sessionId = createSession(profile.id, topic, intent, goalMode);
    const graph = await buildGraph(topic, profile, { intent });
    graph.sourcePacketIds = Array.from(new Set(["image:gemma_vision", ...graph.sourcePacketIds]));
    const path = linearize(graph);
    const gameState = initializeGameState(sessionId, graph, path);
    const mapState = deriveMapState(graph, path, gameState);
    const cards = await generateCardsForNode(activeNode(graph, path));

    saveGraph(sessionId, graph);
    savePath(sessionId, path);
    saveGameState(sessionId, gameState);
    prefetchNextNodeCards(sessionId, graph, path);

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
    devLog("info", "api", "POST /tutor/respond", { sessionId, chars: studentMessage.length });
    res.json(await runStudentTurn(sessionId, studentMessage));
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
    return res.json(await runStudentTurn(event.sessionId, JSON.stringify(event.payload ?? {})));
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

export default router;
