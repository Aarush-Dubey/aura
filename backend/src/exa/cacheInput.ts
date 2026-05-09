import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import type { GraphEdge, KnowledgeGraph, KnowledgeNode, StudentProfile } from "../types.js";

type CachedCurriculum = {
  subject?: string;
  grade_level?: string;
  topics?: string[];
  learning_goals?: string[];
  constraints?: string[];
};

type CachedRawNode = {
  id: string;
  label: string;
  type?: string;
  difficulty?: number;
  source_url?: string;
  relations?: { to: string; type?: string }[];
  claims?: { claim?: string; evidence?: string; label?: string; source_url?: string }[];
};

type CachedChunk = {
  id: string;
  title?: string;
  source_url?: string;
  text?: string;
  score?: number;
};

type CachedClaim = {
  id: string;
  chunk_id?: string;
  label?: string;
  claim?: string;
  type?: string;
  difficulty?: number;
  source_url?: string;
  evidence?: string;
  confidence?: number;
};

type CachedLearnerNode = {
  id: string;
  label: string;
  status?: string;
  reason?: string;
  source?: string;
  scene_goal?: string;
  visual_type?: string;
  depends_on?: string[];
  replaces_raw_node_ids?: string[];
};

type CacheCandidate = {
  dir: string;
  id: string;
  topic: string;
  curriculum: CachedCurriculum;
  score: number;
  hasGraphInput: boolean;
};

const readJson = <T>(file: string): T | null => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
};

const words = (value: string) => new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2));

function scoreTopic(requested: string, candidate: string) {
  const a = words(requested);
  const b = words(candidate);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const word of a) if (b.has(word)) overlap += 1;
  return overlap / Math.max(a.size, b.size);
}

function cacheRoot() {
  const root = path.resolve(process.cwd(), CONFIG.exaCacheDir);
  return fs.existsSync(root) ? root : null;
}

function hasKnowledgeArtifacts(dir: string) {
  return fs.existsSync(path.join(dir, "learner_map.json")) ||
    fs.existsSync(path.join(dir, "graph.json")) ||
    (fs.existsSync(path.join(dir, "chunks.json")) && (fs.existsSync(path.join(dir, "claims.json")) || fs.existsSync(path.join(dir, "concepts.json"))));
}

export function listCachedExaInputs(topic = ""): CacheCandidate[] {
  const root = cacheRoot();
  if (!root) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(root, entry.name);
      const curriculum = readJson<CachedCurriculum>(path.join(dir, "curriculum.json"));
      if (!curriculum) return null;
      const candidateTopic = (curriculum.topics ?? []).join(" ");
      return {
        dir,
        id: entry.name,
        topic: candidateTopic,
        curriculum,
        score: scoreTopic(topic, candidateTopic),
        hasGraphInput: hasKnowledgeArtifacts(dir)
      };
    })
    .filter(Boolean)
    .map((candidate) => ({
      ...candidate!,
      score: topic ? scoreTopic(topic, candidate!.topic) : candidate!.score
    }))
    .sort((a, b) => Number(b.hasGraphInput) - Number(a.hasGraphInput) || b.score - a.score || a.topic.localeCompare(b.topic)) as CacheCandidate[];
}

export function findCachedExaInput(topic: string): CacheCandidate | null {
  if (!CONFIG.useExaCache) return null;
  const candidates = listCachedExaInputs(topic).filter((candidate) => candidate.hasGraphInput);

  return candidates.sort((a, b) => b.score - a.score)[0] ?? null;
}

export function getCachedExaInput(cacheId: string): CacheCandidate | null {
  const root = cacheRoot();
  if (!root) return null;
  const dir = path.join(root, cacheId);
  if (!fs.existsSync(dir)) return null;
  const curriculum = readJson<CachedCurriculum>(path.join(dir, "curriculum.json"));
  if (!curriculum) return null;
  return {
    dir,
    id: cacheId,
    topic: (curriculum.topics ?? []).join(" "),
    curriculum,
    score: 1,
    hasGraphInput: hasKnowledgeArtifacts(dir)
  };
}

function softCheck(nodeId: string, label: string, sourceIdea: string) {
  return {
    id: `${nodeId}_comfort`,
    nodeId,
    kind: "comfort" as const,
    prompt: `What does "${label}" mean in your own words?`,
    expectedIdea: sourceIdea || label,
    pressureLevel: "low" as const,
    evaluationMode: "semantic" as const
  };
}

