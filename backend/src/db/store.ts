import { randomUUID } from "node:crypto";
import { CONFIG } from "../config.js";
import type { GameState, KnowledgeGraph, LessonPath, StudentIntent, StudentProfile } from "../types.js";
import type { ReviewCard } from "../pipeline/spacedReview.js";
import { db } from "./db.js";
import type { SupportedLanguage } from "../i18n/language.js";

const now = () => new Date().toISOString();

try {
  db.exec("ALTER TABLE sessions ADD COLUMN language TEXT NOT NULL DEFAULT 'en'");
} catch {}

try {
  db.exec(`CREATE TABLE IF NOT EXISTS spaced_reviews (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, node_id TEXT NOT NULL,
    card_type TEXT NOT NULL, front TEXT NOT NULL, back TEXT NOT NULL,
    stability REAL NOT NULL DEFAULT 0, difficulty REAL NOT NULL DEFAULT 0,
    due_date TEXT NOT NULL, last_review TEXT NOT NULL,
    interval_days REAL NOT NULL DEFAULT 0, reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL
  )`);
} catch {}

try {
  db.exec(`CREATE TABLE IF NOT EXISTS session_accuracy (
    session_id TEXT NOT NULL, card_id TEXT NOT NULL,
    correct INTEGER NOT NULL, response_ms INTEGER NOT NULL DEFAULT 0,
    answered_at TEXT NOT NULL, PRIMARY KEY (session_id, card_id)
  )`);
} catch {}

export function defaultProfile(): StudentProfile {
  return {
    id: CONFIG.defaultProfileId,
    readingMode: "short_chunks",
    pace: "medium",
    dyslexiaMode: false,
    adhdSupport: true,
    prefers: ["examples first", "short cards"],
    avoid: ["dense paragraphs", "timed pressure"],
    strengths: [],
    struggles: [],
    topicConfidence: {},
    recentPatterns: { confusionTriggers: [], helpfulStrategies: [] },
    conceptMastery: {},
    spacedReviews: []
  };
}

