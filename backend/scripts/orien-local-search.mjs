import http from "node:http";
import { URL } from "node:url";

const port = Number(process.env.AURA_ORIEN_PORT ?? 8888);
const timeoutMs = Number(process.env.AURA_ORIEN_FETCH_TIMEOUT_MS ?? 12000);

function compactText(value = "", limit = 4000) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function decodeHtml(value = "") {
  return compactText(value, 1000);
}

function duckUrl(value = "") {
  try {
    const decoded = decodeURIComponent(value).replace(/&amp;/g, "&");
    const parsed = new URL(decoded.startsWith("//") ? `https:${decoded}` : decoded);
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : parsed.toString();
  } catch {
    return value;
  }
}

function score(query, title, content, rank) {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  const text = `${title} ${content}`.toLowerCase();
  const overlap = terms.filter((term) => text.includes(term)).length;
  return Number((0.7 + Math.min(0.2, overlap * 0.04) + Math.max(0, 0.1 - rank * 0.015)).toFixed(3));
}

async function searchDuckDuckGo(query, maxResults) {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 AuraOrienLocal/0.1",
      "Accept": "text/html"
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`DuckDuckGo HTML error ${response.status}`);
  const html = await response.text();
  const matches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)];
  return matches.slice(0, maxResults).map((match, index) => {
    const title = decodeHtml(match[2] ?? "");
    const content = decodeHtml(match[3] ?? "");
    return {
      title,
      content,
      url: duckUrl(match[1] ?? ""),
      score: score(query, title, content, index),
      engine: "duckduckgo-html"
    };
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "aura-orien-local-search" }));
    return;
  }

  if (url.pathname !== "/search" && url.pathname !== "/") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const query = String(url.searchParams.get("q") ?? "").trim();
  const maxResults = Math.max(1, Math.min(10, Number(url.searchParams.get("max_results") ?? 5)));
  if (!query) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "q is required" }));
    return;
  }

  try {
    const results = await searchDuckDuckGo(query, maxResults);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ query, number_of_results: results.length, results }));
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error), results: [] }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Aura Orien local search on http://localhost:${port}/search`);
});
