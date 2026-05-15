import { CONFIG } from "../config.js";
import { geminiUrl, runGeminiJob, type LLMJobOptions } from "./broker.js";
import net from "node:net";

type LLMOpts = LLMJobOptions;

function tcpReady(urlString: string, timeoutMs = 1200): Promise<boolean> {
  try {
    const url = new URL(urlString);
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    return new Promise((resolve) => {
      const socket = net.connect({ host: url.hostname, port });
      const finish = (ready: boolean) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(ready);
      };
      socket.setTimeout(timeoutMs);
      socket.once("connect", () => finish(true));
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
    });
  } catch {
    return Promise.resolve(false);
  }
}

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
    return tcpReady(CONFIG.llmBaseUrl, 1200);
  }
  try {
    const res = await fetch(geminiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }],
        generationConfig: { maxOutputTokens: 1, temperature: 0 }
      }),
      signal: AbortSignal.timeout(8_000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels(): Promise<string[]> {
  return [CONFIG.llmModel];
}
