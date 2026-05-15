"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { bets, settlementVotes, wagers, gifVotes, submissions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { applySettlement } from "@/lib/apply-settlement";
import { tallyVoteSettlement } from "@/lib/settlement";
import { logAction } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const SettleByCreatorSchema = z.object({
  betId: z.coerce.number().int().positive(),
  outcomeId: z.coerce.number().int().positive().optional(),
  propAnswer: z.string().trim().min(1).max(120).optional(),
  voidBet: z.coerce.boolean().optional(),
});

export async function settleByCreator(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  checkRateLimit(`u:${me.id}`);
  return logAction("settleByCreator", async () => {
  const parsed = SettleByCreatorSchema.parse({
    betId: formData.get("betId"),
    outcomeId: formData.get("outcomeId") ?? undefined,
    propAnswer: formData.get("propAnswer") ?? undefined,
    voidBet: formData.get("voidBet") ?? undefined,
  });
  const bet = db.select().from(bets).where(eq(bets.id, parsed.betId)).get();
  if (!bet) throw new Error("Bet not found");
  if (bet.creatorId !== me.id && !isAdmin(me)) throw new Error("Only the creator can settle this bet");
  if (bet.settlementMode !== "creator" && !isAdmin(me)) throw new Error("This bet settles by vote");
  if (bet.status !== "locked") throw new Error(`Bet is ${bet.status}, cannot settle`);

  if (bet.betType === "prop") {
    applySettlement(bet.id, { betType: "prop", winningPropAnswer: parsed.voidBet ? null : parsed.propAnswer ?? null });
  } else {
    applySettlement(bet.id, { betType: "structured", winningOutcomeId: parsed.voidBet ? null : parsed.outcomeId ?? null });
  }
  revalidatePath(`/bets/${bet.id}`);
  revalidatePath("/");
  });
}

const CastGifVoteSchema = z.object({
  betId: z.coerce.number().int().positive(),
  submissionId: z.coerce.number().int().positive(),
});

export async function castGifVote(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  checkRateLimit(`u:${me.id}`);
  return logAction("castGifVote", async () => {
  const parsed = CastGifVoteSchema.parse({
    betId: formData.get("betId"),
    submissionId: formData.get("submissionId"),
  });
  const bet = db.select().from(bets).where(eq(bets.id, parsed.betId)).get();
  if (!bet) throw new Error("Bet not found");
  if (bet.betType !== "gif_challenge") throw new Error("Not a GIF challenge");
  if (bet.status !== "voting") throw new Error("Voting window not open");

  const sub = db.select().from(submissions).where(and(eq(submissions.id, parsed.submissionId), eq(submissions.betId, bet.id))).get();
  if (!sub) throw new Error("Submission not found");
  if (sub.userId === me.id) throw new Error("You cannot vote for your own GIF");

  db.insert(gifVotes).values({ betId: bet.id, voterUserId: me.id, submissionId: sub.id }).run();
  revalidatePath(`/bets/${bet.id}`);
  });
}

const CastVoteSchema = z.object({
  betId: z.coerce.number().int().positive(),
  outcomeId: z.coerce.number().int().positive().optional(),
  propAnswer: z.string().trim().min(1).max(120).optional(),
  isVoid: z.coerce.boolean().optional(),
});

export async function castSettlementVote(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  checkRateLimit(`u:${me.id}`);
  return logAction("castSettlementVote", async () => {
  const parsed = CastVoteSchema.parse({
    betId: formData.get("betId"),
    outcomeId: formData.get("outcomeId") ?? undefined,
    propAnswer: formData.get("propAnswer") ?? undefined,
    isVoid: formData.get("isVoid") ?? undefined,
  });
  const bet = db.select().from(bets).where(eq(bets.id, parsed.betId)).get();
  if (!bet) throw new Error("Bet not found");
  if (bet.settlementMode !== "vote") throw new Error("This bet does not settle by vote");
  if (bet.status !== "locked") throw new Error(`Bet is ${bet.status}, cannot vote`);

  const myWager = db.select().from(wagers).where(and(eq(wagers.betId, bet.id), eq(wagers.userId, me.id))).get();
  if (!myWager) throw new Error("Only bettors can vote on this bet");

  db.insert(settlementVotes).values({
    betId: bet.id,
    voterUserId: me.id,
    outcomeId: parsed.isVoid || bet.betType === "prop" ? null : parsed.outcomeId ?? null,
    propAnswer: bet.betType === "prop" && !parsed.isVoid ? parsed.propAnswer ?? null : null,
    isVoidVote: parsed.isVoid ? 1 : 0,
  }).run();

  const totalBettors = db.select().from(wagers).where(eq(wagers.betId, bet.id)).all().length;
  const votes = db.select().from(settlementVotes).where(eq(settlementVotes.betId, bet.id)).all();
  const tallyVotes = votes.map((v) => ({
    outcomeKey:
      v.isVoidVote === 1
        ? null
        : bet.betType === "prop"
        ? `prop:${(v.propAnswer ?? "").trim().toLowerCase()}`
        : `oc:${v.outcomeId}`,
  }));
  const result = tallyVoteSettlement({ totalBettors, votes: tallyVotes });

  if (result.status === "decided") {
    const wk = result.winningKey;
    if (wk === null) {
      applySettlement(bet.id, bet.betType === "prop"
        ? { betType: "prop", winningPropAnswer: null }
        : { betType: "structured", winningOutcomeId: null });
    } else if (wk.startsWith("prop:")) {
      const original = votes.find((v) => `prop:${(v.propAnswer ?? "").trim().toLowerCase()}` === wk)?.propAnswer ?? null;
      applySettlement(bet.id, { betType: "prop", winningPropAnswer: original });
    } else if (wk.startsWith("oc:")) {
      const ocId = Number(wk.slice(3));
      applySettlement(bet.id, { betType: "structured", winningOutcomeId: ocId });
    }
  } else if (result.status === "void_tie") {
    applySettlement(bet.id, bet.betType === "prop"
      ? { betType: "prop", winningPropAnswer: null }
      : { betType: "structured", winningOutcomeId: null });
  }

  revalidatePath(`/bets/${bet.id}`);
  revalidatePath("/");
  });
}
