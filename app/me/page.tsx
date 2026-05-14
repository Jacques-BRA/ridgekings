import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ledgerForUser } from "@/lib/queries";
import { formatPoints, formatRelativeTime } from "@/lib/format";

const KIND_LABELS: Record<string, string> = {
  seed: "SEED",
  stipend: "STIPEND",
  wager_lock: "WAGER",
  wager_refund: "REFUND",
  winnings: "WIN",
  gif_entry: "GIF ENTRY",
  gif_refund: "GIF REFUND",
  admin_adjust: "ADMIN",
};

export default async function MePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  const txns = ledgerForUser(me.id);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 font-display text-display-xl text-text">My Ledger</h1>
      <p className="mb-6 text-text-muted">Balance: <span className="text-primary tabular">{formatPoints(me.balance)}</span> RKD</p>
      <ul className="divide-y divide-border rounded-md border border-border bg-bg-surface">
        {txns.length === 0 && <li className="px-4 py-8 text-center text-text-muted">No transactions yet.</li>}
        {txns.map((t) => {
          const positive = t.amount >= 0;
          return (
            <li key={t.id} className="flex items-center justify-between px-4 py-2 font-mono text-sm">
              <span className="flex items-center gap-3">
                <span className={`inline-block w-20 rounded px-2 py-0.5 text-center text-[10px] font-display uppercase tracking-widest ${
                  positive ? "bg-primary/15 text-primary" : "bg-danger/15 text-danger"
                }`}>
                  {KIND_LABELS[t.kind] ?? t.kind}
                </span>
                {t.betId && (
                  <Link href={`/bets/${t.betId}`} className="text-text-muted hover:text-primary">
                    bet #{t.betId}
                  </Link>
                )}
                {t.note && <span className="text-text-dim">{t.note}</span>}
              </span>
              <span className="flex items-center gap-3">
                <span className={`tabular ${positive ? "text-primary" : "text-danger"}`}>
                  {positive ? "+" : ""}{formatPoints(t.amount)}
                </span>
                <span className="text-xs text-text-dim">{formatRelativeTime(t.createdAt)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
