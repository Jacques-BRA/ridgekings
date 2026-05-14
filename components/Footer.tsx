import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-bg-base">
      <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-text-dim leading-relaxed">
        <p className="mb-2 font-display tracking-wide uppercase text-text-muted">Responsible Gaming Notice</p>
        <p>
          Gamble responsibly. Must be 18+ and employed at this office. If you or someone you know has an office
          gambling problem, please contact <Link href="/responsible-gaming" className="underline hover:text-primary">HR</Link>.
          Bets are settled at the sole discretion of the bet creator, the bettors, the admin, or whichever of them
          yells loudest. RidgeKings is not a real sportsbook and &quot;RKD&quot; is not a real currency. Probably. Terms apply,
          but we didn&apos;t write any.
        </p>
        <p className="mt-2 text-text-dim/70">© RidgeKings — Where Productivity Goes To Die™</p>
      </div>
    </footer>
  );
}
