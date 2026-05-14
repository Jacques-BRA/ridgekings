import type { Submission, User } from "@/db/schema";

interface Item {
  submission: Submission;
  submitter: User | undefined;
  voteCount: number;
  isMine: boolean;
  isWinner: boolean;
}

export function GifGallery({ items, phase }: { items: Item[]; phase: "open" | "voting" | "settled" | "voided" }) {
  if (items.length === 0) {
    return <p className="text-text-muted text-sm">No GIFs submitted yet.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <figure
          key={it.submission.id}
          className={`relative overflow-hidden rounded-md border bg-bg-surface ${it.isWinner ? "border-primary glow-primary" : "border-border"}`}
        >
          <img
            src={it.submission.gifUrl}
            alt={it.submission.caption ?? "submission"}
            loading="lazy"
            className="aspect-video w-full object-cover"
          />
          <figcaption className="p-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-text-dim">
              <span>{it.submitter?.name ?? "?"}{it.isMine && " (you)"}</span>
              {phase !== "open" && <span className="tabular">{it.voteCount} vote{it.voteCount === 1 ? "" : "s"}</span>}
            </div>
            {it.submission.caption && <p className="mt-1 text-sm text-text">{it.submission.caption}</p>}
            {it.isWinner && <p className="mt-2 font-display uppercase text-primary">★ Winner</p>}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
