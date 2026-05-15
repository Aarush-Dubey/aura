import { spawn, type ChildProcess } from "node:child_process";
import { CONFIG } from "../config.js";
import { isLLMReady, listModels } from "./client.js";

let child: ChildProcess | null = null;
let lastStartupError = "";
let runtimeMtpEnabled = CONFIG.llmMtpEnabled;
let ensurePromise: Promise<LlmRuntimeStatus> | null = null;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type LlmRuntimeStatus = Awaited<ReturnType<typeof llmStatus>>;

function llmPort() {
  try {
    const url = new URL(CONFIG.llmBaseUrl);
    return url.port || "8080";
  } catch {
    return "8080";
  }
}

function withStableHost(command: string) {
  const trimmed = command.trim();
  if (!/\blitert-lm(?:\.exe)?\b/i.test(trimmed) || !/\sserve\b/i.test(trimmed)) {
    return trimmed;
  }
  if (/\s--host\b/i.test(trimmed)) return trimmed;
  return `${trimmed} --host 127.0.0.1`;
}

function maybeRecordLlmError(text: string) {
  if (!text) return;
  if (/\"(GET|POST|PUT|DELETE|OPTIONS|HEAD) .* HTTP\/1\.1\" \d{3}/.test(text)) return;
  if (/starting litert-lm api server/i.test(text)) return;
  if (/initializing engine for model/i.test(text)) return;
  if (/using litert-lm backend/i.test(text)) return;
  lastStartupError = text;
}

function spawnLocalLLMProcess() {
  const command = withStableHost(CONFIG.llmStartCommand);
  child = spawn(command, {
    shell: true,
    cwd: process.cwd(),
    env: {
      ...process.env,
      PYTHONUTF8: process.env.PYTHONUTF8 ?? "1",
      PYTHONIOENCODING: process.env.PYTHONIOENCODING ?? "utf-8",
      PYTHONLEGACYWINDOWSSTDIO: process.env.PYTHONLEGACYWINDOWSSTDIO ?? "1",
      LLM_PORT: llmPort(),
      LITERT_LM_BACKEND: CONFIG.llmBackend,
      LITERT_LM_MTP: runtimeMtpEnabled ? "true" : "false"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  child.stdout?.on("data", (data) => process.stdout.write(`[llm] ${data}`));
  child.stderr?.on("data", (data) => {
    const text = data.toString().trim();
    maybeRecordLlmError(text);
    process.stderr.write(`[llm] ${data}`);
  });
  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      lastStartupError = `LLM process exited with code ${code}`;
    } else if (signal) {
      lastStartupError = `LLM process exited with signal ${signal}`;
    }
    child = null;
  });
}

async function ensureLocalLLMInner(): Promise<LlmRuntimeStatus> {
  if (await isLLMReady()) return llmStatus("running");

  if (!CONFIG.llmAutostart) {
    return llmStatus("setup_required", "LLM_AUTOSTART is false and no local LLM server is reachable.");
  }

  if (!child) {
    lastStartupError = "";
    spawnLocalLLMProcess();
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < CONFIG.llmReadyTimeoutMs) {
    if (await isLLMReady()) return llmStatus("running");
    if (!child && CONFIG.llmAutostart) {
      spawnLocalLLMProcess();
    }
    await delay(1000);
  }

  return llmStatus("setup_required", lastStartupError || "Timed out waiting for local LiteRT-LM Gemma.");
}

export async function ensureLocalLLM() {
  if (!ensurePromise) {
    ensurePromise = ensureLocalLLMInner().finally(() => {
      ensurePromise = null;
    });
  }
  return ensurePromise;
}

async function stopOwnedLLM() {
  if (!child) return false;
  const current = child;
  const exited = new Promise<void>((resolve) => {
    current.once("exit", () => resolve());
  });

  if (process.platform === "win32" && current.pid) {
    const killer = spawn("taskkill", ["/pid", String(current.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
    await new Promise<void>((resolve) => killer.once("exit", () => resolve()));
  } else {
    current.kill("SIGTERM");
  }

  await Promise.race([exited, delay(5000)]);
  if (child === current) child = null;
  return true;
}

export async function recoverLocalLLM(reason: string) {
  lastStartupError = reason;
  await stopOwnedLLM();
  return ensureLocalLLM();
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
    detail: ready ? (detail || null) : detail || lastStartupError || null,
    setup: ready ? null : {
      message: "Install/configure LiteRT-LM locally and import the Gemma 4 LiteRT model before production use.",
      expectedModelRepo: process.env.LLM_MODEL_REPO ?? "litert-community/gemma-4-E2B-it-litert-lm",
      envToSet: ["LLM_START_COMMAND or LITERT_LM_START_COMMAND", "LLM_MODEL_PATH", "LLM_MODEL", "LLM_BASE_URL"]
    }
  };
}
