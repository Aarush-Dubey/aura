import { spawn, type ChildProcess } from "node:child_process";
import { CONFIG } from "../config.js";

let child: ChildProcess | null = null;
let lastStartupError = "";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function endpointPort() {
  try {
    return new URL(CONFIG.orienSearxngUrl).port || "80";
  } catch {
    return "8888";
  }
}

export async function isOrienReady() {
  try {
    const healthUrl = new URL(CONFIG.orienSearxngUrl);
    healthUrl.pathname = "/health";
    healthUrl.search = "";
    const health = await fetch(healthUrl, { signal: AbortSignal.timeout(1200) });
    if (health.ok) return true;
  } catch {
    // SearXNG does not expose /health, so fall through to a tiny search probe.
  }

  try {
    const searchUrl = new URL(CONFIG.orienSearxngUrl);
    searchUrl.searchParams.set("q", "aura smoke");
    searchUrl.searchParams.set("format", "json");
    const response = await fetch(searchUrl, { signal: AbortSignal.timeout(2500) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureOrienSearch() {
  if (!CONFIG.useOrienSearch) return orienStatus("disabled", "AURA_USE_ORIEN_SEARCH is false.");
  if (await isOrienReady()) return orienStatus("running");

  if (!CONFIG.orienAutostart) {
    return orienStatus("setup_required", "AURA_ORIEN_AUTOSTART is false and no Orien/SearXNG endpoint is reachable.");
  }

  if (!child) {
    child = spawn(CONFIG.orienStartCommand, {
      shell: true,
      cwd: process.cwd(),
      env: { ...process.env, AURA_ORIEN_PORT: endpointPort() },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout?.on("data", (data) => process.stdout.write(`[orien] ${data}`));
    child.stderr?.on("data", (data) => {
      lastStartupError = data.toString();
      process.stderr.write(`[orien] ${data}`);
    });
    child.on("exit", (code) => {
      if (code && code !== 0) lastStartupError ||= `Orien process exited with code ${code}`;
      child = null;
    });
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < CONFIG.orienReadyTimeoutMs) {
    if (await isOrienReady()) return orienStatus("running");
    await delay(500);
  }

  return orienStatus("setup_required", lastStartupError || "Timed out waiting for local Orien search.");
}

export async function orienStatus(state?: "disabled" | "running" | "setup_required", detail?: string) {
  const ready = CONFIG.useOrienSearch ? await isOrienReady() : false;
  return {
    ready,
    state: state ?? (!CONFIG.useOrienSearch ? "disabled" : ready ? "running" : "setup_required"),
    searchUrl: CONFIG.orienSearxngUrl,
    autostart: CONFIG.orienAutostart,
    startupCommandConfigured: Boolean(CONFIG.orienStartCommand),
    detail: detail || lastStartupError || null,
    setup: ready || !CONFIG.useOrienSearch ? null : {
      message: "Start local Orien search or point AURA_ORIEN_SEARXNG_URL to a reachable SearXNG-compatible /search endpoint.",
      defaultStartCommand: "node ./scripts/orien-local-search.mjs",
      envToSet: ["AURA_USE_ORIEN_SEARCH=true", "AURA_ORIEN_AUTOSTART=true", "AURA_ORIEN_START_COMMAND", "AURA_ORIEN_SEARXNG_URL"]
    }
  };
}
