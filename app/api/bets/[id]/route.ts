import { NextResponse } from "next/server";
import { db } from "@/db";
import { bets, outcomes, wagers, submissions, gifVotes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { reconcileBetStatus } from "@/lib/sweeps";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const betId = Number(id);
  if (!Number.isFinite(betId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  await reconcileBetStatus(betId);
  const bet = db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!bet) return NextResponse.json({ error: "not found" }, { status: 404 });
  const ocs = db.select().from(outcomes).where(eq(outcomes.betId, betId)).all();
  const w = db.select().from(wagers).where(eq(wagers.betId, betId)).all();
  const subs = db.select().from(submissions).where(eq(submissions.betId, betId)).all();
  const gv = db.select().from(gifVotes).where(eq(gifVotes.betId, betId)).all();
  return NextResponse.json({ bet, outcomes: ocs, wagers: w, submissions: subs, gifVotes: gv });
}
