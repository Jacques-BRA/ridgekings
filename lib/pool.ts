export const CREATOR_FEE_BPS = 500;

export interface ParimutuelWager {
  id: number;
  userId: number;
  outcomeKey: string;
  stake: number;
}

export interface Payout {
  userId: number;
  wagerId: number;
  amount: number;
}

export type ParimutuelResult =
  | { kind: "paid"; payouts: Payout[]; creatorEarning: number; totalPool: number; winningPool: number }
  | { kind: "void"; reason: "no_winners" | "single_bettor" | "no_bettors"; refunds: { wagerId: number; userId: number; amount: number }[] };

export function computeParimutuelPayouts(input: {
  wagers: ParimutuelWager[];
  winningOutcomeKey: string;
}): ParimutuelResult {
  const { wagers, winningOutcomeKey } = input;
  if (wagers.length === 0) return { kind: "void", reason: "no_bettors", refunds: [] };
  if (wagers.length === 1) {
    return { kind: "void", reason: "single_bettor", refunds: wagers.map((w) => ({ wagerId: w.id, userId: w.userId, amount: w.stake })) };
  }
  const totalPool = wagers.reduce((sum, w) => sum + w.stake, 0);
  const winners = wagers.filter((w) => w.outcomeKey === winningOutcomeKey);
  const winningPool = winners.reduce((sum, w) => sum + w.stake, 0);
  if (winningPool === 0) {
    return { kind: "void", reason: "no_winners", refunds: wagers.map((w) => ({ wagerId: w.id, userId: w.userId, amount: w.stake })) };
  }
  const creatorFee = Math.floor((totalPool * CREATOR_FEE_BPS) / 10000);
  const distributable = totalPool - creatorFee;
  const payouts: Payout[] = winners.map((w) => ({
    userId: w.userId,
    wagerId: w.id,
    amount: Math.floor((w.stake * distributable) / winningPool),
  }));
  const paidOut = payouts.reduce((sum, p) => sum + p.amount, 0);
  const creatorEarning = totalPool - paidOut;
  return { kind: "paid", payouts, creatorEarning, totalPool, winningPool };
}

export interface GifSubmissionTally {
  id: number;
  userId: number;
  voteCount: number;
}

export type GifChallengeResult =
  | { kind: "paid"; winningSubmissionId: number; winnerUserId: number; payout: number; creatorEarning: number }
  | { kind: "void"; reason: "no_submissions" | "no_votes" | "tie"; refundUserIds: number[] };

export function computeGifChallengePayout(input: {
  submissions: GifSubmissionTally[];
  entryFee: number;
}): GifChallengeResult {
  const { submissions, entryFee } = input;
  if (submissions.length === 0) return { kind: "void", reason: "no_submissions", refundUserIds: [] };
  const totalVotes = submissions.reduce((s, x) => s + x.voteCount, 0);
  if (totalVotes === 0) {
    return { kind: "void", reason: "no_votes", refundUserIds: submissions.map((s) => s.userId) };
  }
  const max = Math.max(...submissions.map((s) => s.voteCount));
  const top = submissions.filter((s) => s.voteCount === max);
  if (top.length > 1) {
    return { kind: "void", reason: "tie", refundUserIds: submissions.map((s) => s.userId) };
  }
  const totalPool = submissions.length * entryFee;
  const creatorEarning = Math.floor((totalPool * CREATOR_FEE_BPS) / 10000);
  const payout = totalPool - creatorEarning;
  return { kind: "paid", winningSubmissionId: top[0].id, winnerUserId: top[0].userId, payout, creatorEarning };
}
