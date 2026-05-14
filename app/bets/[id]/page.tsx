import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { db } from "@/db";
import { bets, outcomes, wagers, users, settlementVotes, submissions, gifVotes } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { reconcileBetStatus } from "@/lib/sweeps";
import { OddsDisplay } from "@/components/OddsDisplay";
import { PlaceWagerForm } from "./PlaceWagerForm";
import { PropWagerForm } from "./PropWagerForm";
import { CreatorSettleForm } from "./CreatorSettleForm";
import { VoteSettleForm } from "./VoteSettleForm";
import { GifSubmitForm } from "./GifSubmitForm";
import { GifGallery } from "./GifGallery";
import { GifVoteForm } from "./GifVoteForm";
import { formatPoints, formatDeadlineCountdown } from "@/lib/format";
import { LiveBadge, BoostBadge, VoidStamp, SettledBadge } from "@/components/BetBadges";
import { BetDetailClient } from "./BetDetailClient";
import { AdminPanel } from "./AdminPanel";

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

  let creatorView: ReactNode = null;
  let voteView: ReactNode = null;
  if (bet.status === "locked" && bet.betType !== "gif_challenge") {
    if (bet.settlementMode === "creator") {
      const propGroups = bet.betType === "prop"
        ? Object.values(
            allWagers.reduce<Record<string, { answer: string; bettors: { name: string; stake: number }[] }>>((acc, w) => {
              const ans = (w.propAnswer ?? "").trim();
              const key = ans.toLowerCase();
              if (!acc[key]) acc[key] = { answer: ans, bettors: [] };
              acc[key].bettors.push({ name: usersById.get(w.userId)?.name ?? "?", stake: w.stake });
              return acc;
            }, {}),
          )
        : [];
      if (me && (me.id === bet.creatorId || isAdmin(me))) {
        creatorView = <CreatorSettleForm betId={bet.id} betType={bet.betType} outcomes={ocs} propGroups={propGroups} />;
      } else {
        creatorView = (
          <p className="rounded-md border border-border bg-bg-surface px-4 py-3 text-sm text-text-muted">
            Waiting on <span className="text-text">{usersById.get(bet.creatorId)?.name}</span> to settle this bet.
          </p>
        );
      }
    } else if (bet.settlementMode === "vote") {
      const votes = db.select().from(settlementVotes).where(eq(settlementVotes.betId, bet.id)).all();
      const totalBettors = allWagers.length;
      const tallyMap = new Map<string, { label: string; count: number }>();
      for (const v of votes) {
        let key: string;
        let label: string;
        if (v.isVoidVote === 1) {
          key = "void";
          label = "VOID";
        } else if (bet.betType === "prop") {
          const ans = (v.propAnswer ?? "").trim();
          key = `prop:${ans.toLowerCase()}`;
          label = ans;
        } else {
          key = `oc:${v.outcomeId}`;
          label = ocs.find((o) => o.id === v.outcomeId)?.label ?? "?";
        }
        const cur = tallyMap.get(key) ?? { label, count: 0 };
        cur.count += 1;
        tallyMap.set(key, cur);
      }
      const tally = Array.from(tallyMap.entries()).map(([key, v]) => ({ key, label: v.label, count: v.count }));
      const hasVoted = !!votes.find((v) => v.voterUserId === me?.id);
      const propAnswers = bet.betType === "prop"
        ? Array.from(new Set(allWagers.map((w) => (w.propAnswer ?? "").trim()).filter(Boolean)))
        : [];
      if (me && allWagers.some((w) => w.userId === me.id)) {
        voteView = (
          <VoteSettleForm
            betId={bet.id}
            betType={bet.betType}
            outcomes={ocs}
            propAnswers={propAnswers}
            hasVoted={hasVoted}
            tally={tally}
            totalBettors={totalBettors}
          />
        );
      } else {
        voteView = (
          <div className="rounded-md border border-border bg-bg-surface p-4 text-sm">
            <h3 className="mb-2 font-display text-display-md uppercase text-info">Vote tally</h3>
            {tally.map((t) => (
              <div key={t.key} className="flex justify-between">
                <span>{t.label}</span>
                <span className="tabular">{t.count} / {totalBettors}</span>
              </div>
            ))}
          </div>
        );
      }
    }
  }

  let gifView: ReactNode = null;
  if (bet.betType === "gif_challenge") {
    const subs = db.select().from(submissions).where(eq(submissions.betId, bet.id)).all();
    const submitterIds = Array.from(new Set(subs.map((s) => s.userId)));
    const subUsers = submitterIds.length
      ? db.select().from(users).where(inArray(users.id, submitterIds)).all()
      : [];
    const subUsersMap = new Map(subUsers.map((u) => [u.id, u]));
    const votes = db.select().from(gifVotes).where(eq(gifVotes.betId, bet.id)).all();
    const voteCounts = new Map<number, number>();
    for (const v of votes) voteCounts.set(v.submissionId, (voteCounts.get(v.submissionId) ?? 0) + 1);
    const hasVoted = !!votes.find((v) => v.voterUserId === me?.id);
    const mySub = subs.find((s) => s.userId === me?.id);

    const galleryItems = subs.map((s) => ({
      submission: s,
      submitter: subUsersMap.get(s.userId),
      voteCount: voteCounts.get(s.id) ?? 0,
      isMine: s.userId === me?.id,
      isWinner: bet.winningSubmissionId === s.id,
    }));

    gifView = (
      <section className="mt-6 space-y-6">
        <div>
          <h3 className="mb-3 font-display text-display-md uppercase text-text-muted">Submissions</h3>
          <GifGallery items={galleryItems} phase={bet.status as "open" | "voting" | "settled" | "voided"} />
        </div>
        {bet.status === "open" && me && !mySub && (
          <GifSubmitForm betId={bet.id} entryFee={bet.entryFee ?? 0} maxBalance={me.balance} />
        )}
        {bet.status === "voting" && me && (
          <GifVoteForm
            betId={bet.id}
            submissions={subs}
            submitters={subUsersMap}
            currentUserId={me.id}
            hasVoted={hasVoted}
            voteCounts={voteCounts}
          />
        )}
      </section>
    );
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

      {(creatorView || voteView) && <section className="mt-6 space-y-4">{creatorView}{voteView}</section>}
      {gifView}

      {isAdmin(me) && (
        <AdminPanel
          betId={bet.id}
          betType={bet.betType}
          outcomes={ocs}
          submissions={bet.betType === "gif_challenge" ? db.select().from(submissions).where(eq(submissions.betId, bet.id)).all() : []}
          isBoosted={bet.isBoosted === 1}
        />
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
