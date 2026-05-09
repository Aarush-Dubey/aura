import type { GoalMode, KnowledgeGraph, LessonPath, StudentIntent } from "../types.js";

export function deriveGoalMode(intent: StudentIntent): GoalMode {
  if (intent.goalType === "application") return "application";
  if (intent.goalType === "exam") return "practice";
  if (intent.depthPreference === "intuition_only") return "beginner_intro";
  return "catch_up";
}

export function linearize(graph: KnowledgeGraph): LessonPath {
  return {
    graphId: graph.id,
    items: graph.nodes.map((node) => ({
      nodeId: node.id,
      deliveryMode: node.type === "application" ? "application" : "full",
      required: true,
      reason: "MVP ordered learning path"
    })),
    currentIndex: 0,
    skippedNodeIds: [],
    insertedNodeIds: [],
    reasonByNodeId: Object.fromEntries(graph.nodes.map((node) => [node.id, node.teachingGoal]))
  };
}
