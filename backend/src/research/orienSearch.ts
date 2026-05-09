import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONFIG } from "../config.js";
import { devLog } from "../dev/logs.js";

type SearxngResult = {
  title?: string;
  content?: string;
  url?: string;
  score?: number;
};

type SearxngResponse = {
  results?: SearxngResult[];
};

export type OrienCache = {
  id: string;
  dir: string;
  chunks: number;
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

function safeTitle(value: string | undefined, fallback: string) {
  const title = compactText(value ?? "", 120);
  return title || fallback;
}

function cleanTopicWords(topic: string) {
  return topic.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
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
    return compactText(await response.text());
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

export async function createOrienCache(topic: string): Promise<OrienCache | null> {
  if (!CONFIG.useOrienSearch) return null;

  const id = stableId(topic);
  const dir = path.join(cacheRoot(), id);
  const chunksFile = path.join(dir, "chunks.json");
  if (fs.existsSync(chunksFile)) {
    const chunks = JSON.parse(fs.readFileSync(chunksFile, "utf8")) as unknown[];
    if (chunks.length) {
      devLog("info", "orien", "Using existing OrienSearch cache", { id, chunks: chunks.length });
      return { id, dir, chunks: chunks.length };
    }
  }

  devLog("info", "orien", "Searching open web through SearXNG", { topic, searxngUrl: CONFIG.orienSearxngUrl });
  const results = await searxngSearch(topic);
  if (!results.length) {
    devLog("warn", "orien", "SearXNG returned no results", { topic });
    return null;
  }

  const extracted = await Promise.all(results.map((result) => extractPage(result.url)));
  const chunks = results
    .map((result, index) => {
      const title = safeTitle(result.title, `${topic} source ${index + 1}`);
      const text = compactText(`${result.content ?? ""}\n\n${extracted[index] ?? ""}`);
      if (!text || text.length < 80) return null;
      return {
        id: `orien_chunk_${index + 1}`,
        title,
        text,
        score: typeof result.score === "number" ? result.score : scoreChunk(topic, `${title} ${text}`, index)
      };
    })
    .filter(Boolean);

  if (!chunks.length) {
    devLog("warn", "orien", "Open search results had no usable text after extraction", { topic });
    return null;
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "curriculum.json"), JSON.stringify({
    subject: "open web",
    grade_level: "adaptive",
    topics: [topic],
    learning_goals: [`Build a local source-backed learning map for ${topic}.`],
    constraints: ["open-source search", "no paid search API", "no source URLs persisted"]
  }, null, 2));
  fs.writeFileSync(chunksFile, JSON.stringify(chunks, null, 2));
  fs.writeFileSync(path.join(dir, "claims.json"), JSON.stringify([], null, 2));
  fs.writeFileSync(path.join(dir, "concepts.json"), JSON.stringify([], null, 2));

  devLog("info", "orien", "Wrote OrienSearch cache", { id, chunks: chunks.length });
  return { id, dir, chunks: chunks.length };
}
