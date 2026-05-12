import { spawn, type ChildProcess } from "node:child_process";
import { CONFIG } from "../config.js";
import { isLLMReady, listModels } from "./client.js";

let child: ChildProcess | null = null;
let lastStartupError = "";
let runtimeMtpEnabled = CONFIG.llmMtpEnabled;

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
      env: {
        ...process.env,
        LLM_PORT: "8080",
        LITERT_LM_BACKEND: CONFIG.llmBackend,
        LITERT_LM_MTP: runtimeMtpEnabled ? "true" : "false"
      },
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

async function stopOwnedLLM() {
  if (!child) return false;
  const current = child;
  const exited = new Promise<void>((resolve) => {
    current.once("exit", () => resolve());
  });
  current.kill();
  await Promise.race([exited, delay(5000)]);
  if (child === current) child = null;
  return true;
}

export async function restartLocalLLMWithMtp(enabled: boolean) {
  runtimeMtpEnabled = enabled;
  const stoppedOwnedProcess = await stopOwnedLLM();
  if (!stoppedOwnedProcess && await isLLMReady()) {
    return llmStatus(
      "running",
      "MTP setting recorded, but Aura did not start this LiteRT-LM process so it cannot restart it."
    );
  }
  return ensureLocalLLM();
}

export async function llmStatus(state?: "running" | "setup_required", detail?: string) {
  const ready = await isLLMReady();
  const models = ready ? await listModels() : [];
  return {
    ready,
    state: state ?? (ready ? "running" : "setup_required"),
    baseUrl: CONFIG.llmBaseUrl,
    expectedModel: CONFIG.llmModel,
    backend: CONFIG.llmBackend,
    mtpEnabled: runtimeMtpEnabled,
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