function nodeFromLearnerMap(node: CachedLearnerNode, index: number): KnowledgeNode {
  const goal = node.scene_goal || node.reason || `Understand ${node.label}.`;
  return {
    id: node.id,
    topicName: node.label,
    teachingGoal: goal,
    prerequisites: node.depends_on ?? [],
    nextCandidates: [],
    sourceTags: node.replaces_raw_node_ids ?? [],
    keyTerms: node.label.split(/[\s/]+/).filter(Boolean).slice(0, 5),
    readinessCheck: { ...softCheck(node.id, node.label, goal), id: `${node.id}_ready`, kind: "readiness" },
    comfortCheck: softCheck(node.id, node.label, goal),
    microLessonPlan: {
      intuition: goal,
      example: node.reason || `Use one small example to make ${node.label} concrete.`,
      visualIdea: node.visual_type,
      practiceStyle: "one short check"
    },
    commonConfusions: ["the name and the purpose can blur together"],
    teachingHints: ["start with a tiny example"],
    repairStrategies: [{ confusion: "idea feels abstract", action: "give_example" }],
    status: index === 0 ? "active" : index === 1 ? "ready" : "locked",
    mastery: node.status === "known" ? 0.45 : 0,
    evidence: node.reason ? [node.reason] : [],
    mission: {
      title: node.label,
      goal,
      reward: index === 0 ? "The first block lights up." : "The next block becomes easier."
    },
    type: index > 0 && node.source === "generated_prerequisite" ? "bridge" : "core"
  };
}

function nodeFromRaw(node: CachedRawNode, index: number): KnowledgeNode {
  const claim = node.claims?.[0]?.claim ?? node.claims?.[0]?.evidence ?? `Understand ${node.label}.`;
  return {
    id: node.id,
    topicName: node.label,
    teachingGoal: claim,
    prerequisites: node.relations?.map((relation) => relation.to) ?? [],
    nextCandidates: [],
    sourceTags: node.source_url ? [node.source_url] : [],
    keyTerms: node.label.split(/\s+/).filter(Boolean).slice(0, 5),
    readinessCheck: { ...softCheck(node.id, node.label, claim), id: `${node.id}_ready`, kind: "readiness" },
    comfortCheck: softCheck(node.id, node.label, claim),
    microLessonPlan: {
      intuition: claim,
      example: node.claims?.[0]?.evidence || `Look for ${node.label} in a small worked example.`,
      practiceStyle: "one short check"
    },
    commonConfusions: [],
    teachingHints: ["connect the claim to the source example"],
    repairStrategies: [{ confusion: "source idea needs a simpler bridge", action: "reexplain" }],
    status: index === 0 ? "active" : index === 1 ? "ready" : "locked",
    mastery: 0,
    evidence: node.source_url ? [`Source: ${node.source_url}`] : [],
    mission: { title: node.label, goal: claim, reward: "A source-backed block lights up." },
    type: index > 5 ? "application" : "core"
  };
}

function compactEvidence(text = "") {
  return text.replace(/\s+/g, " ").trim().slice(0, 360);
}

function nodeFromClaim(claim: CachedClaim, chunk: CachedChunk | undefined, index: number): KnowledgeNode {
  const label = claim.label || chunk?.title || `Knowledge chunk ${index + 1}`;
  const sourceIdea = claim.claim || compactEvidence(claim.evidence || chunk?.text) || `Understand ${label}.`;
  const evidence = compactEvidence(claim.evidence || chunk?.text || "");
  const source = claim.source_url || chunk?.source_url;
  const type = claim.type === "example" ? "practice" : index > 8 ? "application" : "core";
  return {
    id: `cache_claim_${claim.id}`.replace(/[^a-zA-Z0-9_:-]/g, "_"),
    topicName: label,
    teachingGoal: sourceIdea,
    prerequisites: index === 0 ? [] : [],
    nextCandidates: [],
    sourceTags: source ? [source] : [],
    keyTerms: label.split(/\s+/).filter(Boolean).slice(0, 5),
    readinessCheck: { ...softCheck(`cache_claim_${claim.id}`, label, sourceIdea), id: `cache_claim_${claim.id}_ready`, kind: "readiness" },
    comfortCheck: softCheck(`cache_claim_${claim.id}`, label, sourceIdea),
    microLessonPlan: {
      intuition: sourceIdea,
      example: evidence || `Use the source chunk to make ${label} concrete.`,
      practiceStyle: claim.type === "example" ? "try the example slowly" : "one short check"
    },
    commonConfusions: ["the source detail and the main idea can blur together"],
    teachingHints: ["keep the source claim visible"],
    repairStrategies: [{ confusion: "source idea feels abstract", action: "give_example" }],
    status: index === 0 ? "active" : index === 1 ? "ready" : "locked",
    mastery: 0,
    evidence: evidence ? [evidence] : [],
    mission: {
      title: label,
      goal: sourceIdea,
      reward: index === 0 ? "The first source-backed block lights up." : "Another source-backed block becomes available."
    },
    type
  };
}

