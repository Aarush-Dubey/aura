import { create } from "zustand";
import i18n from "../i18n/i18n";
import type { SupportedLanguage } from "../i18n/languages";
import type { LessonCard, LessonResponse, MapState, GameState, KnowledgeGraph, LessonPath, LlmHealth, StudentProfile, Telemetry } from "../api/types";

export type Screen =
  | "dashboard"
  | "workspace_create"
  | "goal"
  | "plan"
  | "lesson"
  | "insights"
  | "workspace_overview";

export type LearnerMode = "both" | "adhd" | "dyslexia" | "none";

type ChatMessage = {
  role: "student" | "aura";
  text: string;
  at: number;
};

export type EffortEvent = {
  id: string;
  type:
    | "focus_block_started"
    | "focus_block_completed"
    | "card_started"
    | "card_completed"
    | "answer_submitted"
    | "hint_requested"
    | "voice_used"
    | "break_started"
    | "break_completed"
    | "adaptive_nudge";
  at: number;
  cardId?: string;
  nodeId?: string;
  elapsedMs?: number;
  correct?: boolean;
  label?: string;
  detail?: string;
};

type SessionSlice = {
  sessionId: string | null;
  graph: KnowledgeGraph | null;
  lessonPath: LessonPath | null;
  mapState: MapState | null;
  gameState: GameState | null;
  cards: LessonCard[];
  cardCursor: number;
  missionMetadata: LessonResponse["missionMetadata"] | null;
  openingMessage: string;
  topic: string;
  goal: string;
  effortEvents: EffortEvent[];
};

type SettingsSlice = {
  language: SupportedLanguage;
  bgTone: "cream" | "white" | "mint" | "dark";
  font: "lexend" | "opendyslexic" | "system";
  learnerMode: LearnerMode;
  focusMode: boolean;
  bionicReading: boolean;
  animation: "calm" | "lively";
  letterSpacing: number;
  lineHeight: number;
  readAloud: boolean;
  readSpeed: number;
  focusBlockMinutes: 5 | 10 | 20 | 25;
  proactiveBreaks: boolean;
  movementBreaks: boolean;
  breakGames: boolean;
};

type ChatSlice = {
  isOpen: boolean;
  mode: "keyboard" | "voice";
  messages: ChatMessage[];
  isLoading: boolean;
};

type AuraState = {
  screen: Screen;
  session: SessionSlice;
  settings: SettingsSlice;
  profile: StudentProfile | null;
  chat: ChatSlice;
  telemetry: Telemetry | null;
  llmHealth: LlmHealth | null;

  navigate: (screen: Screen) => void;

  setSession: (data: Partial<SessionSlice>) => void;
  loadLesson: (response: LessonResponse) => void;
  advanceCard: () => void;
  previousCard: () => void;
  setCardCursor: (cursor: number) => void;
  injectCard: (card: LessonCard) => void;
  trackEffort: (event: Omit<EffortEvent, "id" | "at"> & { at?: number }) => void;

  setSetting: <K extends keyof SettingsSlice>(key: K, value: SettingsSlice[K]) => void;
  setProfile: (profile: StudentProfile | null) => void;
  patchProfile: (profile: Partial<StudentProfile>) => void;
  setLlmHealth: (health: LlmHealth | null) => void;
  clearSession: () => void;

  openChat: (mode?: "keyboard" | "voice") => void;
  closeChat: () => void;
  addChatMessage: (msg: ChatMessage) => void;
  setChatLoading: (loading: boolean) => void;
  clearChat: () => void;

  setTelemetry: (t: Telemetry) => void;
};

const defaultSession: SessionSlice = {
  sessionId: null,
  graph: null,
  lessonPath: null,
  mapState: null,
  gameState: null,
  cards: [],
  cardCursor: 0,
  missionMetadata: null,
  openingMessage: "",
  topic: "",
  goal: "",
  effortEvents: [],
};

const defaultSettings: SettingsSlice = {
  language: "en",
  bgTone: "mint",
  font: "lexend",
  learnerMode: "both",
  focusMode: false,
  bionicReading: false,
  animation: "calm",
  letterSpacing: 0.04,
  lineHeight: 1.65,
  readAloud: false,
  readSpeed: 1,
  focusBlockMinutes: 10,
  proactiveBreaks: true,
  movementBreaks: true,
  breakGames: true,
};

