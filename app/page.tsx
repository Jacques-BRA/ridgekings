import { getCurrentUser } from "@/lib/auth";
import { listBetsByStatuses } from "@/lib/queries";
import { BetCard } from "@/components/BetCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

export default async function HomePage() {
  const me = await getCurrentUser();
  const openBets = listBetsByStatuses(["open", "voting"], me?.id ?? null);
  const awaitingBets = listBetsByStatuses(["locked"], me?.id ?? null);
  const settledBets = listBetsByStatuses(["settled", "voided"], me?.id ?? null);

  const sortBoostedFirst = <T extends { bet: { isBoosted: number; deadline: string; settledAt: string | null } }>(
    list: T[],
    mode: "deadline_asc" | "settled_desc",
  ) =>
    [...list].sort((a, b) => {
      if (a.bet.isBoosted !== b.bet.isBoosted) return b.bet.isBoosted - a.bet.isBoosted;
      if (mode === "deadline_asc") return a.bet.deadline.localeCompare(b.bet.deadline);
      return (b.bet.settledAt ?? "").localeCompare(a.bet.settledAt ?? "");
    });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-display-xl text-text">The Action</h1>
        <Link
          href="/bets/new"
          className="rounded-md bg-primary px-4 py-2 font-display text-sm uppercase tracking-wide text-black hover:bg-primary-hover glow-primary"
        >
          + New Bet
        </Link>
      </div>

      <Tabs defaultValue="open">
        <TabsList className="bg-bg-surface border border-border">
          <TabsTrigger value="open" className="font-display uppercase tracking-wide data-[active]:bg-primary data-[active]:text-black">
            Open <span className="ml-2 tabular">{openBets.length}</span>
          </TabsTrigger>
          <TabsTrigger value="awaiting" className="font-display uppercase tracking-wide data-[active]:bg-primary data-[active]:text-black">
            Awaiting <span className="ml-2 tabular">{awaitingBets.length}</span>
          </TabsTrigger>
          <TabsTrigger value="settled" className="font-display uppercase tracking-wide data-[active]:bg-primary data-[active]:text-black">
            Settled <span className="ml-2 tabular">{settledBets.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-6">
          {openBets.length === 0 ? (
            <EmptyState text="NO ACTION RIGHT NOW. BE THE FIRST TO POST A LINE." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {sortBoostedFirst(openBets, "deadline_asc").map((s) => (
                <BetCard key={s.bet.id} summary={s} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="awaiting" className="mt-6">
          {awaitingBets.length === 0 ? (
            <EmptyState text="NOTHING WAITING. ALL CAUGHT UP." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {sortBoostedFirst(awaitingBets, "deadline_asc").map((s) => (
                <BetCard key={s.bet.id} summary={s} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="settled" className="mt-6">
          {settledBets.length === 0 ? (
            <EmptyState text="HISTORY IS A BLANK SLATE." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {sortBoostedFirst(settledBets, "settled_desc").map((s) => (
                <BetCard key={s.bet.id} summary={s} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border-strong bg-bg-surface px-6 py-16 text-center">
      <p className="font-display text-display-md uppercase tracking-wide text-text-muted">{text}</p>
    </div>
  );
}
