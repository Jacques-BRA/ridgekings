"use client";
import { useState } from "react";
import { placeWager } from "@/app/actions/wagers";

export function PropWagerForm({ betId, maxStake }: { betId: number; maxStake: number }) {
  const [answer, setAnswer] = useState("");
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
      <h3 className="font-display text-display-md uppercase">Make your call</h3>
      <div>
        <label className="block text-[10px] uppercase tracking-widest text-text-dim mb-1">Your answer</label>
        <input
          name="propAnswer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          required
          maxLength={120}
          className="w-full rounded-md border border-border-strong bg-bg-base px-3 py-2"
        />
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
        disabled={!answer.trim() || stake < 1 || stake > maxStake}
        className="w-full rounded-md bg-primary px-4 py-3 font-display text-lg uppercase tracking-wide text-black hover:bg-primary-hover disabled:opacity-50"
      >
        Lock in answer
      </button>
    </form>
  );
}
