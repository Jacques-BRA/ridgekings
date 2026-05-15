import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  const startedAt = Date.now();
  try {
    db.get(sql`SELECT 1`);
    return NextResponse.json({
      status: "ok",
      db: "ok",
      durationMs: Date.now() - startedAt,
      uptimeSec: Math.round(process.uptime()),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "error",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}
