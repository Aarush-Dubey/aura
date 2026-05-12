import { CONFIG } from "../config.js";
import { geminiUrl, runGeminiJob, type LLMJobOptions } from "./broker.js";

type LLMOpts = LLMJobOptions;

function inferJobType(system: string, user: string): LLMJobOptions["type"] {
  const text = `${system}\n${user}`.toLowerCase();
  if (text.includes("planning a concise node lecture")) return "current_card";
  if (text.includes("generating one local lesson card")) return "current_card";
  if (text.includes("comprehensive topic graph") || text.includes("concepts")) return "graph_plan";
  if (text.includes("redundancy judge")) return "polish";
  if (text.includes("rewriting tutor cards")) return "voice_rewrite";
  if (text.includes("evaluate") || text.includes("student answer")) return "answer_tool_call";
  return "current_card";
}

export async function callLLM(system: string, user: string, opts: LLMOpts = {}): Promise<string> {
  const prompt = `${system}\n\n${user}${opts.json ? "\n\nReturn valid JSON only." : ""}`;
  return runGeminiJob(prompt, { ...opts, type: opts.type ?? inferJobType(system, user) });
}

export async function isLLMReady(): Promise<boolean> {
  if (!CONFIG.llmProbeOnHealth) {
    try {
      await fetch(CONFIG.llmBaseUrl, { signal: AbortSignal.timeout(1200) });
      return true;
    } catch {
      return false;
    }
  }
  try {
    const res = await fetch(geminiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }],
        generationConfig: { maxOutputTokens: 4, temperature: 0 }
      }),
      signal: AbortSignal.timeout(60_000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels(): Promise<string[]> {
  return [CONFIG.llmModel];
}
