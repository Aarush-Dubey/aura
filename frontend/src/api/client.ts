import type { CacheOption, DevLogEntry, LessonResponse, StudentIntent } from "./types";

const desktopUrl = typeof window !== "undefined" ? (window as unknown as { auraDesktop?: { backendUrl?: string } }).auraDesktop?.backendUrl : undefined;
export const API_BASE = import.meta.env.VITE_API_BASE_URL || desktopUrl || "http://localhost:3001";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      message = parsed.error ?? text;
    } catch {}
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => json<{ ok: boolean; llm: { ready: boolean; state: string; expectedModel: string; detail?: string | null } }>("/health"),
  generateLesson: (topic: string, intent: StudentIntent, cacheId?: string) => json<LessonResponse>("/generateLesson", { method: "POST", body: JSON.stringify({ topic, intent, cacheId: cacheId || undefined }) }),
  generateNodeCards: (sessionId: string, nodeId: string) => json<{ cards: LessonResponse["cards"] }>("/node/cards", { method: "POST", body: JSON.stringify({ sessionId, nodeId }) }),
  respond: (sessionId: string, studentMessage: string) => json<Partial<LessonResponse> & { assistantMessage: string; mapState: LessonResponse["mapState"]; cards: LessonResponse["cards"]; gameEvents: LessonResponse["gameState"]["recentEvents"] }>("/tutor/respond", { method: "POST", body: JSON.stringify({ sessionId, studentMessage }) }),
  caches: (topic: string) => json<{ topic: string; caches: CacheOption[] }>(`/dev/cache?topic=${encodeURIComponent(topic)}`),
  logs: () => json<{ logs: DevLogEntry[] }>("/dev/logs?limit=120")
};
