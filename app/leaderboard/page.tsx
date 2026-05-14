import { buildLeaderboard } from "@/lib/queries";
import { formatPoints } from "@/lib/format";

export default async function LeaderboardPage() {
  const rows = buildLeaderboard();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-2 font-display text-display-xl text-text">The Leaderboard</h1>
      <p className="mb-8 text-text-muted">Who&apos;s riding hot. Who&apos;s on a freezing cold streak.</p>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-elevated text-left font-display uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2 text-right">Winnings</th>
              <th className="px-3 py-2 text-right">Wagered</th>
              <th className="px-3 py-2 text-right">Win Rate</th>
              <th className="px-3 py-2 text-right">Biggest Win</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const rank = i + 1;
              const winRate = r.betsPlaced > 0 ? Math.round((r.betsWon / r.betsPlaced) * 100) : 0;
              const crown = rank === 1 ? "♚" : rank === 2 ? "♛" : rank === 3 ? "♜" : "";
              return (
                <tr key={r.user.id} className={i % 2 === 0 ? "bg-bg-surface" : "bg-bg-base"}>
                  <td className="px-3 py-2 font-display text-lg text-gold">
                    {crown} {rank}
                  </td>
                  <td className="px-3 py-2 font-display uppercase">{r.user.name}</td>
                  <td className="px-3 py-2 text-right text-primary tabular">{formatPoints(r.user.balance)}</td>
                  <td className="px-3 py-2 text-right tabular">{formatPoints(r.totalWinnings)}</td>
                  <td className="px-3 py-2 text-right tabular">{formatPoints(r.totalWagered)}</td>
                  <td className="px-3 py-2 text-right tabular">{winRate}%</td>
                  <td className="px-3 py-2 text-right tabular">{formatPoints(r.biggestSingleWin)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-text-muted">NO PLAYERS YET. BE THE FIRST.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
