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
  | { kind: "paid"; payouts: Payout[]; creatorTip: number; totalPool: number; winningPool: number }
  | { kind: "void"; reason: "no_winners" | "single_bettor" | "no_bettors"; refunds: { wagerId: number; userId: number; amount: number }[] };

export function computeParimutuelPayouts(input: {
  wagers: ParimutuelWager[];
  winningOutcomeKey: string;
  creatorUserId: number;
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
  const payouts: Payout[] = winners.map((w) => ({
    userId: w.userId,
    wagerId: w.id,
    amount: Math.floor((w.stake * totalPool) / winningPool),
  }));
  const paidOut = payouts.reduce((sum, p) => sum + p.amount, 0);
  const creatorTip = totalPool - paidOut;
  return { kind: "paid", payouts, creatorTip, totalPool, winningPool };
}
