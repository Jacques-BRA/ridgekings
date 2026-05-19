import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "node:path";
import { mkdirSync } from "node:fs";

const dbPath = process.env.DATABASE_URL?.replace(/^file:/, "") ?? path.join(process.cwd(), "data/app.db");

// `next build` evaluates server modules to collect page data, which opens this
// connection. In Docker the volume mount path (/data) only exists at runtime,
// so we make the parent dir on the fly. At runtime the Railway volume mount
// overlays whatever's here, so the placeholder doesn't leak into production.
mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };
