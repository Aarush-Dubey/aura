import { create } from "zustand";
import i18n from "../i18n/i18n";
import type { SupportedLanguage } from "../i18n/languages";
import type { LessonCard, LessonResponse, MapState, GameState, KnowledgeGraph, LessonPath, Telemetry } from "../api/types";

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

type SessionSlice = {
  sessionId: string | null;
  graph: KnowledgeGraph | null;
  lessonPath: LessonPath | null;
  mapState: MapState | null;
  gameState: GameState | null;
  cards: LessonCard[];
  cardCursor: number;
  missionMetadata: LessonResponse["missionMetadata"] | null;
  topic: string;
  goal: string;
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
  chat: ChatSlice;
  telemetry: Telemetry | null;

  navigate: (screen: Screen) => void;

  setSession: (data: Partial<SessionSlice>) => void;
  loadLesson: (response: LessonResponse) => void;
  advanceCard: () => void;
  previousCard: () => void;
  setCardCursor: (cursor: number) => void;
  injectCard: (card: LessonCard) => void;

  setSetting: <K extends keyof SettingsSlice>(key: K, value: SettingsSlice[K]) => void;

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
  topic: "",
  goal: "",
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
  chat: { isOpen: false, mode: "keyboard", messages: [], isLoading: false },
  telemetry: null,

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
        topic: response.graph.topic,
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
