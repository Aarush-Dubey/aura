import type { GoalMode, KnowledgeGraph, LessonPath, StudentIntent } from "../types.js";

export function deriveGoalMode(intent: StudentIntent): GoalMode {
  if (intent.goalType === "application") return "application";
  if (intent.goalType === "exam") return "practice";
  if (intent.depthPreference === "intuition_only") return "beginner_intro";
  return "catch_up";
}

export function linearize(graph: KnowledgeGraph): LessonPath {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }

  const queue = graph.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id);
  const ordered: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (ordered.includes(id)) continue;
    ordered.push(id);
    for (const target of outgoing.get(id) ?? []) {
      incoming.set(target, Math.max(0, (incoming.get(target) ?? 0) - 1));
      if ((incoming.get(target) ?? 0) === 0) queue.push(target);
    }
  }
  for (const node of graph.nodes) {
    if (!ordered.includes(node.id)) ordered.push(node.id);
  }

  return {
    graphId: graph.id,
    items: ordered.map((nodeId) => {
      const node = byId.get(nodeId)!;
      const incomingReasons = graph.edges.filter((edge) => edge.target === node.id).map((edge) => edge.reason);
      return {
      nodeId: node.id,
      deliveryMode: node.type === "application" ? "application" : node.type === "practice" ? "practice" : node.type === "repair" ? "repair" : "full",
      required: node.type !== "repair",
      reason: incomingReasons[0] || node.evidence.find((entry) => entry.startsWith("Order reason:"))?.replace("Order reason: ", "") || node.teachingGoal
      };
    }),
    currentIndex: 0,
    skippedNodeIds: graph.nodes.filter((node) => !ordered.includes(node.id)).map((node) => node.id),
    insertedNodeIds: [],
    reasonByNodeId: Object.fromEntries(graph.nodes.map((node) => [node.id, node.teachingGoal]))
  };
}
