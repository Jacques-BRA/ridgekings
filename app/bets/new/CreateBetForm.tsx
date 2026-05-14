"use client";
import { useState } from "react";
import { createBet } from "@/app/actions/bets";

type BetType = "yes_no" | "multi_choice" | "over_under" | "prop" | "gif_challenge";

export function CreateBetForm() {
  const [betType, setBetType] = useState<BetType>("yes_no");
  const [outcomeLabels, setOutcomeLabels] = useState<string[]>(["", ""]);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setError(null);
    try {
      await createBet(formData);
    } catch (e) {
      const digest = (e as { digest?: string } | null | undefined)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw e;
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  return (
    <form action={onSubmit} className="space-y-6 max-w-2xl">
      <input type="hidden" name="betType" value={betType} />

      <div>
        <label className="block text-[10px] uppercase tracking-widest text-text-dim mb-1">Title</label>
        <input
          name="title"
          required
          maxLength={140}
          placeholder="Will Jessica show up Monday?"
          className="w-full rounded-md border border-border-strong bg-bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-widest text-text-dim mb-1">Description (optional)</label>
        <textarea
          name="description"
          maxLength={500}
          rows={3}
          className="w-full rounded-md border border-border-strong bg-bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-widest text-text-dim mb-2">Bet type</label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {([
            ["yes_no", "Yes/No"],
            ["multi_choice", "Multi"],
            ["over_under", "Over/Under"],
            ["prop", "Prop"],
            ["gif_challenge", "GIF Challenge"],
          ] as [BetType, string][]).map(([k, label]) => (
            <button
              type="button"
              key={k}
              onClick={() => setBetType(k)}
              className={`rounded-md border px-3 py-2 font-display uppercase tracking-wide text-sm ${
                betType === k ? "border-primary bg-primary text-black" : "border-border-strong bg-bg-surface text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {betType === "multi_choice" && (
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-text-dim mb-2">Outcomes (2–8)</label>
          <div className="space-y-2">
            {outcomeLabels.map((v, i) => (
              <div key={i} className="flex gap-2">
                <input
                  name="outcomeLabels"
                  value={v}
                  onChange={(e) => setOutcomeLabels((arr) => arr.map((x, idx) => (idx === i ? e.target.value : x)))}
                  placeholder={`Option ${i + 1}`}
                  className="flex-1 rounded-md border border-border-strong bg-bg-surface px-3 py-2"
                  maxLength={60}
                />
                {outcomeLabels.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setOutcomeLabels((arr) => arr.filter((_, idx) => idx !== i))}
                    className="px-3 text-danger"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {outcomeLabels.length < 8 && (
              <button
                type="button"
                onClick={() => setOutcomeLabels((arr) => [...arr, ""])}
                className="text-sm text-primary hover:text-primary-hover"
              >
                + Add option
              </button>
            )}
          </div>
        </div>
      )}

      {betType === "over_under" && (
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-text-dim mb-1">Line</label>
          <input
            name="line"
            type="number"
            step="0.5"
            required
            placeholder="2.5"
            className="w-full rounded-md border border-border-strong bg-bg-surface px-3 py-2"
          />
        </div>
      )}

      {betType === "gif_challenge" && (
        <>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-text-dim mb-1">Entry fee (RKD)</label>
            <input
              name="entryFee"
              type="number"
              min={1}
              required
              defaultValue={50}
              className="w-full rounded-md border border-border-strong bg-bg-surface px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-text-dim mb-1">Voting deadline</label>
            <input
              name="votingDeadline"
              type="datetime-local"
              required
              className="w-full rounded-md border border-border-strong bg-bg-surface px-3 py-2"
            />
          </div>
        </>
      )}

      <div>
        <label className="block text-[10px] uppercase tracking-widest text-text-dim mb-1">
          {betType === "gif_challenge" ? "Submission deadline" : "Deadline"}
        </label>
        <input
          name="deadline"
          type="datetime-local"
          required
          className="w-full rounded-md border border-border-strong bg-bg-surface px-3 py-2"
        />
      </div>

      {betType !== "gif_challenge" && (
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-text-dim mb-2">Settlement</label>
          <div className="flex gap-2">
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-bg-surface px-3 py-2">
              <input type="radio" name="settlementMode" value="creator" defaultChecked />
              <span className="font-display uppercase tracking-wide">Creator settles</span>
            </label>
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-bg-surface px-3 py-2">
              <input type="radio" name="settlementMode" value="vote" />
              <span className="font-display uppercase tracking-wide">Bettors vote</span>
            </label>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        className="rounded-md bg-primary px-6 py-3 font-display text-lg uppercase tracking-wide text-black hover:bg-primary-hover glow-primary"
      >
        Post the line
      </button>
    </form>
  );
}
