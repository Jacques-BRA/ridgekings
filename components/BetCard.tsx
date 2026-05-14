import Link from "next/link";
import type { BetSummary } from "@/lib/queries";
import { LiveBadge, BoostBadge, VoidStamp, SettledBadge } from "./BetBadges";
import { CountdownTimer } from "./CountdownTimer";
import { formatPoints } from "@/lib/format";

const TYPE_LABELS: Record<string, string> = {
  yes_no: "YES / NO",
  multi_choice: "MULTI",
  over_under: "O/U",
  prop: "PROP",
  gif_challenge: "GIF",
};

export function BetCard({ summary }: { summary: BetSummary }) {
  const { bet, poolTotal, numBettors, yourStake } = summary;
  const isVoid = bet.status === "voided";
  return (
    <Link
      href={`/bets/${bet.id}`}
      className="relative block rounded-md border border-border bg-bg-surface p-4 transition hover:-translate-y-0.5 hover:bg-bg-elevated hover:shadow-lg hover:glow-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-dim">
            <span className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono">{TYPE_LABELS[bet.betType]}</span>
            <span className="font-mono">#{bet.id}</span>
          </div>
          <h3 className="mt-1 font-display text-display-lg leading-tight text-text">{bet.title}</h3>
          {bet.description && <p className="mt-1 text-sm text-text-muted line-clamp-2">{bet.description}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {bet.status === "open" && <LiveBadge />}
          {bet.isBoosted === 1 && <BoostBadge />}
          {bet.status === "settled" && <SettledBadge />}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-dim">{bet.status === "settled" ? "Final Pool" : "Pool"}</div>
          <div className="font-display text-display-md text-primary tabular">{formatPoints(poolTotal)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-dim">{bet.betType === "gif_challenge" ? "Entries" : "Bettors"}</div>
          <div className="font-display text-display-md text-text tabular">{numBettors}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-dim">
            {bet.status === "open" ? "Closes" : bet.status === "voting" ? "Voting Closes" : "Closed"}
          </div>
          <div className="font-display text-display-md text-text">
            {bet.status === "open" && <CountdownTimer deadline={bet.deadline} />}
            {bet.status === "voting" && bet.votingDeadline && <CountdownTimer deadline={bet.votingDeadline} />}
            {(bet.status === "locked" || bet.status === "settled" || bet.status === "voided") && "—"}
          </div>
        </div>
      </div>

      {yourStake !== null && (
        <div className="mt-3 rounded bg-bg-base/60 px-3 py-1.5 text-xs uppercase tracking-wide text-text-muted">
          Your stake: <span className="text-primary tabular">{formatPoints(yourStake)}</span> RKD
        </div>
      )}

      {isVoid && <VoidStamp />}
    </Link>
  );
}
