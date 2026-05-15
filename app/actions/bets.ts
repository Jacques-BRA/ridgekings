"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { bets, outcomes } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { logAction } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const BaseSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  deadline: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  settlementMode: z.enum(["creator", "vote"]).optional(),
});

const YesNoSchema = BaseSchema.extend({ betType: z.literal("yes_no") });
const MultiSchema = BaseSchema.extend({
  betType: z.literal("multi_choice"),
  outcomeLabels: z.array(z.string().trim().min(1).max(60)).min(2).max(8),
});
const OverUnderSchema = BaseSchema.extend({
  betType: z.literal("over_under"),
  line: z.coerce.number().finite(),
});
const PropSchema = BaseSchema.extend({ betType: z.literal("prop") });
const GifSchema = BaseSchema.extend({
  betType: z.literal("gif_challenge"),
  entryFee: z.coerce.number().int().positive(),
  votingDeadline: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
});

const CreateBetSchema = z.discriminatedUnion("betType", [
  YesNoSchema,
  MultiSchema,
  OverUnderSchema,
  PropSchema,
  GifSchema,
]);

function toIso(s: string): string {
  return new Date(s).toISOString();
}

export async function createBet(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Not signed in");
  checkRateLimit(`u:${me.id}`);

  const newBetId = await logAction("createBet", async () => {
  const raw: Record<string, unknown> = {
    betType: formData.get("betType"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    deadline: formData.get("deadline"),
    settlementMode: formData.get("settlementMode") || undefined,
  };
  if (raw.betType === "multi_choice") {
    raw.outcomeLabels = formData
      .getAll("outcomeLabels")
      .map(String)
      .filter((s) => s.trim().length > 0);
  }
  if (raw.betType === "over_under") raw.line = formData.get("line");
  if (raw.betType === "gif_challenge") {
    raw.entryFee = formData.get("entryFee");
    raw.votingDeadline = formData.get("votingDeadline");
  }
  const parsed = CreateBetSchema.parse(raw);

  if (parsed.betType !== "gif_challenge" && !parsed.settlementMode) {
    throw new Error("Settlement mode is required for non-GIF bets");
  }

  const deadlineIso = toIso(parsed.deadline);
  const votingDeadlineIso =
    parsed.betType === "gif_challenge" ? toIso(parsed.votingDeadline) : null;

  if (Date.parse(deadlineIso) <= Date.now()) throw new Error("Deadline must be in the future");
  if (votingDeadlineIso && Date.parse(votingDeadlineIso) <= Date.parse(deadlineIso)) {
    throw new Error("Voting deadline must be after submission deadline");
  }

  const description =
    parsed.betType === "over_under"
      ? `Line: ${parsed.line}${parsed.description ? "\n\n" + parsed.description : ""}`
      : parsed.description ?? null;

  const inserted = db
    .insert(bets)
    .values({
      creatorId: me.id,
      title: parsed.title,
      description,
      betType: parsed.betType,
      deadline: deadlineIso,
      votingDeadline: votingDeadlineIso,
      settlementMode: parsed.betType === "gif_challenge" ? null : parsed.settlementMode!,
      entryFee: parsed.betType === "gif_challenge" ? parsed.entryFee : null,
      status: "open",
      isBoosted: 0,
    })
    .returning({ id: bets.id })
    .get();

  if (parsed.betType === "yes_no") {
    db.insert(outcomes)
      .values([
        { betId: inserted.id, label: "Yes", sortOrder: 0 },
        { betId: inserted.id, label: "No", sortOrder: 1 },
      ])
      .run();
  } else if (parsed.betType === "multi_choice") {
    db.insert(outcomes)
      .values(
        parsed.outcomeLabels.map((l, i) => ({ betId: inserted.id, label: l, sortOrder: i })),
      )
      .run();
  } else if (parsed.betType === "over_under") {
    db.insert(outcomes)
      .values([
        { betId: inserted.id, label: `Over ${parsed.line}`, sortOrder: 0 },
        { betId: inserted.id, label: `Under ${parsed.line}`, sortOrder: 1 },
      ])
      .run();
  }

  return inserted.id;
  });
  revalidatePath("/");
  redirect(`/bets/${newBetId}`);
}
