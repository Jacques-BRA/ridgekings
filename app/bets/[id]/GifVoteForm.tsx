"use client";
import { useState } from "react";
import { castGifVote } from "@/app/actions/settlement";
import type { Submission, User } from "@/db/schema";

export function GifVoteForm({
  betId,
  submissions,
  submitters,
  currentUserId,
  hasVoted,
  voteCounts,
}: {
  betId: number;
  submissions: Submission[];
  submitters: Map<number, User>;
  currentUserId: number;
  hasVoted: boolean;
  voteCounts: Map<number, number>;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (hasVoted) {
    return <p className="text-sm text-text-muted">You&apos;ve voted. Results lock in when voting closes.</p>;
  }

  async function vote(submissionId: number) {
    setError(null);
    setPicked(submissionId);
    const fd = new FormData();
    fd.set("betId", String(betId));
    fd.set("submissionId", String(submissionId));
    try {
      await castGifVote(fd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setPicked(null);
    }
  }

  return (
    <div>
      <h3 className="mb-3 font-display text-display-md uppercase text-info">Vote for the best</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {submissions.map((s) => {
          const isMine = s.userId === currentUserId;
          return (
            <button
              key={s.id}
              type="button"
              disabled={isMine || picked !== null}
              onClick={() => vote(s.id)}
              className={`relative overflow-hidden rounded-md border bg-bg-surface text-left transition ${
                isMine ? "opacity-40 cursor-not-allowed border-border" : "border-border hover:border-info"
              }`}
            >
              <img src={s.gifUrl} alt={s.caption ?? "submission"} loading="lazy" className="aspect-video w-full object-cover" />
              <div className="p-2 text-xs text-text-muted">
                {submitters.get(s.userId)?.name ?? "?"}{isMine && " (you — can't vote)"} ·{" "}
                <span className="tabular">{voteCounts.get(s.id) ?? 0} votes</span>
              </div>
              {s.caption && <p className="px-2 pb-2 text-sm">{s.caption}</p>}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
