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
    const output = await callLLMJson<{
      tool: "mark_pass" | "mark_partial" | "give_hint" | "insert_repair";
      confidence: number;
      evidence: string;
      issue?: string | null;
      repairFocus?: string | null;
    }>(
      [
        "You evaluate a learner answer for Aura.",
        "Respond as a local tool call, not prose.",
        "Choose exactly one tool:",
        "- mark_pass: the expected idea is clearly present.",
        "- mark_partial: the answer is close but missing a key piece.",
        "- give_hint: the answer is unclear or too short.",
        "- insert_repair: the answer shows a specific misconception that needs a repair node.",
        "Return valid JSON only."
      ].join("\n"),
      JSON.stringify({
        expectedIdea: check.expectedIdea,
        answer,
        misconceptionTargets: check.misconceptionTargets ?? [],
        schema: {
          tool: "mark_pass|mark_partial|give_hint|insert_repair",
          confidence: "0.0 to 1.0",
          evidence: "one short sentence",
          issue: "snake_case issue tag or null",
          repairFocus: "short repair focus or null"
        }
      }),
      0.1,
      30_000,
      900,
      { type: "answer_tool_call", label: check.id }
    );
    const result = output.tool === "mark_pass" ? "pass" : output.tool === "mark_partial" ? "partial" : output.tool === "insert_repair" ? "fail" : "unclear";
    devLog("info", "evaluate", `Tool: ${output.tool}`, { checkId: check.id, issue: output.issue ?? null, repairFocus: output.repairFocus ?? null });
    return {
      result,
      confidence: output.confidence,
      evidence: output.evidence,
      detectedIssue: output.issue ?? undefined,
      demonstratedMisconception: output.tool === "insert_repair" ? output.repairFocus ?? output.issue ?? undefined : undefined
    };
  } catch {
    devLog("warn", "evaluate", "Evaluation failed; using deterministic fallback evaluation", { checkId: check.id });
    return fallbackEvaluation(answer);
  }
}
