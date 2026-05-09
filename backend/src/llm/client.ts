import { CONFIG } from "../config.js";

type LLMOpts = { json?: boolean; temperature?: number; maxTokens?: number };

function geminiUrl(model = CONFIG.llmModel) {
  const base = CONFIG.llmBaseUrl.replace(/\/$/, "");
  return `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

function extractGeminiText(data: unknown): string {
  const response = data as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
}

export async function callLLM(system: string, user: string, opts: LLMOpts = {}): Promise<string> {
  const prompt = `${system}\n\n${user}${opts.json ? "\n\nReturn valid JSON only." : ""}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.maxTokens ?? 1024,
      ...(opts.json ? { responseMimeType: "application/json" } : {})
    }
  };

  const res = await fetch(geminiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });

  if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`);
  return extractGeminiText(await res.json());
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
