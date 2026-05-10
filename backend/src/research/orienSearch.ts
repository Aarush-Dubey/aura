import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONFIG } from "../config.js";
import { devLog } from "../dev/logs.js";
import { ensureOrienSearch } from "./runtime.js";
import { ensureLocalLLM } from "../llm/runtime.js";
import { callLLMJson } from "../llm/json.js";

type SearxngResult = {
  title?: string;
  content?: string;
  url?: string;
  score?: number;
  query?: string;
  intent?: ResearchIntent;
};

type SearxngResponse = {
  results?: SearxngResult[];
};

export type OrienCache = {
  id: string;
  dir: string;
  chunks: number;
};

type ResearchIntent = "overview" | "concepts" | "formula" | "examples" | "misconceptions" | "practice";

type ResearchPlan = {
  intent: ResearchIntent;
  label: string;
  query: string;
  reason?: string;
};

type ResearchChunk = {
  id: string;
  title: string;
  text: string;
  score: number;
};

type ResearchClaim = {
  id: string;
  chunk_id: string;
  label: string;
  claim: string;
  type: "concept" | "example" | "misconception" | "practice";
  evidence: string;
  confidence: number;
};

type PlannerOutput = {
  topicUnderstanding: string;
  queryVersions: {
    intent: ResearchIntent;
    label: string;
    query: string;
    reason: string;
  }[];
};

type SupervisorOutput = {
  chunks: {
    title: string;
    text: string;
    type: ResearchClaim["type"];
    teachingGoal: string;
    evidenceIds: string[];
  }[];
  rejectedEvidenceIds?: string[];
  notes?: string;
};

type IntentSupervisorOutput = {
  title: string;
  text: string;
  type: ResearchClaim["type"];
  teachingGoal: string;
  usedEvidenceIds: string[];
  quality: "use" | "weak";
  note?: string;
};

type FinalSupervisorOutput = {
  chunks: {
    title: string;
    text: string;
    type: ResearchClaim["type"];
    teachingGoal: string;
  }[];
};

