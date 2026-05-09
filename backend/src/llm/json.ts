import { callLLM } from "./client.js";
import { jsonrepair } from "jsonrepair";

function extractJson(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) ?? trimmed.match(/(\{[\s\S]*\})/);
  return match?.[1] ?? trimmed;
}

export async function callLLMJson<T>(system: string, user: string, temperature = 0.2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < 2; i += 1) {
    try {
      const raw = await callLLM(system, `${user}\n\nReturn valid JSON only.`, { json: true, temperature, maxTokens: 8192 });
      const jsonText = extractJson(raw);
      try {
        return JSON.parse(jsonText) as T;
      } catch {
        return JSON.parse(jsonrepair(jsonText)) as T;
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`LLM returned invalid JSON after 2 attempts: ${String(lastErr)}`);
}
