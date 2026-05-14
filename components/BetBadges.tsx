export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm bg-live/15 px-2 py-0.5 text-[10px] font-display uppercase tracking-widest text-live">
      <span className="block h-1.5 w-1.5 rounded-full bg-live animate-live-pulse" />
      Live
    </span>
  );
}

export function BoostBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-info/15 px-2 py-0.5 text-[10px] font-display uppercase tracking-widest text-info">
      ⚡ Boost
    </span>
  );
}

export function VoidStamp() {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="rotate-[-12deg] border-4 border-danger px-4 py-1 font-display text-4xl uppercase tracking-widest text-danger opacity-80 animate-void-stamp-in">
        Void
      </span>
    </span>
  );
}

export function SettledBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-bg-elevated px-2 py-0.5 text-[10px] font-display uppercase tracking-widest text-text-dim">
      Settled
    </span>
  );
}
