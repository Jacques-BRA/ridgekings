import { db } from "@/db";
import { bets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nextStatusAfterDeadlines } from "./settlement";

export async function reconcileBetStatus(betId: number): Promise<void> {
  const b = db.select().from(bets).where(eq(bets.id, betId)).get();
  if (!b) return;
  const next = nextStatusAfterDeadlines({
    currentStatus: b.status,
    betType: b.betType,
    deadline: b.deadline,
    votingDeadline: b.votingDeadline,
    now: new Date().toISOString(),
  });
  if (next !== b.status && next !== "ready_to_settle") {
    db.update(bets).set({ status: next as typeof b.status }).where(eq(bets.id, b.id)).run();
  }
}
