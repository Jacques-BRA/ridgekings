"use client";
import { useState } from "react";
import { placeWager } from "@/app/actions/wagers";
import type { Outcome } from "@/db/schema";

export function PlaceWagerForm({
  betId,
  outcomes,
  maxStake,
}: {
  betId: number;
  outcomes: Outcome[];
  maxStake: number;
}) {
  const [outcomeId, setOutcomeId] = useState<number | null>(outcomes[0]?.id ?? null);
  const [stake, setStake] = useState(10);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(fd: FormData) {
    setError(null);
    try {
      await placeWager(fd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <form action={onSubmit} className="space-y-4 rounded-md border border-border bg-bg-surface p-4">
      <input type="hidden" name="betId" value={betId} />
      <input type="hidden" name="outcomeId" value={outcomeId ?? ""} />
      <h3 className="font-display text-display-md uppercase">Lock it in</h3>
      <div className="grid gap-2">
        {outcomes.map((o) => (
          <button
            type="button"
            key={o.id}
            onClick={() => setOutcomeId(o.id)}
            className={`rounded-md border px-3 py-2 text-left font-display uppercase tracking-wide ${
              outcomeId === o.id ? "border-primary bg-primary text-black" : "border-border-strong bg-bg-base text-text"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-widest text-text-dim mb-1">Stake (max {maxStake})</label>
        <input
          name="stake"
          type="number"
          min={1}
          max={maxStake}
          value={stake}
          onChange={(e) => setStake(Math.max(1, Number(e.target.value)))}
          className="w-full rounded-md border border-border-strong bg-bg-base px-3 py-2 tabular"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={!outcomeId || stake < 1 || stake > maxStake}
        className="w-full rounded-md bg-primary px-4 py-3 font-display text-lg uppercase tracking-wide text-black hover:bg-primary-hover disabled:opacity-50"
      >
        Place Bet
      </button>
    </form>
  );
}
