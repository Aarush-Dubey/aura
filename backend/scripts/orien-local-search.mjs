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

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function wantsJson(req, url) {
  return url.searchParams.get("format") === "json" || String(req.headers.accept ?? "").includes("application/json");
}

function renderSearchPage({ query = "", results = [], error = "" } = {}) {
  const safeQuery = escapeHtml(query);
  const rows = results.length
    ? results.map((result, index) => `
        <article class="result">
          <div class="rank">${index + 1}</div>
          <div>
            <h2>${escapeHtml(result.title)}</h2>
            <p>${escapeHtml(result.content)}</p>
            <span>${escapeHtml(result.engine)} · score ${escapeHtml(result.score)}</span>
          </div>
        </article>
      `).join("")
    : query && !error
      ? `<div class="empty">No results came back for this query.</div>`
      : `<div class="empty">Type a topic to test the local open search layer.</div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Aura Orien Search</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f7f3ea;
        color: #1f2523;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(46, 125, 108, 0.16), transparent 32rem),
          linear-gradient(135deg, #fbf8f0 0%, #edf4ee 52%, #f6eadf 100%);
      }
      main {
        width: min(920px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 56px 0;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #49655e;
      }
      .dot {
        width: 16px;
        height: 16px;
        border-radius: 999px;
        background: #2c7a68;
        box-shadow: 0 0 0 7px rgba(44, 122, 104, 0.12);
      }
      h1 {
        margin: 28px 0 12px;
        max-width: 680px;
        font-size: clamp(36px, 7vw, 76px);
        line-height: 0.95;
        letter-spacing: 0;
      }
      .sub {
        max-width: 680px;
        color: #52615e;
        font-size: 18px;
        line-height: 1.6;
      }
      form {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 12px;
        margin: 34px 0 24px;
      }
      input {
        min-width: 0;
        height: 58px;
        border: 1px solid rgba(31, 37, 35, 0.16);
        border-radius: 18px;
        padding: 0 18px;
        font: inherit;
        font-size: 18px;
        background: rgba(255, 255, 255, 0.74);
        color: inherit;
        outline-color: #2c7a68;
      }
      button {
        height: 58px;
        border: 0;
        border-radius: 18px;
        padding: 0 24px;
        background: #1f2523;
        color: white;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }
      .status, .empty, .error {
        margin: 18px 0;
        padding: 16px 18px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.66);
        border: 1px solid rgba(31, 37, 35, 0.1);
        color: #52615e;
      }
      .error {
        color: #9b2c2c;
        border-color: rgba(155, 44, 44, 0.24);
      }
      .result {
        display: grid;
        grid-template-columns: 46px 1fr;
        gap: 16px;
        padding: 20px 0;
        border-top: 1px solid rgba(31, 37, 35, 0.12);
      }
      .rank {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 999px;
        background: #2c7a68;
        color: white;
        font-weight: 800;
      }
      h2 {
        margin: 0 0 8px;
        font-size: 20px;
        line-height: 1.25;
      }
      p {
        margin: 0;
        color: #46524f;
        line-height: 1.55;
      }
      span {
        display: inline-block;
        margin-top: 10px;
        color: #6c7774;
        font-size: 13px;
      }
      @media (max-width: 640px) {
        main { padding: 34px 0; }
        form { grid-template-columns: 1fr; }
        button { width: 100%; }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="brand"><i class="dot"></i> Aura Orien local search</div>
      <h1>Deep search test surface</h1>
      <p class="sub">This page tests the local open-search layer only. Aura still converts these results into cache chunks and then Gemma builds the learning cards.</p>
      <form method="get" action="/search">
        <input name="q" value="${safeQuery}" placeholder="probability class 10" autofocus />
        <input type="hidden" name="max_results" value="5" />
        <button type="submit">Search</button>
      </form>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
      ${query ? `<div class="status">Results for <strong>${safeQuery}</strong></div>` : ""}
      ${rows}
    </main>
  </body>
</html>`;
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
    if (wantsJson(req, url)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "q is required" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderSearchPage());
    return;
  }

  try {
    const results = await searchDuckDuckGo(query, maxResults);
    if (wantsJson(req, url)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ query, number_of_results: results.length, results }));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderSearchPage({ query, results }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (wantsJson(req, url)) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message, results: [] }));
      return;
    }
    res.writeHead(502, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderSearchPage({ query, error: message }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Aura Orien local search on http://localhost:${port}/search`);
});
