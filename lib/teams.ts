import { db } from "@/db";
import { bets, outcomes, submissions, transactions, users } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { env } from "./env";
import { logger } from "./logger";

const SCHEMA_URL = "http://adaptivecards.io/schemas/adaptive-card.json";
const CARD_VERSION = "1.4";

interface AdaptiveBlock {
  type: string;
  [key: string]: unknown;
}

interface CardPayload {
  body: AdaptiveBlock[];
  actions?: AdaptiveBlock[];
}

function isEnabled(): boolean {
  return env.TEAMS_NOTIFICATIONS_ENABLED === "1" && !!env.TEAMS_WEBHOOK_URL;
}

function deepLink(path: string): string | null {
  if (!env.APP_PUBLIC_URL) return null;
  const base = env.APP_PUBLIC_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function postCard(card: CardPayload, eventName: string): Promise<void> {
  if (!isEnabled()) return;
  const payload = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: SCHEMA_URL,
          type: "AdaptiveCard",
          version: CARD_VERSION,
          body: card.body,
          actions: card.actions ?? [],
        },
      },
    ],
  };
  try {
    const res = await fetch(env.TEAMS_WEBHOOK_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "<unreadable>");
      logger.warn({ event: "teams_notify_failed", notify: eventName, status: res.status, body: text });
      return;
    }
    logger.info({ event: "teams_notify_sent", notify: eventName });
  } catch (err) {
    logger.error({
      event: "teams_notify_error",
      notify: eventName,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface BetCreatedPayload {
  betId: number;
  title: string;
  creatorName: string;
  deadlineIso: string;
  betType: string;
  entryFee?: number | null;
}

export async function notifyBetCreated(p: BetCreatedPayload): Promise<void> {
  const url = deepLink(`/bets/${p.betId}`);
  const facts: Array<{ title: string; value: string }> = [
    { title: "Creator", value: p.creatorName },
    { title: "Type", value: p.betType.toUpperCase().replace(/_/g, " ") },
    { title: "Closes", value: new Date(p.deadlineIso).toLocaleString() },
  ];
  if (typeof p.entryFee === "number" && p.entryFee > 0) {
    facts.push({ title: "Entry fee", value: `${p.entryFee.toLocaleString()} RKD` });
  }
  await postCard(
    {
      body: [
        { type: "TextBlock", text: "📣 NEW BET POSTED", size: "Small", weight: "Bolder", color: "Accent", spacing: "None" },
        { type: "TextBlock", text: p.title, size: "Large", weight: "Bolder", wrap: true, spacing: "Small" },
        { type: "FactSet", facts },
      ],
      actions: url ? [{ type: "Action.OpenUrl", title: "Place wager →", url }] : [],
    },
    "bet_created",
  );
}

export interface BetSettledPayload {
  betId: number;
  title: string;
  outcomeLabel: string | null;
  isVoid: boolean;
  topWinners: { name: string; amount: number }[];
}

/** Look up the current state of a bet and fire the right card. Safe to call from any
 *  settlement / void code path after the underlying transaction commits. */
export async function notifyBetEnded(betId: number): Promise<void> {
  if (!isEnabled()) return;
  const bet = db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!bet) return;
  if (bet.status !== "settled" && bet.status !== "voided") return;

  if (bet.status === "voided") {
    await notifyBetSettled({ betId, title: bet.title, outcomeLabel: null, isVoid: true, topWinners: [] });
    return;
  }

  let outcomeLabel: string | null = null;
  if (bet.winningOutcomeId !== null) {
    const oc = db.select().from(outcomes).where(eq(outcomes.id, bet.winningOutcomeId)).get();
    outcomeLabel = oc?.label ?? null;
  } else if (bet.winningPropAnswer) {
    outcomeLabel = bet.winningPropAnswer;
  } else if (bet.winningSubmissionId !== null) {
    const sub = db.select().from(submissions).where(eq(submissions.id, bet.winningSubmissionId)).get();
    if (sub) {
      const u = db.select({ name: users.name }).from(users).where(eq(users.id, sub.userId)).get();
      outcomeLabel = u ? `Winning GIF by ${u.name}` : "Winning GIF";
    }
  }

  const winningTxs = db
    .select({ userId: transactions.userId, amount: transactions.amount })
    .from(transactions)
    .where(and(eq(transactions.betId, bet.id), eq(transactions.kind, "winnings"), sql`${transactions.amount} > 0`))
    .all();
  const totals = new Map<number, number>();
  for (const t of winningTxs) totals.set(t.userId, (totals.get(t.userId) ?? 0) + t.amount);
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);

  const userIds = sorted.map(([uid]) => uid);
  const userRows = userIds.length > 0
    ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)).all()
    : [];
  const nameById = new Map(userRows.map((u) => [u.id, u.name]));
  const topWinners = sorted.map(([uid, amount]) => ({ name: nameById.get(uid) ?? "?", amount }));

  await notifyBetSettled({ betId, title: bet.title, outcomeLabel, isVoid: false, topWinners });
}

export async function notifyBetSettled(p: BetSettledPayload): Promise<void> {
  const url = deepLink(`/bets/${p.betId}`);
  if (p.isVoid) {
    await postCard(
      {
        body: [
          { type: "TextBlock", text: "↩️ BET VOIDED", size: "Small", weight: "Bolder", color: "Attention", spacing: "None" },
          { type: "TextBlock", text: p.title, size: "Large", weight: "Bolder", wrap: true, spacing: "Small" },
          { type: "TextBlock", text: "All stakes refunded.", wrap: true, spacing: "Small" },
        ],
        actions: url ? [{ type: "Action.OpenUrl", title: "View bet", url }] : [],
      },
      "bet_voided",
    );
    return;
  }
  const winners = p.topWinners.slice(0, 5);
  const winnersText = winners.length > 0
    ? winners.map((w) => `**${w.name}** — ${w.amount.toLocaleString()} RKD`).join("  ·  ")
    : "_No winners — pool refunded._";
  await postCard(
    {
      body: [
        { type: "TextBlock", text: "🏆 BET SETTLED", size: "Small", weight: "Bolder", color: "Good", spacing: "None" },
        { type: "TextBlock", text: p.title, size: "Large", weight: "Bolder", wrap: true, spacing: "Small" },
        ...(p.outcomeLabel
          ? [{ type: "FactSet", facts: [{ title: "Winning outcome", value: p.outcomeLabel }] }]
          : []),
        { type: "TextBlock", text: winnersText, wrap: true, spacing: "Small" },
      ],
      actions: url ? [{ type: "Action.OpenUrl", title: "View bet", url }] : [],
    },
    "bet_settled",
  );
}
