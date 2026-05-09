import "dotenv/config";

export const CONFIG = {
  exaApiKey: process.env.EXA_API_KEY ?? "",
  useExaCache: (process.env.AURA_USE_EXA_CACHE ?? "true") === "true",
  exaCacheDir: process.env.AURA_EXA_CACHE_DIR ?? "../aac/outputs/cache",
  useOrienSearch: (process.env.AURA_USE_ORIEN_SEARCH ?? "false") === "true",
  orienAutostart: (process.env.AURA_ORIEN_AUTOSTART ?? "true") === "true",
  orienStartCommand: process.env.AURA_ORIEN_START_COMMAND ?? "node ./scripts/orien-local-search.mjs",
  orienSearxngUrl: process.env.AURA_ORIEN_SEARXNG_URL ?? "http://localhost:8888/search",
  orienMaxResults: Number(process.env.AURA_ORIEN_MAX_RESULTS ?? 5),
  orienFetchTimeoutMs: Number(process.env.AURA_ORIEN_FETCH_TIMEOUT_MS ?? 8_000),
  orienReadyTimeoutMs: Number(process.env.AURA_ORIEN_READY_TIMEOUT_MS ?? 20_000),
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
