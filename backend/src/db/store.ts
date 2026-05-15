import { randomUUID } from "node:crypto";
import { CONFIG } from "../config.js";
import type { GameState, KnowledgeGraph, LessonPath, StudentIntent, StudentProfile } from "../types.js";
import { db } from "./db.js";
import type { SupportedLanguage } from "../i18n/language.js";

const now = () => new Date().toISOString();

try {
  db.exec("ALTER TABLE sessions ADD COLUMN language TEXT NOT NULL DEFAULT 'en'");
} catch {
  // Column already exists — safe to ignore
}

export function defaultProfile(): StudentProfile {
  return {
    id: CONFIG.defaultProfileId,
    name: "Aarush",
    language: "en",
    supportNeeds: ["ADHD support", "dyslexia-friendly reading"],
    rewardStyle: "xp",
    xp: 312,
    streak: 5,
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

export function deleteSession(sessionId: string) {
  const session = loadSession(sessionId);
  if (session.graph_id) db.prepare("DELETE FROM knowledge_graphs WHERE id = ?").run(String(session.graph_id));
  if (session.lesson_path_id) db.prepare("DELETE FROM lesson_paths WHERE id = ?").run(String(session.lesson_path_id));
  db.prepare("DELETE FROM session_game_states WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export type SessionSummary = {
  id: string;
  topic: string;
  startedAt: string;
  nodeCount: number;
  masteredCount: number;
  masteryPct: number;
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
  const accuracy = graph.nodes.length > 0 ? Math.round((graph.nodes.reduce((sum, n) => sum + (n.mastery ?? 0), 0) / graph.nodes.length) * 100) : 0;
  return {
    sessionId,
    topic: String(session.topic),
    totalNodes: graph.nodes.length,
    masteredNodes: graph.nodes.filter((n) => (n.mastery ?? 0) >= 0.8).length,
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
    let masteryPct = 0;
    let currentIndex = 0;
    let totalItems = 0;
    if (r.graph_id) {
      try {
        const graph = loadGraph(r.graph_id);
        nodeCount = graph.nodes.length;
        masteredCount = graph.nodes.filter((n) => (n.mastery ?? 0) >= 0.8).length;
        masteryPct = nodeCount > 0 ? Math.round((graph.nodes.reduce((sum, n) => sum + (n.mastery ?? 0), 0) / nodeCount) * 100) : 0;
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
      masteryPct,
      currentIndex,
      totalItems,
    };
  });
}
