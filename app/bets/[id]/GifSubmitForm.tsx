"use client";
import { useState } from "react";
import { submitGif } from "@/app/actions/wagers";

export function GifSubmitForm({ betId, entryFee, maxBalance }: { betId: number; entryFee: number; maxBalance: number }) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(fd: FormData) {
    setError(null);
    try {
      await submitGif(fd);
      setUrl("");
      setCaption("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <form action={onSubmit} className="space-y-3 rounded-md border border-border bg-bg-surface p-4">
      <input type="hidden" name="betId" value={betId} />
      <h3 className="font-display text-display-md uppercase">Submit your GIF</h3>
      <p className="text-xs text-text-dim">Entry fee: <span className="text-primary tabular">{entryFee}</span> RKD · Your balance: {maxBalance}</p>
      <div>
        <label className="block text-[10px] uppercase tracking-widest text-text-dim mb-1">Giphy / Tenor / direct .gif URL</label>
        <input
          name="gifUrl"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          placeholder="https://media.giphy.com/..."
          className="w-full rounded-md border border-border-strong bg-bg-base px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-widest text-text-dim mb-1">Caption (optional)</label>
        <input
          name="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={120}
          className="w-full rounded-md border border-border-strong bg-bg-base px-3 py-2"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={!url.trim() || maxBalance < entryFee}
        className="rounded-md bg-primary px-4 py-2 font-display uppercase text-black hover:bg-primary-hover disabled:opacity-50"
      >
        Submit GIF ({entryFee} RKD)
      </button>
    </form>
  );
}
