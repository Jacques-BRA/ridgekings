import { notFound } from "next/navigation";
import { db } from "@/db";
import { bets, outcomes, wagers, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { reconcileBetStatus } from "@/lib/sweeps";
import { OddsDisplay } from "@/components/OddsDisplay";
import { PlaceWagerForm } from "./PlaceWagerForm";
import { PropWagerForm } from "./PropWagerForm";
import { formatPoints, formatDeadlineCountdown } from "@/lib/format";
import { LiveBadge, BoostBadge, VoidStamp, SettledBadge } from "@/components/BetBadges";
import { BetDetailClient } from "./BetDetailClient";

export default async function BetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const betId = Number(id);
  if (!Number.isFinite(betId)) notFound();

  await reconcileBetStatus(betId);

  const bet = db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!bet) notFound();
  const ocs = db.select().from(outcomes).where(eq(outcomes.betId, betId)).all();
  const allWagers = db.select().from(wagers).where(eq(wagers.betId, betId)).all();
  const me = await getCurrentUser();
  const userIds = Array.from(new Set([bet.creatorId, ...allWagers.map((w) => w.userId)]));
  const usersById = new Map(
    (userIds.length > 0
      ? db.select().from(users).where(inArray(users.id, userIds)).all()
      : []
    ).map((u) => [u.id, u]),
  );

  const totalPool = allWagers.reduce((s, w) => s + w.stake, 0);
  const myWager = me ? allWagers.find((w) => w.userId === me.id) : undefined;
  const stakeByOutcome = new Map<number, number>();
  for (const w of allWagers) {
    if (w.outcomeId !== null) stakeByOutcome.set(w.outcomeId, (stakeByOutcome.get(w.outcomeId) ?? 0) + w.stake);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <BetDetailClient betId={bet.id} initialStatus={bet.status} />
      <div className="relative rounded-md border border-border bg-bg-surface p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {bet.status === "open" && <LiveBadge />}
          {bet.isBoosted === 1 && <BoostBadge />}
          {bet.status === "settled" && <SettledBadge />}
          <span className="font-mono text-xs text-text-dim">#{bet.id}</span>
        </div>
        <h1 className="font-display text-display-xl text-text">{bet.title}</h1>
        {bet.description && <p className="mt-2 text-text-muted whitespace-pre-line">{bet.description}</p>}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Stat label="Pool" value={`${formatPoints(totalPool)} RKD`} accent />
          <Stat label="Bettors" value={String(allWagers.length)} />
          <Stat label={bet.status === "open" ? "Closes" : "Closed"} value={bet.status === "open" ? formatDeadlineCountdown(bet.deadline) : "—"} />
          <Stat label="Creator" value={usersById.get(bet.creatorId)?.name ?? "?"} />
        </div>
        {bet.status === "voided" && <VoidStamp />}
      </div>

      {/* Outcomes board for structured types */}
      {bet.betType !== "prop" && bet.betType !== "gif_challenge" && (
        <section className="mt-6 grid gap-3 md:grid-cols-2">
          {ocs.map((o) => (
            <div key={o.id} className="rounded-md border border-border bg-bg-surface p-4">
              <div className="text-[10px] uppercase tracking-widest text-text-dim">Outcome</div>
              <div className="font-display text-display-md uppercase">{o.label}</div>
              <div className="mt-3">
                <OddsDisplay stakeOnOutcome={stakeByOutcome.get(o.id) ?? 0} totalPool={totalPool} />
              </div>
              <div className="mt-1 text-xs text-text-dim">
                Pool here: <span className="text-text tabular">{formatPoints(stakeByOutcome.get(o.id) ?? 0)}</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Wager UI */}
      {bet.status === "open" && me && !myWager && bet.betType !== "gif_challenge" && (
        <section className="mt-6">
          {bet.betType === "prop" ? (
            <PropWagerForm betId={bet.id} maxStake={me.balance} />
          ) : (
            <PlaceWagerForm betId={bet.id} outcomes={ocs} maxStake={me.balance} />
          )}
        </section>
      )}

      {/* Already-bet summary */}
      {myWager && (
        <section className="mt-6 rounded-md border border-primary/40 bg-bg-surface p-4">
          <h3 className="font-display text-display-md uppercase text-primary">Your ticket</h3>
          <p className="mt-1 text-sm">
            Stake: <span className="tabular">{formatPoints(myWager.stake)}</span> RKD ·{" "}
            Pick: {myWager.propAnswer ?? ocs.find((o) => o.id === myWager.outcomeId)?.label ?? "?"}
          </p>
        </section>
      )}

      {/* Wager list */}
      {allWagers.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 font-display text-display-md uppercase tracking-wide text-text-muted">All bettors</h3>
          <ul className="divide-y divide-border rounded-md border border-border bg-bg-surface">
            {allWagers.map((w) => (
              <li key={w.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  <span className="font-display uppercase tracking-wide">{usersById.get(w.userId)?.name ?? "?"}</span>
                  <span className="ml-2 text-text-muted">
                    {w.propAnswer ?? ocs.find((o) => o.id === w.outcomeId)?.label ?? "?"}
                  </span>
                </span>
                <span className="tabular">{formatPoints(w.stake)} RKD</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-text-dim">{label}</div>
      <div className={`font-display text-display-md tabular ${accent ? "text-primary" : "text-text"}`}>{value}</div>
    </div>
  );
}
