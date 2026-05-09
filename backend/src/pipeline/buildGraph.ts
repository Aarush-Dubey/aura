import { graphPrompt } from "../llm/prompts.js";
import { callLLMJson } from "../llm/json.js";
import type { KnowledgeGraph, StudentProfile } from "../types.js";
import { fallbackGraph } from "./fallbacks.js";
import { buildGraphFromCachedExa } from "../exa/cacheInput.js";
import { devLog } from "../dev/logs.js";

export async function buildGraph(topic: string, profile: StudentProfile, options: { cacheId?: string } = {}): Promise<KnowledgeGraph> {
  const cached = buildGraphFromCachedExa(topic, profile, options.cacheId);
  if (cached) {
    devLog("info", "cache", options.cacheId ? "Using selected Exa cache" : "Using matched Exa cache", {
      graphId: cached.id,
      topic: cached.topic,
      sourcePacketIds: cached.sourcePacketIds
    });
    return cached;
  }

  try {
    devLog("info", "graph", "No usable cache selected/matched; trying LLM graph build", { topic, cacheId: options.cacheId ?? null });
    const p = graphPrompt(topic, profile);
    const out = await callLLMJson<{ concepts: { id: string; topicName: string; teachingGoal: string; keyTerms?: string[]; commonConfusions?: string[]; intuition?: string; example?: string; practiceStyle?: string }[] }>(p.system, p.user);
    const graph = fallbackGraph(topic, profile);
    if (!Array.isArray(out.concepts) || out.concepts.length < 3) return graph;
    const safeNodes = out.concepts.slice(0, 7);
    graph.nodes = safeNodes.map((concept, index) => ({
      ...graph.nodes[Math.min(index, graph.nodes.length - 1)],
      id: concept.id || graph.nodes[index]?.id,
      topicName: concept.topicName || graph.nodes[index]?.topicName,
      teachingGoal: concept.teachingGoal || graph.nodes[index]?.teachingGoal,
      keyTerms: concept.keyTerms?.slice(0, 6) ?? [topic],
      commonConfusions: concept.commonConfusions?.slice(0, 4) ?? [],
      microLessonPlan: {
        intuition: concept.intuition || graph.nodes[index]?.microLessonPlan.intuition,
        example: concept.example || graph.nodes[index]?.microLessonPlan.example,
        practiceStyle: concept.practiceStyle || "one short check"
      },
      status: index === 0 ? "active" : index === 1 ? "ready" : "locked"
    }));
    graph.edges = graph.nodes.slice(1).map((node, index) => ({ source: graph.nodes[index].id, target: node.id, relation: "prerequisite", reason: "ordered by learning readiness" }));
    return graph;
  } catch {
    devLog("warn", "graph", "LLM graph build unavailable; using local fallback graph", { topic });
    return fallbackGraph(topic, profile);
  }
}
