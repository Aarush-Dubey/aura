import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";

export function migrate() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const schema = fs.readFileSync(path.join(dir, "schema.sql"), "utf8");
  db.exec(schema);
}
