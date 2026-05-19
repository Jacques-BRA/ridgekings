"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, sqlite } from "@/db";
import { bets, transactions, users, wagers, submissions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { applySettlement } from "@/lib/apply-settlement";
import { CREATOR_FEE_BPS } from "@/lib/pool";
import { logAction, logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyBetEnded } from "@/lib/teams";

function fireAndForget(p: Promise<unknown>, label: string): void {
  p.catch((err) => logger.error({ event: "fire_and_forget_failed", label, err: err instanceof Error ? err.message : String(err) }));
}

async function assertAdmin(): Promise<void> {
  const u = await getCurrentUser();
  if (!isAdmin(u)) throw new Error("Admin only");
}

async function assertAdminOrCreator(betId: number): Promise<void> {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not signed in");
  if (isAdmin(u)) return;
  const bet = db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!bet) throw new Error("Bet not found");
  if (bet.creatorId !== u.id) throw new Error("Creator or admin only");
}

const VoidSchema = z.object({ betId: z.coerce.number().int().positive() });

export async function adminVoidBet(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  checkRateLimit(`u:${me.id}`);
  const { betId } = VoidSchema.parse({ betId: formData.get("betId") });
  await assertAdminOrCreator(betId);
  return logAction("adminVoidBet", async () => {
  const tx = sqlite.transaction(() => {
    const bet = db.select().from(bets).where(eq(bets.id, betId)).get();
    if (!bet) throw new Error("Bet not found");
    if (bet.status === "voided") return;

    const winnings = db
      .select()
      .from(transactions)
      .where(sql`${transactions.betId} = ${betId} AND ${transactions.kind} = 'winnings'`)
      .all();
    for (const t of winnings) {
      db.update(users).set({ balance: sql`${users.balance} - ${t.amount}` }).where(eq(users.id, t.userId)).run();
      db.insert(transactions).values({
        userId: t.userId,
        betId,
        amount: -t.amount,
        kind: "admin_adjust",
        note: "reverse winnings (admin void)",
      }).run();
    }

    // Refund all stakes/fees regardless of pre-void status.
    // (The early-return at the top of this transaction handles already-voided bets.)
    if (bet.betType === "gif_challenge") {
      const subs = db.select().from(submissions).where(eq(submissions.betId, betId)).all();
      for (const s of subs) {
        const fee = bet.entryFee ?? 0;
        db.update(users).set({ balance: sql`${users.balance} + ${fee}` }).where(eq(users.id, s.userId)).run();
        db.insert(transactions).values({ userId: s.userId, betId, amount: fee, kind: "gif_refund", note: "admin void" }).run();
      }
    } else {
      const ws = db.select().from(wagers).where(eq(wagers.betId, betId)).all();
      for (const w of ws) {
        db.update(users).set({ balance: sql`${users.balance} + ${w.stake}` }).where(eq(users.id, w.userId)).run();
        db.insert(transactions).values({ userId: w.userId, betId, amount: w.stake, kind: "wager_refund", note: "admin void" }).run();
      }
    }
    db.update(bets).set({
      status: "voided",
      settledAt: new Date().toISOString(),
      winningOutcomeId: null,
      winningPropAnswer: null,
      winningSubmissionId: null,
    }).where(eq(bets.id, betId)).run();
  });
  tx();
  fireAndForget(notifyBetEnded(betId), `adminVoidBet bet ${betId}`);

  revalidatePath(`/bets/${betId}`);
  revalidatePath("/");
  });
}

const ForceSettleSchema = z.object({
  betId: z.coerce.number().int().positive(),
  outcomeId: z.coerce.number().int().positive().optional(),
  propAnswer: z.string().trim().min(1).max(120).optional(),
  submissionId: z.coerce.number().int().positive().optional(),
});

export async function adminForceSettle(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  checkRateLimit(`u:${me.id}`);
  await assertAdmin();
  return logAction("adminForceSettle", async () => {
  const parsed = ForceSettleSchema.parse({
    betId: formData.get("betId"),
    outcomeId: formData.get("outcomeId") ?? undefined,
    propAnswer: formData.get("propAnswer") ?? undefined,
    submissionId: formData.get("submissionId") ?? undefined,
  });
  const bet = db.select().from(bets).where(eq(bets.id, parsed.betId)).get();
  if (!bet) throw new Error("Bet not found");

  if (bet.status === "settled" || bet.status === "voided") {
    const fd = new FormData();
    fd.set("betId", String(bet.id));
    await adminVoidBet(fd);
    db.update(bets).set({ status: bet.betType === "gif_challenge" ? "voting" : "locked" }).where(eq(bets.id, bet.id)).run();
  }

  if (bet.betType === "gif_challenge") {
    if (!parsed.submissionId) {
      applySettlement(bet.id, { betType: "gif", winningSubmissionId: null });
    } else {
      const tx = sqlite.transaction(() => {
        const subs = db.select().from(submissions).where(eq(submissions.betId, bet.id)).all();
        const winner = subs.find((s) => s.id === parsed.submissionId);
        if (!winner) throw new Error("Submission not in bet");
        const fee = bet.entryFee ?? 0;
        const totalPool = subs.length * fee;
        const creatorEarning = Math.floor((totalPool * CREATOR_FEE_BPS) / 10000);
        const payout = totalPool - creatorEarning;
        db.update(users).set({ balance: sql`${users.balance} + ${payout}` }).where(eq(users.id, winner.userId)).run();
        db.insert(transactions).values({ userId: winner.userId, betId: bet.id, amount: payout, kind: "winnings", note: "admin force-settle" }).run();
        if (creatorEarning > 0) {
          db.update(users).set({ balance: sql`${users.balance} + ${creatorEarning}` }).where(eq(users.id, bet.creatorId)).run();
          db.insert(transactions).values({ userId: bet.creatorId, betId: bet.id, amount: creatorEarning, kind: "winnings", note: "creator share (5%)" }).run();
        }
        db.update(bets).set({ status: "settled", settledAt: new Date().toISOString(), winningSubmissionId: winner.id }).where(eq(bets.id, bet.id)).run();
      });
      tx();
      fireAndForget(notifyBetEnded(bet.id), `adminForceSettle gif bet ${bet.id}`);
    }
  } else if (bet.betType === "prop") {
    applySettlement(bet.id, { betType: "prop", winningPropAnswer: parsed.propAnswer ?? null });
  } else {
    applySettlement(bet.id, { betType: "structured", winningOutcomeId: parsed.outcomeId ?? null });
  }

  revalidatePath(`/bets/${bet.id}`);
  revalidatePath("/");
  });
}

const ToggleBoostSchema = z.object({ betId: z.coerce.number().int().positive() });

export async function toggleBoost(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  checkRateLimit(`u:${me.id}`);
  const { betId } = ToggleBoostSchema.parse({ betId: formData.get("betId") });
  await assertAdminOrCreator(betId);
  return logAction("toggleBoost", async () => {
  const b = db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!b) throw new Error("Bet not found");
  db.update(bets).set({ isBoosted: b.isBoosted === 1 ? 0 : 1 }).where(eq(bets.id, betId)).run();
  revalidatePath(`/bets/${betId}`);
  revalidatePath("/");
  });
}
