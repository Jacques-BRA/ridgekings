"use client";
import { useState } from "react";
import type { Outcome } from "@/db/schema";
import { castSettlementVote } from "@/app/actions/settlement";

export function VoteSettleForm({
  betId,
  betType,
  outcomes,
  propAnswers,
  hasVoted,
  tally,
  totalBettors,
}: {
  betId: number;
  betType: "yes_no" | "multi_choice" | "over_under" | "prop";
  outcomes: Outcome[];
  propAnswers: string[];
  hasVoted: boolean;
  tally: { key: string; label: string; count: number }[];
  totalBettors: number;
}) {
  const [selected, setSelected] = useState<string>("");
  const [voidVote, setVoidVote] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(fd: FormData) {
    setError(null);
    try {
      await castSettlementVote(fd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <section className="space-y-4 rounded-md border border-info/40 bg-bg-surface p-4">
      <h3 className="font-display text-display-md uppercase text-info">Bettors vote</h3>

      <div className="space-y-1 text-sm">
        {tally.map((t) => (
          <div key={t.key} className="flex items-center justify-between rounded bg-bg-base px-2 py-1">
            <span>{t.label}</span>
            <span className="tabular">{t.count} / {totalBettors}</span>
          </div>
        ))}
      </div>

      {!hasVoted && (
        <form action={onSubmit} className="space-y-3 border-t border-border pt-3">
          <input type="hidden" name="betId" value={betId} />
          {voidVote && <input type="hidden" name="isVoid" value="true" />}
          {!voidVote && betType !== "prop" && (
            <>
              <input type="hidden" name="outcomeId" value={selected} />
              <div className="grid gap-2">
                {outcomes.map((o) => (
                  <button
                    type="button"
                    key={o.id}
                    onClick={() => setSelected(String(o.id))}
                    className={`rounded-md border px-3 py-2 text-left font-display uppercase ${
                      selected === String(o.id) ? "border-info bg-info text-black" : "border-border-strong bg-bg-base"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {!voidVote && betType === "prop" && (
            <>
              <input type="hidden" name="propAnswer" value={selected} />
              <div className="space-y-2">
                {propAnswers.map((a) => (
                  <button
                    type="button"
                    key={a}
                    onClick={() => setSelected(a)}
                    className={`block w-full rounded-md border px-3 py-2 text-left ${
                      selected === a ? "border-info bg-info text-black" : "border-border-strong bg-bg-base"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input type="checkbox" checked={voidVote} onChange={(e) => setVoidVote(e.target.checked)} />
            Vote to VOID (no winner)
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={!voidVote && !selected}
            className="rounded-md bg-info px-4 py-2 font-display uppercase text-black hover:opacity-90 disabled:opacity-50"
          >
            Cast vote
          </button>
        </form>
      )}
      {hasVoted && <p className="text-sm text-text-muted">You&apos;ve voted. Tally updates live.</p>}
    </section>
  );
}
