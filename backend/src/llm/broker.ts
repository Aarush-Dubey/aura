import { performance } from "node:perf_hooks";
import { CONFIG } from "../config.js";
import { devLog } from "../dev/logs.js";

export type LLMJobType =
  | "graph_plan"
  | "image_to_graph"
  | "current_card"
  | "prefetch_card"
  | "prefetch_node"
  | "chat_reply"
  | "answer_tool_call"
  | "repair_card"
  | "create_quiz"
  | "polish"
  | "voice_rewrite"
  | "mtp_benchmark"
  | "health_probe";

export type LLMJobOptions = {
  type?: LLMJobType;
  priority?: number;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  json?: boolean;
  mayUseMtp?: boolean;
  label?: string;
};

type QueueEntry = {
  id: string;
  type: LLMJobType;
  priority: number;
  label: string;
  queuedAt: number;
  run: (slot: number) => Promise<string>;
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
};

type CompletedJob = {
  id: string;
  type: LLMJobType;
  label: string;
  queueMs: number;
  totalMs: number;
  approximateTtftMs: number;
  outputChars: number;
  approximateTokens: number;
  approximateTokensPerSecond: number;
  mtp: boolean;
  at: string;
};

type BrokerEvent = {
  at: string;
  type: "queued" | "started" | "completed" | "failed" | "preempted" | "cache_hit" | "mtp_toggle";
  message: string;
};

let nextJobId = 1;
const activeSlots: (QueueEntry | null)[] = [null, null];
const queue: QueueEntry[] = [];
const events: BrokerEvent[] = [];
const completed: CompletedJob[] = [];
let externalNetworkBytes = 0;
let cloudCalls = 0;
let mtpOverride: boolean | null = null;

function maxSlots(): number {
  return CONFIG.llmBaseUrl2 ? 2 : 1;
}

function activeCount(): number {
  return activeSlots.filter(Boolean).length;
}

function freeSlotIndex(): number {
  for (let i = 0; i < maxSlots(); i++) {
    if (!activeSlots[i]) return i;
  }
  return -1;
}

function baseUrlForSlot(slot: number): string {
  if (slot === 1 && CONFIG.llmBaseUrl2) return CONFIG.llmBaseUrl2.replace(/\/$/, "");
  return CONFIG.llmBaseUrl.replace(/\/$/, "");
}

function nowIso() {
  return new Date().toISOString();
}

function pushEvent(event: BrokerEvent) {
  events.unshift(event);
  events.splice(40);
  devLog("info", "broker", event.message, { event: event.type });
}

function approximateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function sortQueue() {
  queue.sort((a, b) => a.priority - b.priority || a.queuedAt - b.queuedAt);
}

function isExternalUrl(url: string) {
  try {
    const parsed = new URL(url);
    return !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function geminiUrl(model = CONFIG.llmModel, slot = 0) {
  const base = baseUrlForSlot(slot);
  return `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

function extractGeminiText(data: unknown): string {
  const response = data as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
}

function shouldRecoverLocalLLM(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|econnrefused|econnreset|socket|timed out|timeout|network|terminated|aborted/i.test(message);
}

async function performGeminiRequest(body: unknown, opts: LLMJobOptions, slot = 0) {
  const { ensureLocalLLM, recoverLocalLLM } = await import("./runtime.js");
  const status = await ensureLocalLLM();
  if (!status.ready) {
    throw new Error(status.detail || status.setup?.message || "Local LiteRT-LM is not ready.");
  }

  const url = geminiUrl(CONFIG.llmModel, slot);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const requestStarted = performance.now();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000)
      });
      const responseReceived = performance.now();

      if (isExternalUrl(url)) {
        cloudCalls += 1;
        const length = Number(res.headers.get("content-length") ?? 0);
        externalNetworkBytes += Number.isFinite(length) ? length : 0;
      }

      if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`);
      const text = extractGeminiText(await res.json());
      return {
        text,
        approximateTtftMs: responseReceived - requestStarted
      };
    } catch (error) {
      if (attempt === 0 && shouldRecoverLocalLLM(error)) {
        const detail = error instanceof Error ? error.message : String(error);
        devLog("warn", "llm", "Gemma request failed, attempting local revive", { detail });
        await recoverLocalLLM(`Gemma request failed: ${detail}`);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Gemma request failed after retry.");
}

function pumpQueue() {
  while (queue.length > 0) {
    const slot = freeSlotIndex();
    if (slot === -1) return;
    sortQueue();
    const job = queue.shift();
    if (!job) return;

    activeSlots[slot] = job;
    pushEvent({ at: nowIso(), type: "started", message: `Started ${job.type} [slot ${slot}]: ${job.label}` });
    void (async () => {
      try {
        const output = await job.run(slot);
        job.resolve(output);
        pushEvent({ at: nowIso(), type: "completed", message: `Completed ${job.type} [slot ${slot}]: ${job.label}` });
      } catch (error) {
        job.reject(error);
        pushEvent({
          at: nowIso(),
          type: "failed",
          message: `Failed ${job.type} [slot ${slot}]: ${error instanceof Error ? error.message : String(error)}`
        });
      }
      activeSlots[slot] = null;
      pumpQueue();
    })();
  }
}

export async function runGeminiJob(prompt: string, opts: LLMJobOptions = {}) {
  const type = opts.type ?? "current_card";
  const priority = opts.priority ?? priorityFor(type);
  const label = opts.label ?? prompt.slice(0, 72).replace(/\s+/g, " ");
  const maxTokens = opts.maxTokens ?? 1024;
  const temperature = opts.temperature ?? 0.3;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(opts.json ? { responseMimeType: "application/json" } : {})
    }
  };

  return enqueueGeminiBody(body, { ...opts, type, priority, label, maxTokens, temperature });
}

