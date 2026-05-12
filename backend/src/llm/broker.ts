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
  run: () => Promise<string>;
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
let active: QueueEntry | null = null;
const queue: QueueEntry[] = [];
const events: BrokerEvent[] = [];
const completed: CompletedJob[] = [];
let externalNetworkBytes = 0;
let cloudCalls = 0;
let mtpOverride: boolean | null = null;

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

export function geminiUrl(model = CONFIG.llmModel) {
  const base = CONFIG.llmBaseUrl.replace(/\/$/, "");
  return `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

function extractGeminiText(data: unknown): string {
  const response = data as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
}

async function performGeminiRequest(body: unknown, opts: LLMJobOptions) {
  const url = geminiUrl();
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
}

function pumpQueue() {
  if (active || !queue.length) return;
  sortQueue();
  active = queue.shift() ?? null;
  if (!active) return;

  const job = active;
  pushEvent({ at: nowIso(), type: "started", message: `Started ${job.type}: ${job.label}` });
  void (async () => {
    const started = performance.now();
    try {
      const output = await job.run();
      const finished = performance.now();
      job.resolve(output);
      pushEvent({ at: nowIso(), type: "completed", message: `Completed ${job.type}: ${job.label}` });
      active = null;
      pumpQueue();
      return { started, finished };
    } catch (error) {
      job.reject(error);
      pushEvent({
        at: nowIso(),
        type: "failed",
        message: `Failed ${job.type}: ${error instanceof Error ? error.message : String(error)}`
      });
      active = null;
      pumpQueue();
      return null;
    }
  })();
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

  if (active && priority < active.priority) {
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
      run: async () => {
        const started = performance.now();
        const result = await performGeminiRequest(body, opts);
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
    engineState: active || queue.length ? "busy" : "warm",
    activeJob: active ? { id: active.id, type: active.type, label: active.label, priority: active.priority } : null,
    queue: queue.map((job) => ({ id: job.id, type: job.type, label: job.label, priority: job.priority })),
    waitingJobs: queue.length,
    pausedJobs: active && queue.length ? queue.length : 0,
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
