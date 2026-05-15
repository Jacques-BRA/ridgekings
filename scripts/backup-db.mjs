#!/usr/bin/env node
// Online SQLite backup using better-sqlite3's backup() API.
// Safe to run while the app is live.
//
// Environment:
//   DATABASE_PATH        Path to the live DB. Default: ./data/app.db
//   BACKUP_DIR           Directory to write backups into. Default: ./backups
//   BACKUP_RETAIN_DAYS   Delete backups older than this many days. Default: 14

import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";

const dbPath = process.env.DATABASE_PATH
  ? process.env.DATABASE_PATH.replace(/^file:/, "")
  : "./data/app.db";
const backupDir = resolve(process.env.BACKUP_DIR ?? "./backups");
const retainDays = Number(process.env.BACKUP_RETAIN_DAYS ?? 14);

mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace(/T/, "T");
const outPath = join(backupDir, `app-${stamp}.db`);

const db = new Database(resolve(dbPath), { readonly: true, fileMustExist: true });
try {
  await db.backup(outPath);
  console.log(`backup ok: ${outPath}`);
} finally {
  db.close();
}

if (Number.isFinite(retainDays) && retainDays > 0) {
  const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const f of readdirSync(backupDir)) {
    if (!f.startsWith("app-") || !f.endsWith(".db")) continue;
    const p = join(backupDir, f);
    if (statSync(p).mtimeMs < cutoff) {
      unlinkSync(p);
      pruned++;
    }
  }
  if (pruned > 0) console.log(`pruned ${pruned} backup(s) older than ${retainDays} days`);
}
