import { graphPrompt } from "../llm/prompts.js";
import { callLLMJson } from "../llm/json.js";
import type { KnowledgeGraph, StudentIntent, StudentProfile } from "../types.js";
import { fallbackGraph } from "./fallbacks.js";
import { buildGraphFromCachedExa } from "../exa/cacheInput.js";
import { devLog } from "../dev/logs.js";
import { createOrienCache } from "../research/orienSearch.js";

type PlannedConcept = {
  id: string;
  topicName: string;
  teachingGoal: string;
  keyTerms?: string[];
  commonConfusions?: string[];
  intuition?: string;
  example?: string;
  practiceStyle?: string;
  orderReason?: string;
  prerequisiteReason?: string;
  learnerFitReason?: string;
};

function slug(value: string, fallback: string) {
  const id = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
  return id || fallback;
}

async function buildGemmaPlannedGraph(topic: string, profile: StudentProfile, intent?: StudentIntent): Promise<KnowledgeGraph | null> {
  try {
    devLog("info", "graph", "Gemma planning sequential topic nodes", {
      topic,
      goal: intent?.goalType ?? null,
      depth: intent?.depthPreference ?? null,
      profile: {
        pace: profile.pace,
        readingMode: profile.readingMode,
        adhdSupport: profile.adhdSupport,
        dyslexiaMode: profile.dyslexiaMode
      }
    });
    const p = graphPrompt(topic, profile, intent);
    const out = await callLLMJson<{ concepts: PlannedConcept[] }>(p.system, p.user, 0.16, 180_000, 8192);
    if (!Array.isArray(out.concepts) || out.concepts.length < 3) return null;

    const base = fallbackGraph(topic, profile);
    const safeNodes = out.concepts.slice(0, 7);
    const nodes = safeNodes.map((concept, index) => {
      const template = base.nodes[Math.min(index, base.nodes.length - 1)];
      const id = slug(concept.id || concept.topicName, `node_${index + 1}`);
      const orderReason = concept.orderReason || (index === 0 ? "This is the gentlest entry point." : "This follows from the previous node.");
      const prerequisiteReason = concept.prerequisiteReason || "Earlier nodes prepare the needed vocabulary.";
      const learnerFitReason = concept.learnerFitReason || "This matches the current learner goal and profile.";
      return {
        ...template,
        id,
        topicName: concept.topicName || template.topicName,
        teachingGoal: concept.teachingGoal || template.teachingGoal,
        prerequisites: index === 0 ? [] : [slug(safeNodes[index - 1].id || safeNodes[index - 1].topicName, `node_${index}`)],
        keyTerms: concept.keyTerms?.slice(0, 6) ?? [topic],
        commonConfusions: concept.commonConfusions?.slice(0, 4) ?? [],
        teachingHints: [orderReason, prerequisiteReason, learnerFitReason],
        microLessonPlan: {
          intuition: concept.intuition || template.microLessonPlan.intuition,
          example: concept.example || template.microLessonPlan.example,
          practiceStyle: concept.practiceStyle || "one short check"
        },
        evidence: [
          `Order reason: ${orderReason}`,
          `Prerequisite reason: ${prerequisiteReason}`,
          `Learner fit: ${learnerFitReason}`
        ],
        mission: {
          title: concept.topicName || template.topicName,
          goal: concept.teachingGoal || template.teachingGoal,
          reward: index === 0 ? "The first planned block lights up." : "The next planned block becomes available."
        },
        status: index === 0 ? "active" as const : index === 1 ? "ready" as const : "locked" as const,
        type: index === safeNodes.length - 1 && intent?.goalType === "application" ? "application" as const : template.type ?? "core" as const
      };
    });

    const edges = nodes.slice(1).map((node, index) => ({
      source: nodes[index].id,
      target: node.id,
      relation: "prerequisite" as const,
      reason: node.evidence.find((entry) => entry.startsWith("Prerequisite reason:"))?.replace("Prerequisite reason: ", "") || "Gemma planned this order by prerequisite readiness."
    }));

    devLog("info", "graph", "Gemma planned sequential graph", {
      topic,
      nodes: nodes.map((node) => node.topicName),
      edges: edges.length
    });
    return {
      id: `gemma_${slug(topic, "topic")}`,
      topic,
      sourcePacketIds: ["gemma:planned_sequence"],
      nodes,
      edges
    };
  } catch (error) {
    devLog("warn", "graph", "Gemma sequential planning failed", { message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function buildGraph(topic: string, profile: StudentProfile, options: { cacheId?: string; intent?: StudentIntent } = {}): Promise<KnowledgeGraph> {
  if (options.cacheId) {
    const cached = buildGraphFromCachedExa(topic, profile, options.cacheId);
    if (cached) {
      const cacheKind = options.cacheId.startsWith("orien_") ? "OrienSearch" : "Exa";
      devLog("info", "cache", `Using selected ${cacheKind} cache`, {
        graphId: cached.id,
        topic: cached.topic,
        sourcePacketIds: cached.sourcePacketIds
      });
      return cached;
    }
  }

  if (!options.cacheId) {
    const planned = await buildGemmaPlannedGraph(topic, profile, options.intent);
    if (planned) return planned;
  }

  const orienCache = await createOrienCache(topic);
  if (orienCache) {
    const openGraph = buildGraphFromCachedExa(topic, profile, orienCache.id);
    if (openGraph) {
      devLog("info", "orien", "Using OrienSearch cache for graph", {
        graphId: openGraph.id,
        chunks: orienCache.chunks
      });
      return openGraph;
    }
  }

  try {
    devLog("info", "graph", "No usable cache selected/matched; trying LLM graph build", { topic, cacheId: options.cacheId ?? null });
    const p = graphPrompt(topic, profile, options.intent);
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
