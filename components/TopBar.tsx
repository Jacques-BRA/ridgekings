import Link from "next/link";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { UserPicker } from "./UserPicker";
import { BalanceCounter } from "./BalanceCounter";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function TopBar() {
  const me = await getCurrentUser();
  const allUsers = db.select({ id: users.id, name: users.name }).from(users).all();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg-base/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-primary text-2xl leading-none">♚</span>
          <span className="font-display text-2xl tracking-wide text-text">RIDGEKINGS</span>
          <span className="hidden text-text-dim text-xs uppercase tracking-widest md:inline">The Office Sportsbook</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm uppercase tracking-wide">
          <Link href="/" className="hover:text-primary">Board</Link>
          <Link href="/bets/new" className="hover:text-primary">New Bet</Link>
          <Link href="/leaderboard" className="hover:text-primary">Leaderboard</Link>
          <Link href="/me" className="hover:text-primary">My Ledger</Link>
        </nav>
        <div className="flex items-center gap-3">
          {me ? (
            <>
              <div className="text-right">
                <div className="text-text-dim text-xs uppercase tracking-wide">Balance</div>
                <BalanceCounter initial={me.balance} />
              </div>
              <UserPicker currentName={me.name} users={allUsers} isAdmin={isAdmin(me)} />
            </>
          ) : (
            <UserPicker currentName={null} users={allUsers} isAdmin={false} />
          )}
        </div>
      </div>
    </header>
  );
}
