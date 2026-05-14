import { db } from "@/db";
import { bets, wagers, submissions, type Bet } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

export interface BetSummary {
  bet: Bet;
  poolTotal: number;
  numBettors: number;
  yourStake: number | null;
}

export function listBetsByStatuses(statuses: Bet["status"][], currentUserId: number | null): BetSummary[] {
  if (statuses.length === 0) return [];
  const rows = db.select().from(bets).where(inArray(bets.status, statuses)).all();
  if (rows.length === 0) return [];

  const ids = rows.map((b) => b.id);
  const wagerAgg = db
    .select({
      betId: wagers.betId,
      poolTotal: sql<number>`sum(${wagers.stake})`.as("poolTotal"),
      numBettors: sql<number>`count(*)`.as("numBettors"),
    })
    .from(wagers)
    .where(inArray(wagers.betId, ids))
    .groupBy(wagers.betId)
    .all();
  const wagerMap = new Map(wagerAgg.map((r) => [r.betId, r]));

  const submissionAgg = db
    .select({
      betId: submissions.betId,
      numEntries: sql<number>`count(*)`.as("numEntries"),
    })
    .from(submissions)
    .where(inArray(submissions.betId, ids))
    .groupBy(submissions.betId)
    .all();
  const subMap = new Map(submissionAgg.map((r) => [r.betId, r]));

  const yourStakeMap = new Map<number, number>();
  if (currentUserId) {
    const yours = db
      .select({ betId: wagers.betId, stake: wagers.stake })
      .from(wagers)
      .where(eq(wagers.userId, currentUserId))
      .all();
    for (const y of yours) yourStakeMap.set(y.betId, y.stake);
  }

  return rows.map((b) => {
    let poolTotal: number;
    let numBettors: number;
    if (b.betType === "gif_challenge") {
      const s = subMap.get(b.id);
      const n = s?.numEntries ?? 0;
      poolTotal = n * (b.entryFee ?? 0);
      numBettors = n;
    } else {
      const w = wagerMap.get(b.id);
      poolTotal = Number(w?.poolTotal ?? 0);
      numBettors = Number(w?.numBettors ?? 0);
    }
    return {
      bet: b,
      poolTotal,
      numBettors,
      yourStake: yourStakeMap.get(b.id) ?? null,
    };
  });
}