export function buildGraphFromCachedExa(topic: string, _profile: StudentProfile, cacheId?: string): KnowledgeGraph | null {
  const candidate = cacheId ? getCachedExaInput(cacheId) : findCachedExaInput(topic);
  if (!candidate || !candidate.hasGraphInput || (!cacheId && candidate.score <= 0)) return null;

  const learnerMap = readJson<{ nodes?: CachedLearnerNode[] }>(path.join(candidate.dir, "learner_map.json"));
  const rawGraph = readJson<{ nodes?: CachedRawNode[] }>(path.join(candidate.dir, "graph.json"));
  const chunks = readJson<CachedChunk[]>(path.join(candidate.dir, "chunks.json")) ?? [];
  const claims = readJson<CachedClaim[]>(path.join(candidate.dir, "claims.json")) ?? [];

  let nodes: KnowledgeNode[] = [];
  let edges: GraphEdge[] = [];

  if (learnerMap?.nodes?.length) {
    nodes = learnerMap.nodes.slice(0, 24).map(nodeFromLearnerMap);
    edges = nodes.flatMap((node) => node.prerequisites.map((source) => ({
      source,
      target: node.id,
      relation: "prerequisite" as const,
      reason: "cached learner-map dependency"
    }))).filter((edge) => nodes.some((node) => node.id === edge.source));
  } else if (rawGraph?.nodes?.length) {
    nodes = rawGraph.nodes.slice(0, 24).map(nodeFromRaw);
    edges = rawGraph.nodes.slice(0, 24).flatMap((node) => (node.relations ?? []).map((relation) => ({
      source: relation.to,
      target: node.id,
      relation: relation.type === "repair" ? "repair" as const : "prerequisite" as const,
      reason: "cached source graph relation"
    }))).filter((edge) => nodes.some((node) => node.id === edge.source && nodes.some((target) => target.id === edge.target)));
  } else if (claims.length || chunks.length) {
    const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const sourceClaims = claims.length
      ? claims
      : chunks.map((chunk) => ({ id: chunk.id, chunk_id: chunk.id, label: chunk.title, claim: compactEvidence(chunk.text), evidence: chunk.text, source_url: chunk.source_url }));
    nodes = sourceClaims
      .filter((claim) => claim.claim || claim.evidence || claim.label)
      .slice(0, 24)
      .map((claim, index) => nodeFromClaim(claim, claim.chunk_id ? chunkById.get(claim.chunk_id) : undefined, index));
    edges = nodes.slice(1).map((node, index) => ({
      source: nodes[index].id,
      target: node.id,
      relation: "prerequisite" as const,
      reason: "cached Exa claim sequence"
    }));
  }

  if (!nodes.length) return null;
  nodes.forEach((node, index) => {
    node.nextCandidates = edges.filter((edge) => edge.source === node.id).map((edge) => edge.target);
    node.status = index === 0 ? "active" : edges.some((edge) => edge.source === nodes[0].id && edge.target === node.id) || index === 1 ? "ready" : "locked";
  });

  return {
    id: `cache_${candidate.id}`,
    topic: candidate.topic || topic,
    sourcePacketIds: [`cache:${candidate.id}`],
    nodes,
    edges: edges.length ? edges : nodes.slice(1).map((node, index) => ({
      source: nodes[index].id,
      target: node.id,
      relation: "prerequisite",
      reason: "cached sequence"
    }))
  };
}