type GemmaKnowledgeOutput = {
  chunks: {
    title: string;
    text: string;
    type: ResearchClaim["type"];
    teachingGoal: string;
    keyTerms?: string[];
  }[];
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cacheRoot() {
  return path.resolve(process.cwd(), CONFIG.exaCacheDir);
}

function stableId(topic: string) {
  return `orien_${crypto.createHash("sha1").update(topic.toLowerCase().trim()).digest("hex").slice(0, 14)}`;
}

function compactText(value = "", limit = 4000) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function cleanPageText(value = "", limit = 9000) {
  const compact = compactText(value, limit * 2);
  const sentences = compact
    .split(/(?<=[.!?])\s+|(?:\s*#{1,4}\s*)|(?:\s*•\s*)/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part.length > 35)
    .filter((part) => !/login|sign in|download pdf|free pdf|free demo|advertisement|cookie|privacy policy|all courses|popular book solutions|please purchase|displaying ads|latest blogs|book free demo|online tuition|leave a reply|table of contents/i.test(part))
    .filter((part) => !/(class 6|class 7|class 8|class 9|class 11|class 12).{0,80}(class 10|probability|maths)/i.test(part));
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const sentence of sentences) {
    const key = sentence.toLowerCase().replace(/[^a-z0-9]+/g, " ").slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(sentence);
    if (kept.join(" ").length >= limit) break;
  }
  return kept.join(" ").slice(0, limit);
}

function stripSourceHeading(sentence: string) {
  return sentence
    .replace(/^(NCERT|CBSE|Class\s*\d+|Probability)\s+[^.]{0,120}(PDF|Solutions|Notes|Chapter|Exercise|Vedantu|BYJU'?S|Teachoo|SparkEd)[^.:]*[.:]\s*/i, "")
    .replace(/^(NCERT|CBSE)\s+[^.]{0,120}\|\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTeachingSentence(sentence: string) {
  const cleaned = stripSourceHeading(sentence);
  if (cleaned.length < 45) return false;
  if (/download|pdf|login|course|tuition|subscription|updated on|latest blogs|ask questions|board exam score|study material|number of questions solved|category ncert solutions|hindi medium|textbook solutions/i.test(cleaned)) return false;
  if (/(NCERT|CBSE|Vedantu|BYJU'?S|Teachoo|SparkEd|Tiwari Academy).{0,80}(Solutions|PDF|Chapter|Notes|Exercise)/i.test(cleaned) && !/(P\s*\(|sample space|favourable|favorable|event|outcome|equally likely|impossible|sure|complementary)/i.test(cleaned)) return false;
  return /probability|event|outcome|sample space|equally likely|favourable|favorable|impossible|sure|complementary|coin|dice|card|experiment|formula|P\s*\(/i.test(cleaned);
}

function safeTitle(value: string | undefined, fallback: string) {
  const title = compactText(value ?? "", 120);
  return title || fallback;
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.length <= 3 ? word : `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function topicCore(topic: string) {
  return titleCase(topic.replace(/\b(class|grade)\s*\d+\b/gi, "").replace(/\b(cbse|maths|mathematics|science)\b/gi, "").trim() || topic);
}

function cleanTopicWords(topic: string) {
  return topic.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
}

function researchPlan(topic: string): ResearchPlan[] {
  const t = topic.trim();
  return [
    { intent: "overview", label: "core idea", query: `${t} clear explanation for students definition intuition` },
    { intent: "concepts", label: "key concepts", query: `${t} important concepts outcomes events terms notes` },
    { intent: "formula", label: "formula and rules", query: `${t} formula rules complementary impossible sure event` },
    { intent: "examples", label: "worked examples", query: `${t} worked examples coin dice cards step by step` },
    { intent: "misconceptions", label: "common mistakes", query: `${t} common mistakes misconceptions equally likely outcomes` },
    { intent: "practice", label: "exam practice", query: `${t} practice questions solved examples NCERT exercise` }
  ];
}

async function planResearchWithGemma(topic: string): Promise<ResearchPlan[]> {
  const status = await ensureLocalLLM();
  if (!status.ready) throw new Error(status.detail || status.setup?.message || "Gemma planner is not ready.");

  const system = [
    "You are Aura's local research planner. You only plan search queries; you do not teach yet.",
    "The goal is to gather enough evidence to build a meaningful class-ready lesson packet.",
    "Rewrite the learner topic into multiple focused web-search queries.",
    "Rules:",
    "- Use the learner's class/grade if present.",
    "- Create different query versions for: overview, concepts, formula, examples, misconceptions, practice.",
    "- Prefer educational source language: notes, examples, worked examples, common mistakes, NCERT/CBSE when relevant.",
    "- Avoid broad or SEO-only queries like just the topic name.",
    "- Return valid JSON only."
  ].join("\n");
  const output = await callLLMJson<PlannerOutput>(system, JSON.stringify({
    task: "Create focused query versions for local open web research.",
    topic,
    allowedIntents: ["overview", "concepts", "formula", "examples", "misconceptions", "practice"],
    schema: {
      topicUnderstanding: "one sentence",
      queryVersions: [{ intent: "overview|concepts|formula|examples|misconceptions|practice", label: "short label", query: "search query", reason: "why this version exists" }]
    }
  }), 0.2);

  const seen = new Set<string>();
  const planned = (output.queryVersions ?? [])
    .filter((item) => item.intent && item.query)
    .filter((item) => {
      const key = `${item.intent}:${item.query.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10)
    .map((item) => ({
      intent: item.intent,
      label: item.label || item.intent,
      query: item.query,
      reason: item.reason
    }));
  return planned.length >= 4 ? planned : researchPlan(topic);
}

async function searxngSearch(topic: string): Promise<SearxngResult[]> {
  const url = new URL(CONFIG.orienSearxngUrl);
  url.searchParams.set("q", topic);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("safesearch", "1");

  const response = await fetch(url, { signal: AbortSignal.timeout(CONFIG.orienFetchTimeoutMs) });
  if (!response.ok) throw new Error(`SearXNG error ${response.status}: ${await response.text()}`);
  const data = await response.json() as SearxngResponse;
  return (data.results ?? [])
    .filter((result) => result.title || result.content || result.url)
    .slice(0, Math.max(1, CONFIG.orienMaxResults));
}

function decodeHtml(value = "") {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, "\"");
}

function duckUrl(value: string) {
  try {
    const decoded = decodeURIComponent(value).replace(/&amp;/g, "&");
    const parsed = new URL(decoded.startsWith("//") ? `https:${decoded}` : decoded);
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : parsed.toString();
  } catch {
    return value;
  }
}

async function duckDuckGoHtmlSearch(topic: string): Promise<SearxngResult[]> {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", topic);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 AuraLocalResearch/0.1",
      "Accept": "text/html"
    },
    signal: AbortSignal.timeout(CONFIG.orienFetchTimeoutMs)
  });
  if (!response.ok) throw new Error(`DuckDuckGo HTML error ${response.status}: ${await response.text()}`);
  const html = await response.text();
  const matches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)];
  return matches.slice(0, Math.max(1, CONFIG.orienMaxResults)).map((match, index) => ({
    url: duckUrl(decodeHtml(match[1] ?? "")),
    title: compactText(decodeHtml(match[2] ?? ""), 180),
    content: compactText(decodeHtml(match[3] ?? ""), 700),
    score: scoreChunk(topic, `${match[2] ?? ""} ${match[3] ?? ""}`, index)
  }));
}

async function openSearch(topic: string): Promise<SearxngResult[]> {
  try {
    return await searxngSearch(topic);
  } catch (error) {
    devLog("warn", "orien", "SearXNG unavailable; falling back to DuckDuckGo HTML", {
      message: error instanceof Error ? error.message : String(error)
    });
    return duckDuckGoHtmlSearch(topic);
  }
}

async function extractPage(url: string | undefined) {
  if (!url || !/^https?:\/\//i.test(url)) return "";
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "AuraLocalResearch/0.1"
      },
      signal: AbortSignal.timeout(CONFIG.orienFetchTimeoutMs)
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return "";
    return cleanPageText(await response.text());
  } catch {
    return "";
  }
}

function scoreChunk(topic: string, text: string, rank: number) {
  const words = cleanTopicWords(topic);
  const lower = text.toLowerCase();
  const overlap = words.filter((word) => lower.includes(word)).length;
  return Number((0.65 + Math.min(0.25, overlap * 0.05) + Math.max(0, 0.1 - rank * 0.015)).toFixed(3));
}

function resultKey(result: SearxngResult) {
  if (!result.url) return `${result.title ?? ""}:${result.content ?? ""}`.toLowerCase().slice(0, 120);
  try {
    const url = new URL(result.url);
    url.hash = "";
    url.search = "";
    return `${url.hostname}${url.pathname}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return result.url.toLowerCase();
  }
}

function domainBoost(url = "") {
  if (/ncert|cbse|teachoo|khanacademy|libretexts|openupresources|ck12|mathsisfun|geeksforgeeks|learncbse/i.test(url)) return 0.08;
  if (/byjus|vedantu/i.test(url)) return 0.03;
  return 0;
}

async function collectResearch(topic: string, plan: ResearchPlan[]) {
  const byKey = new Map<string, SearxngResult>();
  for (const item of plan) {
    devLog("info", "orien", "Running focused research query", { intent: item.intent, query: item.query });
    const results = await openSearch(item.query);
    for (const result of results) {
      const key = resultKey(result);
      const current = byKey.get(key);
      const scored = {
        ...result,
        query: item.query,
        intent: item.intent,
        score: (typeof result.score === "number" ? result.score : 0.72) + domainBoost(result.url)
      };
      if (!current || (scored.score ?? 0) > (current.score ?? 0)) byKey.set(key, scored);
    }
  }
  return [...byKey.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, Math.max(8, CONFIG.orienMaxResults * 3));
}

function evidenceId(index: number) {
  return `ev_${index + 1}`;
}

function compactEvidencePacket(topic: string, results: SearxngResult[], extracted: string[]) {
  const rows = results.map((result, index) => ({
    result,
    extracted: extracted[index] ?? "",
    originalIndex: index
  }));
  const selected: typeof rows = [];
  for (const intent of ["overview", "concepts", "formula", "examples", "misconceptions", "practice"] as ResearchIntent[]) {
    selected.push(...rows.filter((row) => (row.result.intent ?? "overview") === intent).slice(0, 2));
  }
  if (!selected.length) selected.push(...rows.slice(0, 6));
  return selected.slice(0, 12).map((row, index) => ({
    id: evidenceId(index),
    intent: row.result.intent ?? "overview",
    query: row.result.query ?? topic,
    title: safeTitle(row.result.title, `${topic} source ${row.originalIndex + 1}`),
    snippet: compactText(row.result.content ?? "", 160),
    passage: compactText(row.extracted, 280),
    score: row.result.score ?? 0
  })).filter((item) => item.snippet || item.passage);
}

async function superviseResearchWithGemma(topic: string, plan: ResearchPlan[], evidence: ReturnType<typeof compactEvidencePacket>): Promise<SupervisorOutput> {
  const status = await ensureLocalLLM();
  if (!status.ready) throw new Error(status.detail || status.setup?.message || "Gemma supervisor is not ready.");

  const system = [
    "You are Aura's local research supervisor and curriculum distiller.",
    "You receive noisy web evidence gathered by the planner. Your job is to turn it into clean teaching chunks.",
    "Hard rules:",
    "- Do not copy SEO headings, source titles, download text, login text, course ads, or navigation.",
    "- Do not summarize source pages as pages. Write teachable content for the learner.",
    "- Make each chunk a useful lesson ingredient: concept, formula/rule, worked example, misconception, or practice.",
    "- Use plain class-10-friendly language.",
    "- Preserve math notation where useful.",
    "- Every chunk must be self-contained and meaningful without source URLs.",
    "- Reject weak evidence instead of using it.",
    "- Return valid JSON only."
  ].join("\n");

  return callLLMJson<SupervisorOutput>(system, JSON.stringify({
    task: "Synthesize final Orien research chunks from noisy evidence.",
    topic,
    plannerQueries: plan.map((item) => ({ intent: item.intent, query: item.query, reason: item.reason })),
    evidence,
    outputRules: {
      chunkCount: "4 to 7 chunks, fewer if evidence is weak",
      title: "short learning-node title, not a source title",
      text: "120 to 260 words of clean teachable content; may include a tiny worked example",
      teachingGoal: "one sentence saying what the learner can do after this chunk",
      evidenceIds: "ids of evidence used",
      type: "concept|example|misconception|practice"
    },
    schema: {
      chunks: [{
        title: "string",
        text: "string",
        type: "concept|example|misconception|practice",
        teachingGoal: "string",
        evidenceIds: ["ev_1"]
      }],
      rejectedEvidenceIds: ["ev_2"],
      notes: "short quality note"
    }
  }), 0.15, 120_000, 4096);
}

async function superviseIntentWithGemma(topic: string, plan: ResearchPlan, evidence: ReturnType<typeof compactEvidencePacket>): Promise<IntentSupervisorOutput> {
  const status = await ensureLocalLLM();
  if (!status.ready) throw new Error(status.detail || status.setup?.message || "Gemma supervisor is not ready.");

  const system = [
    "You are Aura's local research supervisor.",
    "You receive a few noisy search snippets/passages for one learning intent.",
    "Create exactly one clean teaching chunk for a class 10 learner.",
    "Hard rules:",
    "- Do not copy source titles, SEO text, download text, login text, ads, navigation, or page descriptions.",
    "- Do not say where the evidence came from.",
    "- Write a useful learning chunk, not a search-result summary.",
    "- Stay tightly on the requested intent. Do not turn every intent into a generic overview.",
    "- If intent is not overview, do not begin by defining probability. Start directly with that intent.",
    "- Use a title that names the intent: Core Idea, Sample Space, Formula Rules, Worked Example, Common Mistake, or Practice.",
    "- For formulas, use plain text like P(E) = favourable outcomes / total outcomes. Do not use LaTeX commands.",
    "- If the evidence is weak, still return JSON with quality='weak'.",
    "- Use plain language and useful math notation.",
    "- Return valid JSON only."
  ].join("\n");

  return callLLMJson<IntentSupervisorOutput>(system, JSON.stringify({
    topic,
    intent: plan.intent,
    queryVersion: plan.query,
    plannerReason: plan.reason,
    requiredFocus: {
      overview: "define the big idea without going deep into formulas; title should include Core Idea",
      concepts: "explain experiment, outcome, sample space, event, and favourable outcome; title should include Sample Space or Outcomes",
      formula: "explain P(E) = favourable outcomes / total outcomes, plus impossible, sure, and complementary events; title should include Formula Rules",
      examples: "show one tiny worked example with coin, die, cards, or balls; title should include Worked Example",
      misconceptions: "name specific mistakes and how to avoid them; title should include Common Mistake",
      practice: "describe useful practice question types and what each trains; title should include Practice"
    }[plan.intent],
    evidence: evidence.slice(0, 2),
    schema: {
      title: "short learning title, not source title",
      text: "90 to 170 words of clean teachable explanation for this intent",
      type: "concept|example|misconception|practice",
      teachingGoal: "one sentence describing what learner can do after this chunk",
      usedEvidenceIds: ["ev_1"],
      quality: "use|weak",
      note: "short reason"
    }
  }), 0.1, 90_000, 1024);
}

async function finalPolishWithGemma(topic: string, chunks: {
  title: string;
  text: string;
  type: ResearchClaim["type"];
  teachingGoal: string;
}[]): Promise<FinalSupervisorOutput> {
  const status = await ensureLocalLLM();
  if (!status.ready) throw new Error(status.detail || status.setup?.message || "Gemma final supervisor is not ready.");

  const system = [
    "You are Aura's final research supervisor.",
    "You receive draft teaching chunks. Your job is to remove repetition and produce the final research packet.",
    "Rules:",
    "- Keep only distinct chunks. Do not repeat the same probability definition in every chunk.",
    "- Preserve a useful learning arc: core idea, terms/sample space, formula/rules, worked example, common mistake or practice.",
    "- Rewrite titles so each title clearly names a different node.",
    "- Rewrite broken formulas. Use plain notation, e.g. P(E) = favourable outcomes / total outcomes.",
    "- No source names, SEO text, URLs, PDF/download language, or page descriptions.",
    "- Return valid JSON only."
  ].join("\n");

  return callLLMJson<FinalSupervisorOutput>(system, JSON.stringify({
    topic,
    draftChunks: chunks.map((chunk) => ({
      title: chunk.title,
      type: chunk.type,
      teachingGoal: chunk.teachingGoal,
      text: compactText(chunk.text, 650)
    })),
    schema: {
      chunks: [{
        title: "distinct learning-node title",
        text: "100 to 220 words, clean teaching content",
        type: "concept|example|misconception|practice",
        teachingGoal: "one sentence"
      }]
    }
  }), 0.1, 120_000, 4096);
}

function extractBestPassage(topic: string, intent: ResearchIntent, title: string, content: string, page: string) {
  const words = cleanTopicWords(`${topic} ${intent}`).filter((word) => !["class", "grade"].includes(word));
  const sentences = cleanPageText(`${content}. ${page}`, 10000)
    .split(/(?<=[.!?])\s+/g)
    .map((part) => stripSourceHeading(part.trim()))
    .filter((part) => part.length > 45 && part.length < 520)
    .filter(isTeachingSentence);
  const intentWords: Record<ResearchIntent, string[]> = {
    overview: ["definition", "means", "chance", "possibility", "concept"],
    concepts: ["outcome", "event", "experiment", "equally", "likely", "sample"],
    formula: ["formula", "probability", "ratio", "complement", "sure", "impossible"],
    examples: ["example", "coin", "dice", "card", "bag", "solution"],
    misconceptions: ["cannot", "not", "mistake", "equally", "likely", "between"],
    practice: ["question", "exercise", "find", "solve", "answer"]
  };
  const ranked = sentences
    .map((sentence, index) => {
      const lower = sentence.toLowerCase();
      const topicHits = words.filter((word) => lower.includes(word)).length;
      const intentHits = intentWords[intent].filter((word) => lower.includes(word)).length;
      const noisePenalty = /download|pdf|login|course|tuition|subscription/i.test(sentence) ? 4 : 0;
      return { sentence, score: topicHits * 2 + intentHits * 3 - noisePenalty - index * 0.02 };
    })
    .sort((a, b) => b.score - a.score);
  const picked: string[] = [];
  for (const item of ranked) {
    if (item.score < 1 && picked.length >= 3) continue;
    if (picked.some((sentence) => sentence.toLowerCase().includes(item.sentence.toLowerCase().slice(0, 80)))) continue;
    picked.push(item.sentence);
    if (picked.join(" ").length > 1800 || picked.length >= 8) break;
  }
  const passage = picked.length ? picked.join(" ") : cleanPageText(`${content}. ${page}`, 1800);
  return compactText(passage, 2200);
}

function claimType(intent: ResearchIntent): ResearchClaim["type"] {
  if (intent === "examples") return "example";
  if (intent === "misconceptions") return "misconception";
  if (intent === "practice") return "practice";
  return "concept";
}

function normalizeClaimType(value: unknown, intent: ResearchIntent): ResearchClaim["type"] {
  return value === "concept" || value === "example" || value === "misconception" || value === "practice"
    ? value
    : claimType(intent);
}

async function buildGemmaKnowledgePacket(topic: string) {
  const status = await ensureLocalLLM();
  if (!status.ready) {
    devLog("warn", "orien", "Gemma knowledge-only cache requires local LLM", { detail: status.detail, setup: status.setup });
    return { chunks: [], claims: [] };
  }

  const system = [
    "You are Aura's local Gemma-only curriculum generator.",
    "You must generate a clean teaching packet from your own model knowledge only.",
    "Do not use web search, Exa, URLs, source names, citations, page titles, or external APIs.",
    "Hard rules:",
    "- Produce 5 to 7 distinct chunks.",
    "- The chunks must form a useful learning arc: core idea, vocabulary/sample space, formula/rules, worked example, common mistakes, practice/checkpoint.",
    "- Each chunk must be self-contained and teachable.",
    "- Do not repeat the same definition in every chunk.",
    "- Titles must match the actual example/content in the chunk. Do not title a die example as a coin-flip chunk.",
    "- Use class/grade level from the topic if present.",
    "- Use plain math notation like P(E) = favourable outcomes / total outcomes.",
    "- No LaTeX commands such as \\frac or \\text in this research packet.",
    "- No SEO language, source language, or textbook-page descriptions.",
    "- Return valid JSON only."
  ].join("\n");

  const output = await callLLMJson<GemmaKnowledgeOutput>(system, JSON.stringify({
    task: "Generate a Gemma-only local teaching chunk packet.",
    topic,
    chunkRequirements: {
      title: "short distinct learning-node title",
      text: "140 to 260 words of teaching content with one focused idea",
      teachingGoal: "one sentence: what the learner can do after this chunk",
      type: "concept|example|misconception|practice",
      keyTerms: "2 to 6 terms"
    },
    schema: {
      chunks: [{
        title: "string",
        text: "string",
        type: "concept|example|misconception|practice",
        teachingGoal: "string",
        keyTerms: ["string"]
      }]
    }
  }), 0.18, 180_000, 8192);

  const chunks = (output.chunks ?? [])
    .filter((chunk) => chunk.title && chunk.text && chunk.teachingGoal)
    .slice(0, 7)
    .map((chunk, index) => ({
      id: `orien_chunk_${index + 1}`,
      title: compactText(chunk.title, 100),
      text: compactText(chunk.text, 2800),
      score: Number((0.95 - index * 0.02).toFixed(3)),
      type: normalizeClaimType(chunk.type, index === 3 ? "examples" : index === 4 ? "misconceptions" : index === 5 ? "practice" : "concepts"),
      teachingGoal: compactText(chunk.teachingGoal, 420)
    }));

  const claims = chunks.map((chunk, index) => ({
    id: `orien_claim_${index + 1}`,
    chunk_id: chunk.id,
    label: chunk.title,
    claim: chunk.teachingGoal,
    type: chunk.type,
    evidence: chunk.text,
    confidence: Number(Math.max(0.78, chunk.score).toFixed(2))
  } satisfies ResearchClaim));

  devLog("info", "orien", "Gemma generated knowledge-only Orien packet", { topic, chunks: chunks.length });
  return { chunks: chunks.map(({ type, teachingGoal, ...chunk }) => chunk), claims };
}

function claimFromChunk(topic: string, chunk: ResearchChunk, intent: ResearchIntent, index: number): ResearchClaim {
  const core = topicCore(topic);
  const labelByIntent: Record<ResearchIntent, string> = {
    overview: `${core}: Core Idea`,
    concepts: `${core}: Outcomes and Events`,
    formula: `${core}: Formula and Rules`,
    examples: `${core}: Worked Examples`,
    misconceptions: `${core}: Common Mistakes`,
    practice: `${core}: Exam Practice`
  };
  const leadByIntent: Record<ResearchIntent, string> = {
    overview: `${topicCore(topic)} is about measuring how likely an event is, using clear outcomes instead of guesses.`,
    concepts: `To use ${topicCore(topic)}, identify the experiment, the sample space, the event, and the favourable outcomes.`,
    formula: `The main rule is P(E) = favourable outcomes / total equally likely outcomes, with impossible events at 0 and sure events at 1.`,
    examples: `Worked examples usually start by listing total outcomes, counting favourable outcomes, then simplifying the probability.`,
    misconceptions: `A common mistake is assuming outcomes are equally likely without checking the sample space and event conditions.`,
    practice: `Exam practice should mix direct formula questions with coin, dice, card, and complementary-event problems.`
  };
  const sentences = chunk.text.split(/(?<=[.!?])\s+/g).map((part) => stripSourceHeading(part.trim())).filter(isTeachingSentence);
  const evidenceClaim = compactText(sentences.slice(0, 2).join(" "), 320);
  const claim = evidenceClaim
    ? `${leadByIntent[intent]} Source evidence highlights: ${evidenceClaim}`
    : leadByIntent[intent] || `Understand ${labelByIntent[intent]}.`;
  return {
    id: `orien_claim_${index + 1}`,
    chunk_id: chunk.id,
    label: labelByIntent[intent],
    claim,
    type: claimType(intent),
    evidence: compactText(chunk.text, 900),
    confidence: Number(Math.min(0.92, chunk.score).toFixed(2))
  };
}

async function buildResearchPacket(topic: string) {
  const plan = await planResearchWithGemma(topic);
  devLog("info", "orien", "Gemma planned Orien query versions", {
    topic,
    queries: plan.map((item) => ({ intent: item.intent, query: item.query }))
  });

  const results = await collectResearch(topic, plan);
  const extracted = await Promise.all(results.map((result) => extractPage(result.url)));
  const evidence = compactEvidencePacket(topic, results, extracted);
  if (!evidence.length) return { chunks: [], claims: [] };

  const supervisedChunks: {
    id: string;
    title: string;
    text: string;
    score: number;
    type: ResearchClaim["type"];
    teachingGoal: string;
  }[] = [];
  for (const item of plan.slice(0, 7)) {
    const intentEvidence = evidence.filter((candidate) => candidate.intent === item.intent).slice(0, 2);
    const fallbackEvidence = evidence.filter((candidate) => candidate.intent !== item.intent).slice(0, 1);
    const scopedEvidence = intentEvidence.length ? intentEvidence : fallbackEvidence;
    if (!scopedEvidence.length) continue;
    try {
      const chunk = await superviseIntentWithGemma(topic, item, scopedEvidence);
      if (chunk.quality === "weak" || !chunk.title || !chunk.text || !chunk.teachingGoal) {
        devLog("warn", "orien", "Gemma supervisor rejected weak intent evidence", { intent: item.intent, note: chunk.note ?? null });
        continue;
      }
      supervisedChunks.push({
        id: `orien_chunk_${supervisedChunks.length + 1}`,
        title: compactText(chunk.title, 90),
        text: compactText(chunk.text, 2600),
        score: Number((0.92 - supervisedChunks.length * 0.02).toFixed(3)),
        type: normalizeClaimType(chunk.type, item.intent),
        teachingGoal: compactText(chunk.teachingGoal, 420)
      });
      devLog("info", "orien", "Gemma supervised Orien intent", { intent: item.intent, title: chunk.title });
      await delay(750);
    } catch (error) {
      devLog("warn", "orien", "Gemma supervisor failed for intent", {
        intent: item.intent,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (supervisedChunks.length >= 3) {
    let finalChunks = supervisedChunks;
    try {
      const polished = await finalPolishWithGemma(topic, supervisedChunks);
      const cleaned = (polished.chunks ?? [])
        .filter((chunk) => chunk.title && chunk.text && chunk.teachingGoal)
        .slice(0, 7)
        .map((chunk, index) => ({
          id: `orien_chunk_${index + 1}`,
          title: compactText(chunk.title, 90),
          text: compactText(chunk.text, 2600),
          score: Number((0.94 - index * 0.02).toFixed(3)),
          type: chunk.type,
          teachingGoal: compactText(chunk.teachingGoal, 420)
        }));
      if (cleaned.length >= 3) {
        finalChunks = cleaned;
        devLog("info", "orien", "Gemma final supervisor polished Orien packet", { chunks: cleaned.length });
      } else {
        devLog("warn", "orien", "Gemma final supervisor returned too few chunks", { chunks: cleaned.length });
      }
    } catch (error) {
      devLog("warn", "orien", "Gemma final supervisor failed; using per-intent supervised chunks", {
        message: error instanceof Error ? error.message : String(error)
      });
    }

    const claims = finalChunks.map((chunk, index) => ({
      id: `orien_claim_${index + 1}`,
      chunk_id: chunk.id,
      label: chunk.title,
      claim: chunk.teachingGoal,
      type: chunk.type,
      evidence: chunk.text,
      confidence: Number(Math.max(0.72, chunk.score).toFixed(2))
    } satisfies ResearchClaim));
    devLog("info", "orien", "Gemma supervised Orien research packet", { chunks: finalChunks.length });
    return { chunks: finalChunks.map(({ type, teachingGoal, ...chunk }) => chunk), claims };
  }

  devLog("warn", "orien", "Gemma supervisor produced too few usable chunks; refusing to write scraped fallback", { chunks: supervisedChunks.length });
  return { chunks: [], claims: [] };
}

export async function createOrienCache(topic: string): Promise<OrienCache | null> {
  if (!CONFIG.useOrienSearch) return null;
  const knowledgeOnly = CONFIG.orienMode === "gemma_knowledge";
  if (!knowledgeOnly) {
    const status = await ensureOrienSearch();
    if (!status.ready) {
      devLog("warn", "orien", "OrienSearch setup required", { detail: status.detail, setup: status.setup });
      return null;
    }
  }

  const id = stableId(topic);
  const dir = path.join(cacheRoot(), id);
  const chunksFile = path.join(dir, "chunks.json");
  if (fs.existsSync(chunksFile)) {
    const chunks = JSON.parse(fs.readFileSync(chunksFile, "utf8")) as unknown[];
    const claims = fs.existsSync(path.join(dir, "claims.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "claims.json"), "utf8")) as unknown[] : [];
    const curriculum = fs.existsSync(path.join(dir, "curriculum.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "curriculum.json"), "utf8")) as { constraints?: string[] } : {};
    const constraints = curriculum.constraints ?? [];
    const modeMatches = knowledgeOnly ? constraints.includes("gemma knowledge only") : constraints.includes("multi-query research packet");
    if (chunks.length && claims.length && modeMatches) {
      devLog("info", "orien", "Using existing OrienSearch cache", { id, chunks: chunks.length });
      return { id, dir, chunks: chunks.length };
    }
    devLog("info", "orien", "Rebuilding older OrienSearch cache for active mode", { id, mode: CONFIG.orienMode });
  }

  devLog("info", "orien", knowledgeOnly ? "Building Gemma-only knowledge packet" : "Building OrienSearch research packet", {
    topic,
    mode: CONFIG.orienMode,
    endpoint: knowledgeOnly ? "local Gemma only" : CONFIG.orienSearxngUrl
  });
  const { chunks, claims } = knowledgeOnly ? await buildGemmaKnowledgePacket(topic) : await buildResearchPacket(topic);

  if (!chunks.length) {
    devLog("warn", "orien", knowledgeOnly ? "Gemma knowledge-only packet produced no chunks" : "Open search results had no usable text after extraction", { topic });
    return null;
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "curriculum.json"), JSON.stringify({
    subject: knowledgeOnly ? "local Gemma knowledge" : "open web",
    grade_level: "adaptive",
    topics: [topic],
    learning_goals: researchPlan(topic).map((item) => `Understand ${topicCore(topic)} ${item.label}.`),
    constraints: knowledgeOnly
      ? ["gemma knowledge only", "no external API", "no web search", "no source URLs persisted"]
      : ["open-source search", "multi-query research packet", "no paid search API", "no source URLs persisted"]
  }, null, 2));
  fs.writeFileSync(chunksFile, JSON.stringify(chunks, null, 2));
  fs.writeFileSync(path.join(dir, "claims.json"), JSON.stringify(claims, null, 2));
  fs.writeFileSync(path.join(dir, "concepts.json"), JSON.stringify([], null, 2));

  devLog("info", "orien", knowledgeOnly ? "Wrote Gemma-only knowledge packet" : "Wrote OrienSearch research packet", { id, chunks: chunks.length, claims: claims.length });
  return { id, dir, chunks: chunks.length };
}
