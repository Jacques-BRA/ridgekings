#!/usr/bin/env node
// Apply any pending Drizzle migrations to the SQLite DB.
// Invoked from railway.json's startCommand before `next start` takes traffic.
// Idempotent — re-running with no pending migrations is a no-op.
//
// Environment:
//   DATABASE_URL  Connection string or file: URI. Default: file:./data/app.db

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const raw = process.env.DATABASE_URL ?? "file:./data/app.db";
const dbPath = resolve(raw.replace(/^file:/, ""));
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

try {
  const startedAt = Date.now();
  migrate(db, { migrationsFolder: "./db/migrations" });
  console.log(`migrations applied in ${Date.now() - startedAt}ms (db: ${dbPath})`);
} finally {
  sqlite.close();
}
