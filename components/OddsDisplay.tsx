import { americanOdds, impliedPayoutPer100 } from "@/lib/odds";

export function OddsDisplay({ stakeOnOutcome, totalPool }: { stakeOnOutcome: number; totalPool: number }) {
  const odds = americanOdds({ stakeOnOutcome, totalPool });
  const payout = impliedPayoutPer100({ stakeOnOutcome, totalPool });
  const isFav = odds.startsWith("-");
  return (
    <div className="flex items-baseline gap-2">
      <span className={`font-display text-display-lg tabular ${isFav ? "text-text" : "text-primary"}`}>{odds}</span>
      {payout > 0 && (
        <span className="text-xs uppercase tracking-wide text-text-dim">
          $100 → <span className="text-primary tabular">{payout}</span>
        </span>
      )}
    </div>
  );
}
