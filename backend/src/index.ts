import express from "express";
import { CONFIG } from "./config.js";
import { migrate } from "./db/migrate.js";
import { ensureLocalLLM, llmStatus, restartLocalLLMWithMtp } from "./llm/runtime.js";
import { brokerTelemetry, setMtpOverride } from "./llm/broker.js";
import { ensureOrienSearch, orienStatus } from "./research/runtime.js";
import sessionRouter from "./api/session.js";
import profileRouter from "./api/profile.js";
import { devLog } from "./dev/logs.js";

migrate();

const app = express();
app.use(express.json({ limit: "8mb" }));
app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  next();
});
app.options("*", (_, res) => res.sendStatus(204));

app.use("/", sessionRouter);
app.use("/", profileRouter);

app.get("/health", async (_req, res) => {
  const llm = await llmStatus();
  const orien = await orienStatus();
  res.json({ ok: true, backend: "running", llm, orien, telemetry: brokerTelemetry() });
});

app.get("/telemetry", (_req, res) => {
  res.json(brokerTelemetry());
});

app.post("/llm/mtp", async (req, res) => {
  const enabled = req.body?.enabled;
  setMtpOverride(typeof enabled === "boolean" ? enabled : null);
  const llm = typeof enabled === "boolean" ? await restartLocalLLMWithMtp(enabled) : await llmStatus();
  res.json({ llm, telemetry: brokerTelemetry() });
});

app.post("/llm/start", async (_req, res) => {
  res.json(await ensureLocalLLM());
});

app.post("/orien/start", async (_req, res) => {
  res.json(await ensureOrienSearch());
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  devLog("error", "api", "Request failed", { message });
  res.status(500).json({ error: message });
});

app.listen(CONFIG.backendPort, async () => {
  console.log(`Aura backend on :${CONFIG.backendPort}`);
  ensureLocalLLM().then((status) => {
    if (!status.ready) console.warn("Aura LLM setup needed:", status.detail ?? status.setup?.message);
  });
  ensureOrienSearch().then((status) => {
    if (status.state === "setup_required") console.warn("Aura Orien setup needed:", status.detail ?? status.setup?.message);
  });
});
