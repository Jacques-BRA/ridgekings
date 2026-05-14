import { db } from "@/db";
import { bets, stipendLog, transactions, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { nextStatusAfterDeadlines } from "./settlement";
import { applySettlement } from "./apply-settlement";
import { env } from "./env";
import { isoWeekOf } from "./iso-week";

export async function reconcileBetStatus(betId: number): Promise<void> {
  const b = db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!b) return;
  const next = nextStatusAfterDeadlines({
    currentStatus: b.status,
    betType: b.betType,
    deadline: b.deadline,
    votingDeadline: b.votingDeadline,
    now: new Date().toISOString(),
  });
  if (next === b.status) return;
  if (next === "ready_to_settle" && b.betType === "gif_challenge") {
    applySettlement(b.id, { betType: "gif", winningSubmissionId: null });
    return;
  }
  if (next !== "ready_to_settle") {
    db.update(bets).set({ status: next as typeof b.status }).where(eq(bets.id, b.id)).run();
  }
}

export function deadlineSweep(): { transitioned: number; settled: number } {
  const all = db.select().from(bets).where(sql`status in ('open','voting','locked')`).all();
  const now = new Date().toISOString();
  let transitioned = 0;
  let settled = 0;
  for (const b of all) {
    const next = nextStatusAfterDeadlines({
      currentStatus: b.status,
      betType: b.betType,
      deadline: b.deadline,
      votingDeadline: b.votingDeadline,
      now,
    });
    if (next === b.status) continue;
    if (next === "ready_to_settle" && b.betType === "gif_challenge") {
      applySettlement(b.id, { betType: "gif", winningSubmissionId: null });
      settled++;
    } else if (next !== "ready_to_settle") {
      db.update(bets).set({ status: next as typeof b.status }).where(eq(bets.id, b.id)).run();
      transitioned++;
    }
  }
  return { transitioned, settled };
}

export function stipendSweep(): { credited: number } {
  const week = isoWeekOf(new Date());
  const allUsers = db.select().from(users).all();
  let credited = 0;
  for (const u of allUsers) {
    const already = db
      .select()
      .from(stipendLog)
      .where(sql`${stipendLog.userId} = ${u.id} AND ${stipendLog.isoWeek} = ${week}`)
      .get();
    if (already) continue;
    db.insert(stipendLog).values({ userId: u.id, isoWeek: week }).run();
    db.update(users).set({ balance: sql`${users.balance} + ${env.WEEKLY_STIPEND}` }).where(eq(users.id, u.id)).run();
    db.insert(transactions).values({
      userId: u.id,
      betId: null,
      amount: env.WEEKLY_STIPEND,
      kind: "stipend",
      note: `Weekly stipend ${week}`,
    }).run();
    credited++;
  }
  return { credited };
}
