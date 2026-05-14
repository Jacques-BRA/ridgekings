import { sqliteTable, integer, text, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  balance: integer("balance").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const bets = sqliteTable(
  "bets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    creatorId: integer("creator_id").notNull().references(() => users.id),
    title: text("title").notNull(),
    description: text("description"),
    betType: text("bet_type", { enum: ["yes_no", "multi_choice", "over_under", "prop", "gif_challenge"] }).notNull(),
    deadline: text("deadline").notNull(),
    votingDeadline: text("voting_deadline"),
    settlementMode: text("settlement_mode", { enum: ["creator", "vote"] }),
    entryFee: integer("entry_fee"),
    status: text("status", { enum: ["open", "locked", "voting", "settled", "voided"] }).notNull().default("open"),
    winningOutcomeId: integer("winning_outcome_id").references((): any => outcomes.id),
    winningPropAnswer: text("winning_prop_answer"),
    winningSubmissionId: integer("winning_submission_id").references((): any => submissions.id),
    isBoosted: integer("is_boosted").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    settledAt: text("settled_at"),
  },
  (t) => ({
    statusIdx: index("bets_status_idx").on(t.status),
    deadlineIdx: index("bets_deadline_idx").on(t.deadline),
  }),
);

export const outcomes = sqliteTable("outcomes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  betId: integer("bet_id").notNull().references(() => bets.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const wagers = sqliteTable(
  "wagers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    betId: integer("bet_id").notNull().references(() => bets.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id),
    outcomeId: integer("outcome_id").references(() => outcomes.id),
    propAnswer: text("prop_answer"),
    stake: integer("stake").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => ({
    oneWagerPerUserPerBet: uniqueIndex("wagers_bet_user_idx").on(t.betId, t.userId),
  }),
);

export const submissions = sqliteTable(
  "submissions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    betId: integer("bet_id").notNull().references(() => bets.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id),
    gifUrl: text("gif_url").notNull(),
    caption: text("caption"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => ({
    oneSubmissionPerUserPerBet: uniqueIndex("submissions_bet_user_idx").on(t.betId, t.userId),
  }),
);

export const settlementVotes = sqliteTable(
  "settlement_votes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    betId: integer("bet_id").notNull().references(() => bets.id, { onDelete: "cascade" }),
    voterUserId: integer("voter_user_id").notNull().references(() => users.id),
    outcomeId: integer("outcome_id").references(() => outcomes.id),
    propAnswer: text("prop_answer"),
    isVoidVote: integer("is_void_vote").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => ({
    oneVotePerUserPerBet: uniqueIndex("settlement_votes_bet_user_idx").on(t.betId, t.voterUserId),
  }),
);

export const gifVotes = sqliteTable(
  "gif_votes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    betId: integer("bet_id").notNull().references(() => bets.id, { onDelete: "cascade" }),
    voterUserId: integer("voter_user_id").notNull().references(() => users.id),
    submissionId: integer("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => ({
    oneGifVotePerUserPerBet: uniqueIndex("gif_votes_bet_user_idx").on(t.betId, t.voterUserId),
  }),
);

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  betId: integer("bet_id").references(() => bets.id, { onDelete: "set null" }),
  amount: integer("amount").notNull(),
  kind: text("kind", {
    enum: ["seed", "stipend", "wager_lock", "wager_refund", "winnings", "gif_entry", "gif_refund", "admin_adjust"],
  }).notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const stipendLog = sqliteTable(
  "stipend_log",
  {
    userId: integer("user_id").notNull().references(() => users.id),
    isoWeek: text("iso_week").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.isoWeek] }) }),
);

export type User = typeof users.$inferSelect;
export type Bet = typeof bets.$inferSelect;
export type Outcome = typeof outcomes.$inferSelect;
export type Wager = typeof wagers.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type SettlementVote = typeof settlementVotes.$inferSelect;
export type GifVote = typeof gifVotes.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
