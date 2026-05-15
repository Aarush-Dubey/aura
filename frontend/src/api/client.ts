import type { CacheOption, DevLogEntry, LessonCard, LessonResponse, StudentIntent, StudentProfile, Telemetry, TutorResponse } from "./types";
import { useAuraStore } from "../store/useAuraStore";

const desktopUrl = typeof window !== "undefined" ? (window as unknown as { auraDesktop?: { backendUrl?: string } }).auraDesktop?.backendUrl : undefined;

const resolveBase = (): string => {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  if (desktopUrl) return desktopUrl;
  if (import.meta.env.DEV) return `http://${window.location.hostname}:3101`;
  return "";
};

export const API_BASE = resolveBase();

function bodyWithLang(data: Record<string, unknown>): string {
  return JSON.stringify({ ...data, language: useAuraStore.getState().settings.language });
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const language = useAuraStore.getState().settings.language;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": language,
      ...(init?.headers ?? {})
    }
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
  health: () => json<{ ok: boolean; llm: { ready: boolean; state: string; expectedModel: string; backend?: string; mtpEnabled?: boolean; detail?: string | null }; telemetry: Telemetry }>("/health"),
  profile: () => json<StudentProfile>("/profile"),
  updateProfile: (profile: Partial<StudentProfile>) => json<StudentProfile>("/profile/update", { method: "POST", body: JSON.stringify(profile) }),
  telemetry: () => json<Telemetry>("/telemetry"),
  setMtp: async (enabled: boolean | null) => {
    const result = await json<{ telemetry: Telemetry }>("/llm/mtp", { method: "POST", body: JSON.stringify({ enabled }) });
    return result.telemetry;
  },
  generateLesson: (topic: string, intent: StudentIntent, cacheId?: string) => json<LessonResponse>("/generateLesson", { method: "POST", body: bodyWithLang({ topic, intent, cacheId: cacheId || undefined }) }),
  generateLessonFromImage: (imageData: string, mimeType: string, intent: StudentIntent) => json<LessonResponse>("/generateLessonFromImage", { method: "POST", body: bodyWithLang({ imageData, mimeType, intent }) }),
  generateNodeCards: (sessionId: string, nodeId: string) => json<{ cards: LessonResponse["cards"]; cacheHit?: boolean }>("/node/cards", { method: "POST", body: bodyWithLang({ sessionId, nodeId }) }),
  respond: (sessionId: string, studentMessage: string) => json<TutorResponse>("/tutor/respond", { method: "POST", body: bodyWithLang({ sessionId, studentMessage }) }),
  chatAsk: (sessionId: string | null, question: string, cardContext?: { type: string; title?: string; body?: string }) =>
    json<{ reply: string }>("/chat/ask", { method: "POST", body: bodyWithLang({ sessionId, question, cardContext }) }),
  caches: (topic: string) => json<{ topic: string; caches: CacheOption[] }>(`/dev/cache?topic=${encodeURIComponent(topic)}`),
  logs: () => json<{ logs: DevLogEntry[] }>("/dev/logs?limit=120"),
  listSessions: () => json<{ sessions: { id: string; topic: string; startedAt: string; nodeCount: number; masteredCount: number; masteryPct?: number; currentIndex: number; totalItems: number }[] }>("/sessions"),
  resumeSession: (id: string) => json<LessonResponse>(`/session/${id}/resume`),
  sessionInsights: (id: string) => json<{ sessionId: string; topic: string; totalNodes: number; masteredNodes: number; shakyNodes: string[]; accuracy: number; timeSpent: string; strongAreas: string[]; suggestion: string }>(`/session/${id}/insights`),
  deleteSession: (id: string) => json<{ ok: boolean }>(`/session/${id}`, { method: "DELETE" }),
  cardEvent: (event: { sessionId: string; cardId: string; nodeId: string; eventType: "answer_submitted" | "hint_requested" | "card_completed" | "power_up"; payload?: unknown; telemetry: { responseTimeMs: number; hintUsed: boolean; attemptNumber: number } }) =>
    json<Partial<TutorResponse>>("/card-event", { method: "POST", body: bodyWithLang(event as unknown as Record<string, unknown>) }),
  workspaceRevise: (sessionId: string) =>
    json<{ cards: LessonCard[]; nodeCount: number; mode: "revise" }>(`/workspace/${sessionId}/revise`, { method: "POST", body: bodyWithLang({}) }),
  workspaceTestLesson: (sessionId: string, nodeId: string) =>
    json<{ cards: LessonCard[]; nodeCount: number; mode: "test"; scope: "lesson"; topic: string }>(`/workspace/${sessionId}/test/${nodeId}`, { method: "POST", body: bodyWithLang({}) }),
  workspaceTestFinal: (sessionId: string) =>
    json<{ cards: LessonCard[]; nodeCount: number; mode: "test"; scope: "final" }>(`/workspace/${sessionId}/test`, { method: "POST", body: bodyWithLang({}) }),
};
