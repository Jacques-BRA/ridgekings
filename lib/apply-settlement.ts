import { db, sqlite } from "@/db";
import { bets, wagers, users, transactions, submissions, gifVotes, type Bet } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { computeParimutuelPayouts, computeGifChallengePayout } from "./pool";

export type ApplySettlementOutcome =
  | { betType: "structured"; winningOutcomeId: number | null }
  | { betType: "prop"; winningPropAnswer: string | null }
  | { betType: "gif"; winningSubmissionId: number | null };

export function applySettlement(betId: number, outcome: ApplySettlementOutcome): void {
  const tx = sqlite.transaction(() => {
    const bet = db.select().from(bets).where(eq(bets.id, betId)).get();
    if (!bet) throw new Error("Bet not found");
    if (bet.status === "settled") throw new Error("Already settled");
    if (bet.status === "voided") throw new Error("Already voided");

    if (bet.betType === "gif_challenge") {
      if (outcome.betType !== "gif") throw new Error("Expected gif outcome");
      applyGifSettlement(bet);
      return;
    }

    const ws = db.select().from(wagers).where(eq(wagers.betId, betId)).all();
    let winningKey: string | null;
    if (outcome.betType === "structured") {
      if (outcome.winningOutcomeId === null) {
        voidStructured(bet, ws);
        return;
      }
      winningKey = `oc:${outcome.winningOutcomeId}`;
    } else if (outcome.betType === "prop") {
      if (outcome.winningPropAnswer === null) {
        voidStructured(bet, ws);
        return;
      }
      winningKey = `prop:${outcome.winningPropAnswer.trim().toLowerCase()}`;
    } else {
      throw new Error("Expected structured or prop outcome for non-gif bet");
    }
    const result = computeParimutuelPayouts({
      wagers: ws.map((w) => ({
        id: w.id,
        userId: w.userId,
        stake: w.stake,
        outcomeKey:
          outcome.betType === "structured"
            ? `oc:${w.outcomeId}`
            : `prop:${(w.propAnswer ?? "").trim().toLowerCase()}`,
      })),
      winningOutcomeKey: winningKey,
    });

    if (result.kind === "void") {
      for (const r of result.refunds) {
        db.update(users).set({ balance: sql`${users.balance} + ${r.amount}` }).where(eq(users.id, r.userId)).run();
        db.insert(transactions).values({ userId: r.userId, betId: bet.id, amount: r.amount, kind: "wager_refund", note: `void: ${result.reason}` }).run();
      }
      db.update(bets).set({ status: "voided", settledAt: new Date().toISOString() }).where(eq(bets.id, bet.id)).run();
      return;
    }

    for (const p of result.payouts) {
      db.update(users).set({ balance: sql`${users.balance} + ${p.amount}` }).where(eq(users.id, p.userId)).run();
      db.insert(transactions).values({ userId: p.userId, betId: bet.id, amount: p.amount, kind: "winnings", note: null }).run();
    }
    if (result.creatorEarning > 0) {
      db.update(users).set({ balance: sql`${users.balance} + ${result.creatorEarning}` }).where(eq(users.id, bet.creatorId)).run();
      db.insert(transactions).values({ userId: bet.creatorId, betId: bet.id, amount: result.creatorEarning, kind: "winnings", note: "creator share (5% + rounding)" }).run();
    }
    db.update(bets)
      .set({
        status: "settled",
        settledAt: new Date().toISOString(),
        winningOutcomeId: outcome.betType === "structured" ? outcome.winningOutcomeId : null,
        winningPropAnswer: outcome.betType === "prop" ? outcome.winningPropAnswer : null,
      })
      .where(eq(bets.id, bet.id))
      .run();
  });
  tx();
}

function voidStructured(bet: Bet, ws: { id: number; userId: number; stake: number }[]): void {
  for (const w of ws) {
    db.update(users).set({ balance: sql`${users.balance} + ${w.stake}` }).where(eq(users.id, w.userId)).run();
    db.insert(transactions).values({ userId: w.userId, betId: bet.id, amount: w.stake, kind: "wager_refund", note: "creator voided" }).run();
  }
  db.update(bets).set({ status: "voided", settledAt: new Date().toISOString() }).where(eq(bets.id, bet.id)).run();
}

function applyGifSettlement(bet: Bet): void {
  const subs = db.select().from(submissions).where(eq(submissions.betId, bet.id)).all();
  const votes = db.select().from(gifVotes).where(eq(gifVotes.betId, bet.id)).all();
  const voteCounts = new Map<number, number>();
  for (const v of votes) voteCounts.set(v.submissionId, (voteCounts.get(v.submissionId) ?? 0) + 1);
  const r = computeGifChallengePayout({
    submissions: subs.map((s) => ({ id: s.id, userId: s.userId, voteCount: voteCounts.get(s.id) ?? 0 })),
    entryFee: bet.entryFee ?? 0,
  });
  if (r.kind === "void") {
    for (const uid of r.refundUserIds) {
      const fee = bet.entryFee ?? 0;
      db.update(users).set({ balance: sql`${users.balance} + ${fee}` }).where(eq(users.id, uid)).run();
      db.insert(transactions).values({ userId: uid, betId: bet.id, amount: fee, kind: "gif_refund", note: `void: ${r.reason}` }).run();
    }
    db.update(bets).set({ status: "voided", settledAt: new Date().toISOString() }).where(eq(bets.id, bet.id)).run();
    return;
  }
  db.update(users).set({ balance: sql`${users.balance} + ${r.payout}` }).where(eq(users.id, r.winnerUserId)).run();
  db.insert(transactions).values({ userId: r.winnerUserId, betId: bet.id, amount: r.payout, kind: "winnings", note: "GIF challenge win" }).run();
  if (r.creatorEarning > 0) {
    db.update(users).set({ balance: sql`${users.balance} + ${r.creatorEarning}` }).where(eq(users.id, bet.creatorId)).run();
    db.insert(transactions).values({ userId: bet.creatorId, betId: bet.id, amount: r.creatorEarning, kind: "winnings", note: "creator share (5%)" }).run();
  }
  db.update(bets).set({ status: "settled", settledAt: new Date().toISOString(), winningSubmissionId: r.winningSubmissionId }).where(eq(bets.id, bet.id)).run();
}
