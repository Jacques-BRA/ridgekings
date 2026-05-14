"use client";
import { useState } from "react";
import type { Outcome } from "@/db/schema";
import { settleByCreator } from "@/app/actions/settlement";

interface PropAnswerGroup {
  answer: string;
  bettors: { name: string; stake: number }[];
}

export function CreatorSettleForm({
  betId,
  betType,
  outcomes,
  propGroups,
}: {
  betId: number;
  betType: "yes_no" | "multi_choice" | "over_under" | "prop";
  outcomes: Outcome[];
  propGroups: PropAnswerGroup[];
}) {
  const [selected, setSelected] = useState<string>("");
  const [voiding, setVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(fd: FormData) {
    setError(null);
    try {
      await settleByCreator(fd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <form action={onSubmit} className="space-y-4 rounded-md border border-primary/40 bg-bg-surface p-4">
      <input type="hidden" name="betId" value={betId} />
      {voiding && <input type="hidden" name="voidBet" value="true" />}
      <h3 className="font-display text-display-md uppercase text-primary">Settle this bet</h3>

      {!voiding && betType !== "prop" && (
        <>
          <input type="hidden" name="outcomeId" value={selected} />
          <div className="grid gap-2">
            {outcomes.map((o) => (
              <button
                type="button"
                key={o.id}
                onClick={() => setSelected(String(o.id))}
                className={`rounded-md border px-3 py-2 text-left font-display uppercase ${
                  selected === String(o.id) ? "border-primary bg-primary text-black" : "border-border-strong bg-bg-base"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}

      {!voiding && betType === "prop" && (
        <>
          <input type="hidden" name="propAnswer" value={selected} />
          {propGroups.length === 0 ? (
            <p className="text-text-muted">No answers were submitted. Use Void.</p>
          ) : (
            <div className="space-y-2">
              {propGroups.map((g) => (
                <button
                  type="button"
                  key={g.answer}
                  onClick={() => setSelected(g.answer)}
                  className={`block w-full rounded-md border px-3 py-2 text-left ${
                    selected === g.answer ? "border-primary bg-primary text-black" : "border-border-strong bg-bg-base"
                  }`}
                >
                  <div className="font-display uppercase">{g.answer}</div>
                  <div className="text-xs opacity-80">
                    {g.bettors.map((b) => `${b.name} (${b.stake})`).join(" · ")}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" checked={voiding} onChange={(e) => setVoiding(e.target.checked)} />
          Void (no winner — refund all)
        </label>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={!voiding && !selected}
        className="rounded-md bg-primary px-4 py-2 font-display uppercase text-black hover:bg-primary-hover disabled:opacity-50"
      >
        {voiding ? "Void it" : "Lock in winner"}
      </button>
    </form>
  );
}
