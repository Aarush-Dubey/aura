import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONFIG } from "../config.js";
import { devLog } from "../dev/logs.js";
import { ensureOrienSearch } from "./runtime.js";

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

async function collectResearch(topic: string) {
  const plan = researchPlan(topic);
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
  const results = await collectResearch(topic);
  const extracted = await Promise.all(results.map((result) => extractPage(result.url)));
  const byIntent = new Map<ResearchIntent, ResearchChunk>();
  let fallbackIndex = 0;
  for (const [index, result] of results.entries()) {
    const intent = result.intent ?? "overview";
    const title = safeTitle(result.title, `${topic} ${intent}`);
    const text = extractBestPassage(topic, intent, title, result.content ?? "", extracted[index] ?? "");
    if (text.length < 160) continue;
    const score = Number(((result.score ?? scoreChunk(topic, `${title} ${text}`, index)) + domainBoost(result.url)).toFixed(3));
    const chunk: ResearchChunk = {
      id: `orien_chunk_${byIntent.size + 1}`,
      title: `${topicCore(topic)} - ${researchPlan(topic).find((item) => item.intent === intent)?.label ?? "source"}`,
      text,
      score
    };
    const current = byIntent.get(intent);
    if (!current || chunk.score > current.score || chunk.text.length > current.text.length + 300) byIntent.set(intent, chunk);
  }
  const chunks = [...byIntent.entries()]
    .sort((a, b) => researchPlan(topic).findIndex((item) => item.intent === a[0]) - researchPlan(topic).findIndex((item) => item.intent === b[0]))
    .map(([intent, chunk]) => ({ intent, chunk: { ...chunk, id: `orien_chunk_${++fallbackIndex}` } }));
  const finalChunks = chunks.map((item) => item.chunk);
  const claims = chunks.map((item, index) => claimFromChunk(topic, item.chunk, item.intent, index));
  return { chunks: finalChunks, claims };
}

export async function createOrienCache(topic: string): Promise<OrienCache | null> {
  if (!CONFIG.useOrienSearch) return null;
  const status = await ensureOrienSearch();
  if (!status.ready) {
    devLog("warn", "orien", "OrienSearch setup required", { detail: status.detail, setup: status.setup });
    return null;
  }

  const id = stableId(topic);
  const dir = path.join(cacheRoot(), id);
  const chunksFile = path.join(dir, "chunks.json");
  if (fs.existsSync(chunksFile)) {
    const chunks = JSON.parse(fs.readFileSync(chunksFile, "utf8")) as unknown[];
    const claims = fs.existsSync(path.join(dir, "claims.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "claims.json"), "utf8")) as unknown[] : [];
    if (chunks.length && claims.length) {
      devLog("info", "orien", "Using existing OrienSearch cache", { id, chunks: chunks.length });
      return { id, dir, chunks: chunks.length };
    }
    devLog("info", "orien", "Rebuilding older OrienSearch cache into research packet", { id });
  }

  devLog("info", "orien", "Building OrienSearch research packet", { topic, endpoint: CONFIG.orienSearxngUrl });
  const { chunks, claims } = await buildResearchPacket(topic);

  if (!chunks.length) {
    devLog("warn", "orien", "Open search results had no usable text after extraction", { topic });
    return null;
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "curriculum.json"), JSON.stringify({
    subject: "open web",
    grade_level: "adaptive",
    topics: [topic],
    learning_goals: researchPlan(topic).map((item) => `Understand ${topicCore(topic)} ${item.label}.`),
    constraints: ["open-source search", "multi-query research packet", "no paid search API", "no source URLs persisted"]
  }, null, 2));
  fs.writeFileSync(chunksFile, JSON.stringify(chunks, null, 2));
  fs.writeFileSync(path.join(dir, "claims.json"), JSON.stringify(claims, null, 2));
  fs.writeFileSync(path.join(dir, "concepts.json"), JSON.stringify([], null, 2));

  devLog("info", "orien", "Wrote OrienSearch research packet", { id, chunks: chunks.length, claims: claims.length });
  return { id, dir, chunks: chunks.length };
}
