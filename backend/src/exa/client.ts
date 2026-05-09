import { CONFIG } from "../config.js";

export async function exaSearch(topic: string) {
  if (!CONFIG.exaApiKey) return { results: [], skipped: "EXA_API_KEY not configured" };
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CONFIG.exaApiKey
    },
    body: JSON.stringify({ query: topic, type: "auto", numResults: 5 })
  });
  if (!res.ok) throw new Error(`Exa error ${res.status}: ${await res.text()}`);
  return res.json();
}
