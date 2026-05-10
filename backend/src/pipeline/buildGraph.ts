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
  dependsOn?: string[];
  nodeType?: "core" | "bridge" | "repair" | "practice" | "application";
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

function nodeType(value: PlannedConcept["nodeType"] | undefined, index: number, lastIndex: number, intent?: StudentIntent) {
  if (value === "bridge" || value === "repair" || value === "practice" || value === "application" || value === "core") return value;
  if (index === lastIndex && intent?.goalType === "application") return "application";
  if (index >= lastIndex - 1 && intent?.goalType === "exam") return "practice";
  return "core";
}

async function buildGemmaPlannedGraph(topic: string, profile: StudentProfile, intent?: StudentIntent): Promise<KnowledgeGraph | null> {
  try {
    devLog("info", "graph", "Gemma planning comprehensive topic graph", {
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
    let out = await callLLMJson<{ concepts?: PlannedConcept[]; schema?: PlannedConcept[] }>(p.system, p.user, 0.16, 180_000, 12000);
    let plannedConcepts = Array.isArray(out.concepts) ? out.concepts : Array.isArray(out.schema) ? out.schema : [];
    const minNodes = intent?.depthPreference === "intuition_only" ? 7 : intent?.depthPreference === "deep_mechanical" ? 9 : 8;
    if (plannedConcepts.length < minNodes) {
      devLog("warn", "graph", "Gemma graph plan was too short; asking for fuller map", { nodes: plannedConcepts.length, minNodes });
      const retryUser = {
        ...JSON.parse(p.user),
        previousAttemptIssue: `The previous plan had only ${plannedConcepts.length} nodes. Regenerate a fuller map with at least ${minNodes} nodes. Put the node array in the "concepts" field. Include bridge/support nodes, core rules, special cases, worked example, misconception repair, and final practice/application.`
      };
      out = await callLLMJson<{ concepts?: PlannedConcept[]; schema?: PlannedConcept[] }>(p.system, JSON.stringify(retryUser), 0.14, 180_000, 12000);
      plannedConcepts = Array.isArray(out.concepts) ? out.concepts : Array.isArray(out.schema) ? out.schema : [];
    }
    if (plannedConcepts.length < 4) return null;

    const base = fallbackGraph(topic, profile);
    const safeNodes = plannedConcepts.slice(0, 12);
    const idByIndex = safeNodes.map((concept, index) => slug(concept.id || concept.topicName, `node_${index + 1}`));
    const knownIds = new Set(idByIndex);
    const nodes = safeNodes.map((concept, index) => {
      const template = base.nodes[Math.min(index, base.nodes.length - 1)];
      const id = idByIndex[index];
      const orderReason = concept.orderReason || (index === 0 ? "This is the gentlest entry point." : "This follows from the previous node.");
      const prerequisiteReason = concept.prerequisiteReason || "Earlier nodes prepare the needed vocabulary.";
      const learnerFitReason = concept.learnerFitReason || "This matches the current learner goal and profile.";
      const dependsOn = (concept.dependsOn ?? [])
        .map((dep, depIndex) => slug(dep, `node_${depIndex + 1}`))
        .filter((dep) => dep !== id && knownIds.has(dep));
      const fallbackPrerequisite = index === 0 ? [] : [idByIndex[index - 1]];
      const prerequisites = index === 0 ? [] : dependsOn.length ? dependsOn : fallbackPrerequisite;
      const type = nodeType(concept.nodeType, index, safeNodes.length - 1, intent);
      return {
        ...template,
        id,
        topicName: concept.topicName || template.topicName,
        teachingGoal: concept.teachingGoal || template.teachingGoal,
        prerequisites,
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
          reward: type === "repair" ? "A shaky idea gets a steadier bridge." : index === 0 ? "The first planned block lights up." : "The next planned block becomes available."
        },
        status: index === 0 ? "active" as const : index === 1 ? "ready" as const : "locked" as const,
        type
      };
    });

    const edges = nodes.flatMap((node) => node.prerequisites.map((source) => ({
      source,
      target: node.id,
      relation: "prerequisite" as const,
      reason: node.evidence.find((entry) => entry.startsWith("Prerequisite reason:"))?.replace("Prerequisite reason: ", "") || "Gemma planned this order by prerequisite readiness."
    }))).filter((edge) => nodes.some((node) => node.id === edge.source && node.id !== edge.target));

    devLog("info", "graph", "Gemma planned comprehensive graph", {
      topic,
      nodes: nodes.map((node) => ({ title: node.topicName, type: node.type, prerequisites: node.prerequisites })),
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
    devLog("warn", "graph", "Gemma comprehensive planning failed", { message: error instanceof Error ? error.message : String(error) });
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
