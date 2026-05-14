"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, sqlite } from "@/db";
import { bets, wagers, outcomes, users, transactions, submissions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { isValidGifUrl } from "@/lib/gif-url";

const PlaceWagerSchema = z.object({
  betId: z.coerce.number().int().positive(),
  outcomeId: z.coerce.number().int().positive().optional(),
  propAnswer: z.string().trim().min(1).max(120).optional(),
  stake: z.coerce.number().int().positive(),
});

export async function placeWager(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  const parsed = PlaceWagerSchema.parse({
    betId: formData.get("betId"),
    outcomeId: formData.get("outcomeId") ?? undefined,
    propAnswer: formData.get("propAnswer") ?? undefined,
    stake: formData.get("stake"),
  });

  const tx = sqlite.transaction(() => {
    const bet = db.select().from(bets).where(eq(bets.id, parsed.betId)).get();
    if (!bet) throw new Error("Bet not found");
    if (bet.status !== "open") throw new Error("Bet is not open for wagers");
    if (Date.parse(bet.deadline) <= Date.now()) throw new Error("Bet deadline has passed");
    if (bet.betType === "gif_challenge") throw new Error("Use submitGif for GIF challenges");

    const existing = db.select().from(wagers).where(and(eq(wagers.betId, parsed.betId), eq(wagers.userId, me.id))).get();
    if (existing) throw new Error("You already placed a wager on this bet");

    if (bet.betType === "prop") {
      if (!parsed.propAnswer) throw new Error("Prop answer required");
    } else {
      if (!parsed.outcomeId) throw new Error("Outcome required");
      const oc = db.select().from(outcomes).where(and(eq(outcomes.id, parsed.outcomeId), eq(outcomes.betId, parsed.betId))).get();
      if (!oc) throw new Error("Outcome does not belong to this bet");
    }

    const fresh = db.select().from(users).where(eq(users.id, me.id)).get()!;
    if (fresh.balance < parsed.stake) throw new Error("Insufficient balance");

    db.update(users).set({ balance: fresh.balance - parsed.stake }).where(eq(users.id, me.id)).run();
    db.insert(transactions).values({
      userId: me.id,
      betId: bet.id,
      amount: -parsed.stake,
      kind: "wager_lock",
      note: null,
    }).run();
    db.insert(wagers).values({
      betId: bet.id,
      userId: me.id,
      outcomeId: bet.betType === "prop" ? null : parsed.outcomeId!,
      propAnswer: bet.betType === "prop" ? parsed.propAnswer! : null,
      stake: parsed.stake,
    }).run();
  });
  tx();

  revalidatePath(`/bets/${parsed.betId}`);
  revalidatePath("/");
}

const SubmitGifSchema = z.object({
  betId: z.coerce.number().int().positive(),
  gifUrl: z.string().url(),
  caption: z.string().trim().max(120).optional().or(z.literal("")).transform((v) => (v ? v : null)),
});

export async function submitGif(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  const parsed = SubmitGifSchema.parse({
    betId: formData.get("betId"),
    gifUrl: formData.get("gifUrl"),
    caption: formData.get("caption") ?? "",
  });
  if (!isValidGifUrl(parsed.gifUrl)) throw new Error("URL must be a .gif or a Giphy/Tenor link (https)");

  const tx = sqlite.transaction(() => {
    const bet = db.select().from(bets).where(eq(bets.id, parsed.betId)).get();
    if (!bet) throw new Error("Bet not found");
    if (bet.betType !== "gif_challenge") throw new Error("Not a GIF challenge");
    if (bet.status !== "open") throw new Error("Submission window is closed");
    if (Date.parse(bet.deadline) <= Date.now()) throw new Error("Submission deadline passed");
    const existing = db.select().from(submissions).where(and(eq(submissions.betId, bet.id), eq(submissions.userId, me.id))).get();
    if (existing) throw new Error("You already submitted to this challenge");

    const fee = bet.entryFee ?? 0;
    const fresh = db.select().from(users).where(eq(users.id, me.id)).get()!;
    if (fresh.balance < fee) throw new Error("Insufficient balance for entry fee");

    db.update(users).set({ balance: fresh.balance - fee }).where(eq(users.id, me.id)).run();
    db.insert(transactions).values({ userId: me.id, betId: bet.id, amount: -fee, kind: "gif_entry", note: null }).run();
    db.insert(submissions).values({
      betId: bet.id,
      userId: me.id,
      gifUrl: parsed.gifUrl,
      caption: parsed.caption,
    }).run();
  });
  tx();

  revalidatePath(`/bets/${parsed.betId}`);
  revalidatePath("/");
}
