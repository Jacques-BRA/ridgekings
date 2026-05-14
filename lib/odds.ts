export function americanOdds(input: { stakeOnOutcome: number; totalPool: number }): string {
  const { stakeOnOutcome, totalPool } = input;
  if (totalPool === 0) return "EVEN";
  if (stakeOnOutcome === 0) return "+∞";
  const p = stakeOnOutcome / totalPool;
  if (p > 0.5) {
    const x = Math.round((p / (1 - p)) * 100);
    return `-${x}`;
  }
  const x = Math.round(((1 - p) / p) * 100);
  return `+${x}`;
}

export function impliedPayoutPer100(input: { stakeOnOutcome: number; totalPool: number }): number {
  const { stakeOnOutcome, totalPool } = input;
  if (stakeOnOutcome === 0) return 0;
  return Math.floor((100 * totalPool) / stakeOnOutcome);
}
