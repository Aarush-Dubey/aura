import Database from "better-sqlite3";
import { CONFIG } from "../config.js";

export const db = new Database(CONFIG.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function getJson<T>(sql: string, params: unknown[] = [], column = "data_json"): T | null {
  const row = db.prepare(sql).get(...params) as Record<string, string> | undefined;
  return row ? JSON.parse(row[column]) as T : null;
}

/**
 * Wrap a synchronous function so all of its writes commit atomically — either
 * every statement lands or none do. Any thrown error rolls the whole thing back.
 * Thin typed wrapper over better-sqlite3's `db.transaction`.
 */
export function transaction<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  return db.transaction(fn) as unknown as (...args: A) => void;
}
