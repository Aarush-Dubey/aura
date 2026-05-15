import { createHash, randomUUID } from "node:crypto";
import type { KnowledgeGraph, LessonPath, StudentIntent, StudentProfile } from "../types.js";

type PrefixState = {
  sessionId: string;
  text: string;
  hash: string;
  chars: number;
  approximateTokens: number;
  sharedBy: Record<string, number>;
  lastMatchPct: number;
  lastJobType: string;
  lastUpdatedAt: string;
};

type BenchmarkResult = {
  status: "idle" | "running" | "complete" | "failed";
  coldTtftMs?: number;
  warmTtftMs?: number;
  delta?: number;
  note: string;
  updatedAt: string;
};

let activePrefix: PrefixState | null = null;
let benchmark: BenchmarkResult = {
  status: "idle",
  note: "Run the lab to measure whether LiteRT-LM is benefiting from repeated stable prefixes.",
  updatedAt: new Date().toISOString()
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)]));
}

function stableJson(value: unknown) {
  return JSON.stringify(stable(value));
}

function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex").slice(0, 10);
}

function approximateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function commonPrefixChars(a: string, b: string) {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a.charCodeAt(index) === b.charCodeAt(index)) index += 1;
  return index;
}

export function activateLessonPrefix(input: {
  sessionId: string;
  topic: string;
  profile: StudentProfile;
  intent: StudentIntent;
  graph: KnowledgeGraph;
  path: LessonPath;
}) {
  const compactGraph = {
    id: input.graph.id,
    topic: input.graph.topic,
    nodes: input.graph.nodes.map((node) => ({
      id: node.id,
      topicName: node.topicName,
      teachingGoal: node.teachingGoal,
      keyTerms: node.keyTerms,
      commonConfusions: node.commonConfusions,
      prerequisites: node.prerequisites,
      type: node.type
    })),
    edges: input.graph.edges
  };
  const prefix = [
    "AURA_SHARED_PREFIX_V1",
    "Runtime goal: maximize LiteRT-LM prompt/prefix cache reuse by keeping this section byte-stable across card, chat, quiz, repair, and evaluation calls.",
    "Tutor policy: calm, local-first, neurodivergent-friendly teaching. Output only the format requested by the task delta.",
    `Session: ${input.sessionId}`,
    `Topic: ${input.topic}`,
    `Intent: ${stableJson(input.intent)}`,
    `Learner: ${stableJson({
      readingMode: input.profile.readingMode,
      pace: input.profile.pace,
      dyslexiaMode: input.profile.dyslexiaMode,
      adhdSupport: input.profile.adhdSupport,
      prefers: input.profile.prefers,
      avoid: input.profile.avoid,
      strengths: input.profile.strengths,
      struggles: input.profile.struggles,
      recentPatterns: input.profile.recentPatterns
    })}`,
    `Graph: ${stableJson(compactGraph)}`,
    `Path: ${stableJson(input.path)}`
  ].join("\n");

  activePrefix = {
    sessionId: input.sessionId,
    text: prefix,
    hash: hashText(prefix),
    chars: prefix.length,
    approximateTokens: approximateTokens(prefix),
    sharedBy: {},
    lastMatchPct: 100,
    lastJobType: "activated",
    lastUpdatedAt: new Date().toISOString()
  };
}

export function activateBenchmarkPrefix() {
  const repeatedGraph = Array.from({ length: 10 }, (_, index) => ({
    id: `bench_node_${index + 1}`,
    topicName: `Benchmark concept ${index + 1}`,
    teachingGoal: "Explain one small part of the quadratic formula lesson.",
    keyTerms: ["quadratic", "coefficient", "discriminant"],
    commonConfusions: ["mixing up a b and c", "forgetting the plus-minus symbol"],
    prerequisites: index === 0 ? [] : [`bench_node_${index}`],
    type: index === 9 ? "practice" : "core"
  }));
  const prefix = [
    "AURA_SHARED_PREFIX_V1",
    "Runtime goal: maximize LiteRT-LM prompt/prefix cache reuse by keeping this section byte-stable across card, chat, quiz, repair, and evaluation calls.",
    "Tutor policy: calm, local-first, neurodivergent-friendly teaching. Output only the format requested by the task delta.",
    "Session: headless_benchmark",
    "Topic: quadratic formula",
    `Intent: ${stableJson({ goalType: "exam", timeHorizon: "single_session", depthPreference: "intuition_only" })}`,
    `Learner: ${stableJson({
      readingMode: "short_chunks",
      pace: "medium",
      dyslexiaMode: false,
      adhdSupport: true,
      prefers: ["examples first", "short cards"],
      avoid: ["dense paragraphs", "timed pressure"]
    })}`,
    `Graph: ${stableJson({ id: "benchmark_graph", topic: "quadratic formula", nodes: repeatedGraph, edges: repeatedGraph.slice(1).map((node, index) => ({ source: `bench_node_${index + 1}`, target: node.id, relation: "prerequisite" })) })}`,
    `Path: ${stableJson({ graphId: "benchmark_graph", currentIndex: 0, items: repeatedGraph.map((node) => ({ nodeId: node.id, deliveryMode: "full", required: true, reason: "benchmark path" })), skippedNodeIds: [], insertedNodeIds: [], reasonByNodeId: {} })}`
  ].join("\n");

  activePrefix = {
    sessionId: "headless_benchmark",
    text: prefix,
    hash: hashText(prefix),
    chars: prefix.length,
    approximateTokens: approximateTokens(prefix),
    sharedBy: {},
    lastMatchPct: 100,
    lastJobType: "benchmark_seed",
    lastUpdatedAt: new Date().toISOString()
  };
}

export function withSharedPrefix(prompt: string, jobType: string, useSharedPrefix = true) {
  if (!useSharedPrefix || !activePrefix) {
    return { prompt, meta: null };
  }
  const match = commonPrefixChars(activePrefix.text, activePrefix.text);
  const matchPct = Math.round((match / Math.max(activePrefix.text.length, 1)) * 1000) / 10;
  activePrefix.sharedBy[jobType] = (activePrefix.sharedBy[jobType] ?? 0) + 1;
  activePrefix.lastMatchPct = matchPct;
  activePrefix.lastJobType = jobType;
  activePrefix.lastUpdatedAt = new Date().toISOString();
  return {
    prompt: `${activePrefix.text}\n\nAURA_TASK_DELTA_V1\n${prompt}`,
    meta: {
      hash: activePrefix.hash,
      chars: activePrefix.chars,
      approximateTokens: activePrefix.approximateTokens,
      matchPct
    }
  };
}

export function prefixTelemetry() {
  return {
    active: Boolean(activePrefix),
    sessionId: activePrefix?.sessionId ?? null,
    hash: activePrefix?.hash ?? null,
    chars: activePrefix?.chars ?? 0,
    approximateTokens: activePrefix?.approximateTokens ?? 0,
    sharedBy: activePrefix?.sharedBy ?? {},
    lastMatchPct: activePrefix?.lastMatchPct ?? 0,
    lastJobType: activePrefix?.lastJobType ?? null,
    benchmark
  };
}

export function currentPrefixHash() {
  return activePrefix?.hash ?? null;
}

export function randomizedColdPrefix() {
  if (!activePrefix) return null;
  return activePrefix.text.replace("AURA_SHARED_PREFIX_V1", `AURA_COLD_PREFIX_${randomUUID()}`);
}

export function setPrefixBenchmark(next: BenchmarkResult) {
  benchmark = next;
}
