"use client";
import { useState } from "react";
import { adminVoidBet, adminForceSettle, toggleBoost } from "@/app/actions/admin";
import type { Outcome, Submission } from "@/db/schema";

export function AdminPanel({
  betId,
  betType,
  outcomes,
  submissions,
  isBoosted,
  canForceSettle,
}: {
  betId: number;
  betType: "yes_no" | "multi_choice" | "over_under" | "prop" | "gif_challenge";
  outcomes: Outcome[];
  submissions: Submission[];
  isBoosted: boolean;
  canForceSettle: boolean;
}) {
  const [pickedOutcome, setPickedOutcome] = useState<string>("");
  const [propAnswer, setPropAnswer] = useState("");
  const [pickedSub, setPickedSub] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function run(fn: (fd: FormData) => Promise<void>, fd: FormData) {
    setError(null);
    try { await fn(fd); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <section className="mt-6 rounded-md border border-gold/40 bg-bg-surface p-4">
      <h3 className="mb-3 font-display text-display-md uppercase text-gold">
        {canForceSettle ? "Admin Console" : "Creator Controls"}
      </h3>

      <form action={(fd) => run(toggleBoost, fd)} className="mb-4 flex items-center justify-between">
        <input type="hidden" name="betId" value={betId} />
        <span className="text-sm text-text-muted">{isBoosted ? "BOOST is ON" : "BOOST is OFF"}</span>
        <button type="submit" className="rounded-md bg-info px-3 py-1 font-display uppercase text-black hover:opacity-90">
          {isBoosted ? "Un-boost" : "Boost it"}
        </button>
      </form>

      <form action={(fd) => run(adminVoidBet, fd)} className="mb-4">
        <input type="hidden" name="betId" value={betId} />
        <button type="submit" className="rounded-md bg-danger px-3 py-1 font-display uppercase text-black hover:opacity-90">
          Force VOID (refund all)
        </button>
      </form>

      {canForceSettle && (
      <form action={(fd) => run(adminForceSettle, fd)} className="space-y-2 border-t border-border pt-3">
        <input type="hidden" name="betId" value={betId} />
        <p className="text-xs uppercase tracking-widest text-text-dim">Force-settle to a winner</p>

        {betType !== "prop" && betType !== "gif_challenge" && (
          <>
            <input type="hidden" name="outcomeId" value={pickedOutcome} />
            <div className="flex flex-wrap gap-2">
              {outcomes.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  onClick={() => setPickedOutcome(String(o.id))}
                  className={`rounded border px-2 py-1 text-sm ${
                    pickedOutcome === String(o.id) ? "border-primary bg-primary text-black" : "border-border-strong"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )}
        {betType === "prop" && (
          <input
            name="propAnswer"
            value={propAnswer}
            onChange={(e) => setPropAnswer(e.target.value)}
            placeholder="Winning prop answer"
            className="w-full rounded-md border border-border-strong bg-bg-base px-3 py-2 text-sm"
          />
        )}
        {betType === "gif_challenge" && (
          <>
            <input type="hidden" name="submissionId" value={pickedSub} />
            <div className="grid grid-cols-3 gap-2">
              {submissions.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setPickedSub(String(s.id))}
                  className={`overflow-hidden rounded border ${
                    pickedSub === String(s.id) ? "border-primary" : "border-border-strong"
                  }`}
                >
                  <img src={s.gifUrl} alt="" className="aspect-video w-full object-cover" />
                  <span className="block px-1 py-0.5 text-[10px]">#{s.id}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" className="rounded-md bg-gold px-3 py-1 font-display uppercase text-black hover:opacity-90">
          Force settle
        </button>
      </form>
      )}
      {!canForceSettle && error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
