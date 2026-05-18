import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const logDir = path.join(rootDir, "logs");
fs.mkdirSync(logDir, { recursive: true });

const isWindows = process.platform === "win32";
const npmBin = isWindows ? "pnpm.cmd" : "pnpm";
const backendPort = process.env.BACKEND_PORT || "3101";
const frontendPort = process.env.FRONTEND_PORT || "5174";
const llmPort = process.env.LLM_PORT || "8080";
const defaultModelDir = path.join(rootDir, "backend", "models", "gemma-4-E2B-it-litert-lm");

const env = {
  ...process.env,
  BACKEND_PORT: backendPort,
  LLM_PORT: llmPort,
  LLM_AUTOSTART: process.env.LLM_AUTOSTART || "true",
  LLM_BASE_URL: process.env.LLM_BASE_URL || `http://localhost:${llmPort}`,
  LLM_MODEL: process.env.LLM_MODEL || "gemma-4-E2B-it",
  LLM_MODEL_PATH: process.env.LLM_MODEL_PATH || defaultModelDir,
  LLM_MODEL_REPO: process.env.LLM_MODEL_REPO || "litert-community/gemma-4-E2B-it-litert-lm",
  LLM_LIT_MODEL_NAME: process.env.LLM_LIT_MODEL_NAME || "gemma-4-E2B-it",
  LLM_USE_FOR_CARDS: process.env.LLM_USE_FOR_CARDS || "true",
  LLM_USE_FOR_EVALUATION: process.env.LLM_USE_FOR_EVALUATION || "true",
  LITERT_LM_BACKEND: process.env.LITERT_LM_BACKEND || "gpu",
  AURA_USE_ORIEN_SEARCH: process.env.AURA_USE_ORIEN_SEARCH || "false",
  AURA_SKIP_BACKEND_SPAWN: "true",
  VITE_DEV_SERVER_URL: process.env.VITE_DEV_SERVER_URL || `http://localhost:${frontendPort}`
};

if (!env.LLM_START_COMMAND) {
  env.LLM_START_COMMAND = "bash ./scripts/start-litert-lm.sh";
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      env: options.env || env,
      stdio: options.stdio || "inherit",
      shell: isWindows,
      windowsHide: true
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function urlOk(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

async function urlReachable(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1200) });
    return true;
  } catch {
    return false;
  }
}

async function waitForUrl(url, label, maxSeconds = 60) {
  const startedAt = Date.now();
  while (!(await urlOk(url))) {
    if (Date.now() - startedAt > maxSeconds * 1000) {
      throw new Error(`${label} did not become ready at ${url} within ${maxSeconds}s.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function hasModelWeights(modelPath) {
  if (!fs.existsSync(modelPath)) return false;
  const stack = [modelPath];
  while (stack.length) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isFile() && path.basename(current) !== ".DS_Store") return true;
    if (!stat.isDirectory()) continue;
    for (const entry of fs.readdirSync(current)) stack.push(path.join(current, entry));
  }
  return false;
}

async function requireGemmaWeightsIfNeeded() {
  if (env.LLM_AUTOSTART === "false") return;
  if (await urlReachable(env.LLM_BASE_URL)) return;
  if (hasModelWeights(env.LLM_MODEL_PATH)) return;

  console.error("Can't find Gemma weights. Please download them before starting Aura.");
  console.error("");
  console.error(`Expected model: ${env.LLM_MODEL_REPO}`);
  console.error(`Put weights here: ${env.LLM_MODEL_PATH}`);
  console.error("");
  console.error("Download/import the Gemma LiteRT-LM weights into that folder, or set LLM_MODEL_PATH to the folder that contains them.");
  process.exit(78);
}

function startBackend() {
  const out = fs.openSync(path.join(logDir, "backend.log"), "a");
  const err = fs.openSync(path.join(logDir, "backend.err.log"), "a");
  return spawn(npmBin, ["run", "start"], {
    cwd: path.join(rootDir, "backend"),
    env,
    stdio: ["ignore", out, err],
    windowsHide: true
  });
}

function stopChild(child) {
  if (!child || child.killed) return;
  try {
    child.kill();
  } catch {
    // Best effort cleanup.
  }
}

console.log("Aura startup");
console.log(`  root:     ${rootDir}`);
console.log(`  frontend: http://localhost:${frontendPort}`);
console.log(`  backend:  http://localhost:${backendPort}`);
console.log(`  llm:      ${env.LLM_BASE_URL}`);
console.log(`  model:    ${env.LLM_MODEL}`);
console.log(`  weights:  ${env.LLM_MODEL_PATH}`);
console.log("");

if (!fs.existsSync(path.join(rootDir, "backend", "node_modules")) || !fs.existsSync(path.join(rootDir, "frontend", "node_modules"))) {
  console.log("Installing missing Node dependencies...");
  await run(npmBin, ["run", "setup"], { cwd: rootDir });
}

await requireGemmaWeightsIfNeeded();

let backendChild = null;
if (await urlOk(`http://localhost:${backendPort}/health`)) {
  console.log(`Backend already running on :${backendPort}.`);
} else {
  console.log("Starting backend. It will start LiteRT-LM/Gemma if needed...");
  backendChild = startBackend();
  backendChild.on("exit", (code) => {
    if (code && code !== 0) console.error(`Backend exited with ${code}. Check logs/backend.err.log.`);
  });
  try {
    await waitForUrl(`http://localhost:${backendPort}/health`, "Backend", 90);
  } catch (error) {
    console.error(error.message);
    for (const file of ["backend.log", "backend.err.log"]) {
      const fullPath = path.join(logDir, file);
      if (fs.existsSync(fullPath)) {
        console.error(`\n--- ${file} ---`);
        console.error(fs.readFileSync(fullPath, "utf8").split(/\r?\n/).slice(-80).join("\n"));
      }
    }
    stopChild(backendChild);
    process.exit(1);
  }
}

console.log("Asking backend to ensure local Gemma is running...");
try {
  await fetch(`http://localhost:${backendPort}/llm/start`, { method: "POST", signal: AbortSignal.timeout(90_000) });
} catch {
  console.warn("Gemma did not confirm readiness yet. The backend will report setup_required if LiteRT-LM is missing.");
}

const cleanup = () => {
  stopChild(backendChild);
};
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});
process.on("exit", cleanup);

console.log("Starting Aura desktop shell...");
console.log(`Logs are in ${logDir}.`);
console.log("");

await run(npmBin, ["--prefix", "frontend", "run", "desktop"], { env });