export async function runGeminiBodyJob(body: unknown, opts: LLMJobOptions = {}) {
  const type = opts.type ?? "current_card";
  const priority = opts.priority ?? priorityFor(type);
  const label = opts.label ?? type;
  return enqueueGeminiBody(body, { ...opts, type, priority, label });
}

function enqueueGeminiBody(body: unknown, opts: LLMJobOptions) {
  const type = opts.type ?? "current_card";
  const priority = opts.priority ?? priorityFor(type);
  const label = opts.label ?? type;
  const id = `llm_job_${nextJobId++}`;

  const lowestActivePriority = activeSlots.reduce((min, s) => s ? Math.min(min, s.priority) : min, Infinity);
  if (priority < lowestActivePriority && activeCount() > 0) {
    pushEvent({
      at: nowIso(),
      type: "preempted",
      message: `Priority swap: ${type} queued before background work`
    });
  }

  return new Promise<string>((resolve, reject) => {
    const entry: QueueEntry = {
      id,
      type,
      priority,
      label,
      queuedAt: performance.now(),
      resolve,
      reject,
      run: async (slot: number) => {
        const started = performance.now();
        const result = await performGeminiRequest(body, opts, slot);
        const finished = performance.now();
        const tokens = approximateTokens(result.text);
        const decodeSeconds = Math.max(0.001, (finished - started) / 1000);
        completed.unshift({
          id,
          type,
          label,
          queueMs: started - entry.queuedAt,
          totalMs: finished - entry.queuedAt,
          approximateTtftMs: result.approximateTtftMs,
          outputChars: result.text.length,
          approximateTokens: tokens,
          approximateTokensPerSecond: Math.round(tokens / decodeSeconds),
          mtp: effectiveMtp(),
          at: nowIso()
        });
        completed.splice(20);
        return result.text;
      }
    };
    queue.push(entry);
    sortQueue();
    pushEvent({ at: nowIso(), type: "queued", message: `Queued ${type}: ${label}` });
    pumpQueue();
  });
}

export function priorityFor(type: LLMJobType) {
  const priorities: Record<LLMJobType, number> = {
    chat_reply: 0,
    answer_tool_call: 1,
    create_quiz: 1,
    current_card: 2,
    repair_card: 3,
    graph_plan: 4,
    image_to_graph: 4,
    prefetch_card: 5,
    prefetch_node: 5,
    polish: 6,
    voice_rewrite: 6,
    mtp_benchmark: 7,
    health_probe: 9
  };
  return priorities[type];
}

export function notePrefetchHit(label: string) {
  pushEvent({ at: nowIso(), type: "cache_hit", message: `Cache hit - 0ms: ${label}` });
}

export function setMtpOverride(value: boolean | null) {
  mtpOverride = value;
  pushEvent({ at: nowIso(), type: "mtp_toggle", message: `MTP ${effectiveMtp() ? "enabled" : "disabled"}` });
}

export function effectiveMtp() {
  return mtpOverride ?? CONFIG.llmMtpEnabled;
}

export function brokerTelemetry() {
  return {
    model: CONFIG.llmModel,
    backend: CONFIG.llmBackend,
    mtpEnabled: effectiveMtp(),
    engineState: activeCount() > 0 || queue.length ? "busy" : "warm",
    slots: maxSlots(),
    activeJobs: activeSlots.filter(Boolean).map(job => job ? { id: job.id, type: job.type, label: job.label, priority: job.priority } : null),
    activeJob: activeSlots.find(Boolean) ? { id: activeSlots.find(Boolean)!.id, type: activeSlots.find(Boolean)!.type, label: activeSlots.find(Boolean)!.label, priority: activeSlots.find(Boolean)!.priority } : null,
    queue: queue.map((job) => ({ id: job.id, type: job.type, label: job.label, priority: job.priority })),
    waitingJobs: queue.length,
    pausedJobs: activeCount() > 0 && queue.length ? queue.length : 0,
    dualInstance: !!CONFIG.llmBaseUrl2,
    recentEvents: events,
    lastJob: completed[0] ?? null,
    completedJobs: completed.slice(0, 5),
    network: {
      externalBytes: externalNetworkBytes,
      cloudCalls
    },
    memory: {
      backendRssBytes: process.memoryUsage().rss
    },
    prefetch: prefetchTelemetry
  };
}

const prefetchTelemetry = {
  status: "idle" as "idle" | "loading" | "ready" | "hit" | "failed",
  label: "",
  updatedAt: nowIso()
};

export function setPrefetchTelemetry(status: typeof prefetchTelemetry.status, label: string) {
  prefetchTelemetry.status = status;
  prefetchTelemetry.label = label;
  prefetchTelemetry.updatedAt = nowIso();
}
