import { spawn, type ChildProcess } from "node:child_process";
import { CONFIG } from "../config.js";
import { isLLMReady, listModels } from "./client.js";

let child: ChildProcess | null = null;
let lastStartupError = "";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function ensureLocalLLM() {
  if (await isLLMReady()) return llmStatus("running");

  if (!CONFIG.llmAutostart) {
    return llmStatus("setup_required", "LLM_AUTOSTART is false and no local LLM server is reachable.");
  }

  if (!child) {
    child = spawn(CONFIG.llmStartCommand, {
      shell: true,
      cwd: process.cwd(),
      env: { ...process.env, LLM_PORT: "8080" },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout?.on("data", (data) => process.stdout.write(`[llm] ${data}`));
    child.stderr?.on("data", (data) => {
      lastStartupError = data.toString();
      process.stderr.write(`[llm] ${data}`);
    });
    child.on("exit", (code) => {
      if (code && code !== 0) lastStartupError ||= `LLM process exited with code ${code}`;
      child = null;
    });
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < CONFIG.llmReadyTimeoutMs) {
    if (await isLLMReady()) return llmStatus("running");
    await delay(1000);
  }

  return llmStatus("setup_required", lastStartupError || "Timed out waiting for local LiteRT-LM Gemma.");
}

export async function llmStatus(state?: "running" | "setup_required", detail?: string) {
  const ready = await isLLMReady();
  const models = ready ? await listModels() : [];
  return {
    ready,
    state: state ?? (ready ? "running" : "setup_required"),
    baseUrl: CONFIG.llmBaseUrl,
    expectedModel: CONFIG.llmModel,
    availableModels: models,
    startupCommandConfigured: Boolean(CONFIG.llmStartCommand),
    detail: detail || lastStartupError || null,
    setup: ready ? null : {
      message: "Install/configure LiteRT-LM locally and import the Gemma 4 LiteRT model before production use.",
      expectedModelRepo: process.env.LLM_MODEL_REPO ?? "litert-community/gemma-4-E2B-it-litert-lm",
      envToSet: ["LLM_START_COMMAND or LITERT_LM_START_COMMAND", "LLM_MODEL_PATH", "LLM_MODEL", "LLM_BASE_URL"]
    }
  };
}
