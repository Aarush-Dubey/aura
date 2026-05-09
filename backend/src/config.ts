import "dotenv/config";

export const CONFIG = {
  exaApiKey: process.env.EXA_API_KEY ?? "",
  useExaCache: (process.env.AURA_USE_EXA_CACHE ?? "true") === "true",
  exaCacheDir: process.env.AURA_EXA_CACHE_DIR ?? "../aac/outputs/cache",
  llmBaseUrl: process.env.LLM_BASE_URL ?? "http://localhost:8080/v1",
  llmModel: process.env.LLM_MODEL ?? "gemma-4-E2B-it",
  llmUseForCards: (process.env.LLM_USE_FOR_CARDS ?? "false") === "true",
  llmUseForEvaluation: (process.env.LLM_USE_FOR_EVALUATION ?? "false") === "true",
  llmProbeOnHealth: (process.env.LLM_PROBE_ON_HEALTH ?? "false") === "true",
  llmAutostart: (process.env.LLM_AUTOSTART ?? "true") === "true",
  llmReadyTimeoutMs: Number(process.env.LLM_READY_TIMEOUT_MS ?? 45_000),
  llmStartCommand: process.env.LLM_START_COMMAND ?? "bash ./scripts/start-litert-lm.sh",
  backendPort: Number(process.env.BACKEND_PORT ?? 3001),
  dbPath: process.env.DB_PATH ?? "./aura.db",
  defaultProfileId: process.env.DEFAULT_PROFILE_ID ?? "profile_001"
};
