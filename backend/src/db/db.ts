import Database from "better-sqlite3";
import { CONFIG } from "../config.js";

export const db = new Database(CONFIG.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function getJson<T>(sql: string, params: unknown[] = [], column = "data_json"): T | null {
  const row = db.prepare(sql).get(...params) as Record<string, string> | undefined;
  return row ? JSON.parse(row[column]) as T : null;
}