const loadSettings = (): SettingsSlice => {
  try {
    const saved = localStorage.getItem("aura-settings");
    if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
  } catch {}
  return defaultSettings;
};

export const useAuraStore = create<AuraState>((set, get) => ({
  screen: "dashboard",
  session: { ...defaultSession },
  settings: loadSettings(),
  profile: null,
  chat: { isOpen: false, mode: "keyboard", messages: [], isLoading: false },
  telemetry: null,
  llmHealth: null,

  navigate: (screen) => set({ screen }),

  setSession: (data) => set((s) => ({ session: { ...s.session, ...data } })),

  loadLesson: (response) =>
    set((s) => ({
      session: {
        ...s.session,
        sessionId: response.sessionId,
        graph: response.graph,
        lessonPath: response.lessonPath,
        mapState: response.mapState,
        gameState: response.gameState,
        cards: response.cards,
        cardCursor: 0,
        missionMetadata: response.missionMetadata,
        openingMessage: response.openingMessage,
        topic: response.graph.topic,
        effortEvents: [],
      },
    })),

  advanceCard: () =>
    set((s) => {
      const next = s.session.cardCursor + 1;
      if (next >= s.session.cards.length) return s;
      return { session: { ...s.session, cardCursor: next } };
    }),

  previousCard: () =>
    set((s) => {
      const prev = Math.max(0, s.session.cardCursor - 1);
      return { session: { ...s.session, cardCursor: prev } };
    }),

  setCardCursor: (cursor) =>
    set((s) => ({ session: { ...s.session, cardCursor: cursor } })),

  injectCard: (card) =>
    set((s) => {
      const idx = s.session.cardCursor + 1;
      const cards = [...s.session.cards];
      cards.splice(idx, 0, card);
      return { session: { ...s.session, cards } };
    }),

  trackEffort: (event) =>
    set((s) => {
      const next: EffortEvent = {
        ...event,
        id: `${event.type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        at: event.at ?? Date.now(),
      };
      return {
        session: {
          ...s.session,
          effortEvents: [next, ...s.session.effortEvents].slice(0, 120),
        },
      };
    }),

  setSetting: (key, value) =>
    set((s) => {
      const next = { ...s.settings, [key]: value };
      try { localStorage.setItem("aura-settings", JSON.stringify(next)); } catch {}
      if (key === "language") {
        i18n.changeLanguage(value as string);
        document.documentElement.lang = value as string;
      }
      return { settings: next };
    }),

  setProfile: (profile) =>
    set((s) => {
      if (!profile) return { profile };
      const language = (profile.language as SupportedLanguage | undefined) ?? s.settings.language;
      const learnerMode: LearnerMode = profile.dyslexiaMode && profile.adhdSupport ? "both" : profile.dyslexiaMode ? "dyslexia" : profile.adhdSupport ? "adhd" : "none";
      const nextSettings = { ...s.settings, language, learnerMode };
      try { localStorage.setItem("aura-settings", JSON.stringify(nextSettings)); } catch {}
      i18n.changeLanguage(language);
      document.documentElement.lang = language;
      return { profile, settings: nextSettings };
    }),

  patchProfile: (profilePatch) =>
    set((s) => ({ profile: s.profile ? { ...s.profile, ...profilePatch } : s.profile })),

  setLlmHealth: (health) => set({ llmHealth: health }),

  clearSession: () => set({ session: { ...defaultSession } }),

  openChat: (mode = "keyboard") =>
    set((s) => ({ chat: { ...s.chat, isOpen: true, mode } })),

  closeChat: () =>
    set((s) => ({ chat: { ...s.chat, isOpen: false } })),

  addChatMessage: (msg) =>
    set((s) => ({ chat: { ...s.chat, messages: [...s.chat.messages, msg] } })),

  setChatLoading: (loading) =>
    set((s) => ({ chat: { ...s.chat, isLoading: loading } })),

  clearChat: () =>
    set((s) => ({ chat: { ...s.chat, messages: [] } })),

  setTelemetry: (t) => set({ telemetry: t }),
}));
