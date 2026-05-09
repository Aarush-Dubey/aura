import type { GameState, KnowledgeGraph, MapState, NodeMissionMetadata, LessonPath } from "../types.js";

export function initializeGameState(sessionId: string, graph: KnowledgeGraph, path: LessonPath): GameState {
  const active = path.items[path.currentIndex]?.nodeId ?? graph.nodes[0]?.id;
  return {
    sessionId,
    theme: "block_world",
    activeMissionId: active,
    nodeVisualStates: Object.fromEntries(graph.nodes.map((node) => [node.id, node.status === "active" ? "active" : node.status === "ready" ? "ready" : "locked"])),
    unlockedNodeIds: graph.nodes.filter((node) => node.status === "active" || node.status === "ready").map((node) => node.id),
    completedMissionIds: [],
    discoveredSupportNodeIds: [],
    finalMissionUnlocked: false,
    recentEvents: active ? [{ type: "MISSION_STARTED", nodeId: active, title: graph.nodes[0]?.mission?.title ?? graph.nodes[0]?.topicName ?? "First block" }] : []
  };
}

export function deriveMapState(graph: KnowledgeGraph, path: LessonPath, gameState: GameState): MapState {
  const activeNodeId = path.items[path.currentIndex]?.nodeId ?? graph.nodes[0]?.id ?? "";
  const columns = Math.max(1, Math.ceil(graph.nodes.length / 2));
  return {
    activeNodeId,
    nodes: graph.nodes.map((node, index) => {
      const row = index % 2;
      const col = Math.floor(index / 2);
      return {
        id: node.id,
        label: node.topicName,
        x: 120 + col * (760 / Math.max(1, columns - 1 || 1)),
        y: row === 0 ? 140 : 330,
        type: node.type === "application" ? "boss" : node.type === "repair" ? "repair" : "core",
        state: gameState.nodeVisualStates[node.id] ?? (node.status === "active" ? "active" : "locked")
      };
    }),
    edges: graph.edges.map((edge) => ({
      from: edge.source,
      to: edge.target,
      state: edge.relation === "repair" ? "repair" : gameState.completedMissionIds.includes(edge.source) ? "completed" : edge.source === activeNodeId ? "active" : "inactive"
    }))
  };
}

export function collectMissionMetadata(graph: KnowledgeGraph): Record<string, NodeMissionMetadata> {
  return Object.fromEntries(graph.nodes.map((node) => [node.id, {
    nodeId: node.id,
    missionTitle: node.mission?.title ?? node.topicName,
    objective: node.mission?.goal ?? node.teachingGoal,
    rewardText: node.mission?.reward ?? "A new block lights up.",
    missionType: node.type === "application" ? "application" : node.type === "repair" ? "repair" : "core",
    difficultyTone: node.type === "repair" ? "gentle" : "normal"
  }]));
}
