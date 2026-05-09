import { evaluatePrompt } from "../llm/prompts.js";
import { callLLMJson } from "../llm/json.js";
import { CONFIG } from "../config.js";
import type { CheckEvaluation, SoftCheck } from "../types.js";
import { fallbackEvaluation } from "./fallbacks.js";
import { devLog } from "../dev/logs.js";

export async function evaluateCheck(check: SoftCheck, answer: string): Promise<CheckEvaluation> {
  try {
    if (!CONFIG.llmUseForEvaluation) {
      devLog("info", "evaluate", "Fast mode: using deterministic evaluation", { checkId: check.id });
      return fallbackEvaluation(answer);
    }
    const p = evaluatePrompt(check.expectedIdea, answer);
    return await callLLMJson<CheckEvaluation>(p.system, p.user, 0.1);
  } catch {
    devLog("warn", "evaluate", "Evaluation failed; using deterministic fallback evaluation", { checkId: check.id });
    return fallbackEvaluation(answer);
  }
}