export function loadProfile(id = CONFIG.defaultProfileId): StudentProfile {
  const row = db.prepare("SELECT data_json FROM student_profiles WHERE id = ?").get(id) as { data_json: string } | undefined;
  if (row) return JSON.parse(row.data_json) as StudentProfile;
  const profile = defaultProfile();
  db.prepare("INSERT INTO student_profiles (id, data_json, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, JSON.stringify(profile), now(), now());
  return profile;
}

export function saveProfile(profile: StudentProfile) {
  db.prepare(`
    INSERT INTO student_profiles (id, data_json, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
  `).run(profile.id, JSON.stringify(profile), now(), now());
}

export function createSession(profileId: string, topic: string, intent: StudentIntent, goalMode: string, language: SupportedLanguage = 'en') {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO sessions (id, student_profile_id, topic, intent_json, goal_mode, language, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, profileId, topic, JSON.stringify(intent), goalMode, language, now());
  return id;
}

export function loadSession(sessionId: string) {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as Record<string, unknown> | undefined;
  if (!row) throw new Error(`Unknown session ${sessionId}`);
  return row;
}

export function saveGraph(sessionId: string, graph: KnowledgeGraph) {
  db.prepare("INSERT OR REPLACE INTO knowledge_graphs (id, session_id, graph_json, created_at) VALUES (?, ?, ?, ?)").run(graph.id, sessionId, JSON.stringify(graph), now());
  db.prepare("UPDATE sessions SET graph_id = ? WHERE id = ?").run(graph.id, sessionId);
}

export function loadGraph(graphId: string): KnowledgeGraph {
  const row = db.prepare("SELECT graph_json FROM knowledge_graphs WHERE id = ?").get(graphId) as { graph_json: string } | undefined;
  if (!row) throw new Error(`Unknown graph ${graphId}`);
  return JSON.parse(row.graph_json) as KnowledgeGraph;
}

export function savePath(sessionId: string, path: LessonPath) {
  const id = `${sessionId}_path`;
  db.prepare(`
    INSERT INTO lesson_paths (id, session_id, path_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET path_json = excluded.path_json, updated_at = excluded.updated_at
  `).run(id, sessionId, JSON.stringify(path), now(), now());
  db.prepare("UPDATE sessions SET lesson_path_id = ?, current_index = ? WHERE id = ?").run(id, path.currentIndex, sessionId);
}

export function loadPath(pathId: string): LessonPath {
  const row = db.prepare("SELECT path_json FROM lesson_paths WHERE id = ?").get(pathId) as { path_json: string } | undefined;
  if (!row) throw new Error(`Unknown lesson path ${pathId}`);
  return JSON.parse(row.path_json) as LessonPath;
}

export function saveGameState(sessionId: string, gameState: GameState) {
  db.prepare(`
    INSERT INTO session_game_states (session_id, game_state_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET game_state_json = excluded.game_state_json, updated_at = excluded.updated_at
  `).run(sessionId, JSON.stringify(gameState), now());
}

export function loadGameState(sessionId: string): GameState {
  const row = db.prepare("SELECT game_state_json FROM session_game_states WHERE session_id = ?").get(sessionId) as { game_state_json: string } | undefined;
  if (!row) throw new Error(`Unknown game state ${sessionId}`);
  return JSON.parse(row.game_state_json) as GameState;
}

export function saveHistory(sessionId: string, history: unknown[]) {
  db.prepare("UPDATE sessions SET history_json = ? WHERE id = ?").run(JSON.stringify(history), sessionId);
}

export type SessionSummary = {
  id: string;
  topic: string;
  startedAt: string;
  nodeCount: number;
  masteredCount: number;
  currentIndex: number;
  totalItems: number;
};

export type SessionInsights = {
  sessionId: string;
  topic: string;
  totalNodes: number;
  masteredNodes: number;
  shakyNodes: string[];
  accuracy: number;
  timeSpent: string;
  strongAreas: string[];
  suggestion: string;
};

export function getSessionInsights(sessionId: string): SessionInsights {
  const session = loadSession(sessionId);
  const graph = loadGraph(String(session.graph_id));
  const path = loadPath(String(session.lesson_path_id));
  const mastered = graph.nodes.filter((n) => n.status === "mastered");
  const shaky = graph.nodes.filter((n) => n.status === "shaky");
  const accuracy = graph.nodes.length > 0 ? Math.round((mastered.length / graph.nodes.length) * 100) : 0;
  return {
    sessionId,
    topic: String(session.topic),
    totalNodes: graph.nodes.length,
    masteredNodes: mastered.length,
    shakyNodes: shaky.map((n) => n.topicName),
    accuracy,
    timeSpent: `${Math.max(1, Math.round(path.items.length * 2.5))} min`,
    strongAreas: mastered.slice(0, 3).map((n) => n.topicName),
    suggestion: shaky.length > 0 ? `Review ${shaky[0].topicName} — it came up as shaky.` : "Solid session. Try a new topic or revisit in a few days."
  };
}

export function listSessions(): SessionSummary[] {
  const rows = db.prepare(`
    SELECT s.id, s.topic, s.started_at, s.graph_id, s.lesson_path_id
    FROM sessions s
    ORDER BY s.started_at DESC
    LIMIT 50
  `).all() as { id: string; topic: string; started_at: string; graph_id: string | null; lesson_path_id: string | null }[];

  return rows.map((r) => {
    let nodeCount = 0;
    let masteredCount = 0;
    let currentIndex = 0;
    let totalItems = 0;
    if (r.graph_id) {
      try {
        const graph = loadGraph(r.graph_id);
        nodeCount = graph.nodes.length;
        masteredCount = graph.nodes.filter((n) => n.status === "mastered").length;
      } catch {}
    }
    if (r.lesson_path_id) {
      try {
        const path = loadPath(r.lesson_path_id);
        currentIndex = path.currentIndex;
        totalItems = path.items.length;
      } catch {}
    }
    return {
      id: r.id,
      topic: r.topic,
      startedAt: r.started_at,
      nodeCount,
      masteredCount,
      currentIndex,
      totalItems,
    };
  });
}

// ── Spaced Review CRUD ──────────────────────────────────────────────────

export function saveReviewCard(card: ReviewCard) {
  db.prepare(`
    INSERT INTO spaced_reviews (id, session_id, node_id, card_type, front, back, stability, difficulty, due_date, last_review, interval_days, reps, lapses, state, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET stability=excluded.stability, difficulty=excluded.difficulty, due_date=excluded.due_date, last_review=excluded.last_review, interval_days=excluded.interval_days, reps=excluded.reps, lapses=excluded.lapses, state=excluded.state
  `).run(card.id, card.sessionId, card.nodeId, card.cardType, card.front, card.back, card.stability, card.difficulty, card.dueDate, card.lastReview, card.interval, card.reps, card.lapses, card.state, now());
}

export function loadDueReviews(limit = 100): ReviewCard[] {
  const rows = db.prepare(`
    SELECT * FROM spaced_reviews WHERE due_date <= ? ORDER BY due_date ASC LIMIT ?
  `).all(now(), limit) as any[];
  return rows.map(rowToReviewCard);
}

export function loadAllReviews(): ReviewCard[] {
  const rows = db.prepare(`SELECT * FROM spaced_reviews ORDER BY due_date ASC`).all() as any[];
  return rows.map(rowToReviewCard);
}

export function loadReviewsBySession(sessionId: string): ReviewCard[] {
  const rows = db.prepare(`SELECT * FROM spaced_reviews WHERE session_id = ? ORDER BY due_date ASC`).all(sessionId) as any[];
  return rows.map(rowToReviewCard);
}

export function loadReviewCard(id: string): ReviewCard | undefined {
  const row = db.prepare(`SELECT * FROM spaced_reviews WHERE id = ?`).get(id) as any;
  return row ? rowToReviewCard(row) : undefined;
}

export function reviewStats(): { total: number; due: number; newCount: number; learning: number; review: number } {
  const total = (db.prepare(`SELECT COUNT(*) as c FROM spaced_reviews`).get() as any).c;
  const due = (db.prepare(`SELECT COUNT(*) as c FROM spaced_reviews WHERE due_date <= ?`).get(now()) as any).c;
  const newCount = (db.prepare(`SELECT COUNT(*) as c FROM spaced_reviews WHERE state = 'new'`).get() as any).c;
  const learning = (db.prepare(`SELECT COUNT(*) as c FROM spaced_reviews WHERE state IN ('learning','relearning')`).get() as any).c;
  const review = (db.prepare(`SELECT COUNT(*) as c FROM spaced_reviews WHERE state = 'review'`).get() as any).c;
  return { total, due, newCount, learning, review };
}

function rowToReviewCard(row: any): ReviewCard {
  return {
    id: row.id,
    sessionId: row.session_id,
    nodeId: row.node_id,
    cardType: row.card_type,
    front: row.front,
    back: row.back,
    stability: row.stability,
    difficulty: row.difficulty,
    dueDate: row.due_date,
    lastReview: row.last_review,
    interval: row.interval_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
  };
}

// ── Session Accuracy Tracking ───────────────────────────────────────────

export function recordAnswer(sessionId: string, cardId: string, correct: boolean, responseMs = 0) {
  db.prepare(`
    INSERT INTO session_accuracy (session_id, card_id, correct, response_ms, answered_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id, card_id) DO UPDATE SET correct=excluded.correct, response_ms=excluded.response_ms, answered_at=excluded.answered_at
  `).run(sessionId, cardId, correct ? 1 : 0, responseMs, now());
}

export function getSessionAccuracy(sessionId: string): { total: number; correct: number; rate: number } {
  const row = db.prepare(`
    SELECT COUNT(*) as total, SUM(correct) as correct FROM session_accuracy WHERE session_id = ?
  `).get(sessionId) as { total: number; correct: number };
  return { total: row.total, correct: row.correct ?? 0, rate: row.total > 0 ? (row.correct ?? 0) / row.total : 0 };
}

export function getRecentAccuracy(sessionId: string, windowSize = 5): number {
  const rows = db.prepare(`
    SELECT correct FROM session_accuracy WHERE session_id = ? ORDER BY answered_at DESC LIMIT ?
  `).all(sessionId, windowSize) as { correct: number }[];
  if (rows.length === 0) return 0.8;
  return rows.reduce((sum, r) => sum + r.correct, 0) / rows.length;
}
