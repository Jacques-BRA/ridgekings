"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, sqlite } from "@/db";
import { bets, transactions, users, wagers, submissions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { applySettlement } from "@/lib/apply-settlement";

async function assertAdmin(): Promise<void> {
  const u = await getCurrentUser();
  if (!isAdmin(u)) throw new Error("Admin only");
}

const VoidSchema = z.object({ betId: z.coerce.number().int().positive() });

export async function adminVoidBet(formData: FormData): Promise<void> {
  await assertAdmin();
  const { betId } = VoidSchema.parse({ betId: formData.get("betId") });

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

    if (bet.status === "settled") {
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

  revalidatePath(`/bets/${betId}`);
  revalidatePath("/");
}

const ForceSettleSchema = z.object({
  betId: z.coerce.number().int().positive(),
  outcomeId: z.coerce.number().int().positive().optional(),
  propAnswer: z.string().trim().min(1).max(120).optional(),
  submissionId: z.coerce.number().int().positive().optional(),
});

export async function adminForceSettle(formData: FormData): Promise<void> {
  await assertAdmin();
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
      const subs = db.select().from(submissions).where(eq(submissions.betId, bet.id)).all();
      const winner = subs.find((s) => s.id === parsed.submissionId);
      if (!winner) throw new Error("Submission not in bet");
      const fee = bet.entryFee ?? 0;
      const payout = subs.length * fee;
      db.update(users).set({ balance: sql`${users.balance} + ${payout}` }).where(eq(users.id, winner.userId)).run();
      db.insert(transactions).values({ userId: winner.userId, betId: bet.id, amount: payout, kind: "winnings", note: "admin force-settle" }).run();
      db.update(bets).set({ status: "settled", settledAt: new Date().toISOString(), winningSubmissionId: winner.id }).where(eq(bets.id, bet.id)).run();
    }
  } else if (bet.betType === "prop") {
    applySettlement(bet.id, { betType: "prop", winningPropAnswer: parsed.propAnswer ?? null });
  } else {
    applySettlement(bet.id, { betType: "structured", winningOutcomeId: parsed.outcomeId ?? null });
  }

  revalidatePath(`/bets/${bet.id}`);
  revalidatePath("/");
}

const ToggleBoostSchema = z.object({ betId: z.coerce.number().int().positive() });

export async function toggleBoost(formData: FormData): Promise<void> {
  await assertAdmin();
  const { betId } = ToggleBoostSchema.parse({ betId: formData.get("betId") });
  const b = db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!b) throw new Error("Bet not found");
  db.update(bets).set({ isBoosted: b.isBoosted === 1 ? 0 : 1 }).where(eq(bets.id, betId)).run();
  revalidatePath(`/bets/${betId}`);
  revalidatePath("/");
}
