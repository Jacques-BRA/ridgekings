export interface VoteRecord {
  outcomeKey: string | null; // null = void vote
}

export type VoteTallyResult =
  | { status: "pending" }
  | { status: "decided"; winningKey: string | null; tally: Map<string | null, number> }
  | { status: "void_tie"; tally: Map<string | null, number> };

export function tallyVoteSettlement(input: { totalBettors: number; votes: VoteRecord[] }): VoteTallyResult {
  const { totalBettors, votes } = input;
  const tally = new Map<string | null, number>();
  for (const v of votes) {
    tally.set(v.outcomeKey, (tally.get(v.outcomeKey) ?? 0) + 1);
  }
  if (votes.length === 0) return { status: "pending" };

  const remaining = totalBettors - votes.length;
  const entries = Array.from(tally.entries());
  let leader = entries[0];
  for (const e of entries) if (e[1] > leader[1]) leader = e;
  const leaderCount = leader[1];

  // A leader is locked when every other candidate's count + remaining < leaderCount.
  const lockedIn = entries.every(([k, c]) => k === leader[0] || c + remaining < leaderCount);
  if (lockedIn) return { status: "decided", winningKey: leader[0], tally };

  if (remaining === 0) {
    return { status: "void_tie", tally };
  }
  return { status: "pending" };
}

export type BetStatus = "open" | "locked" | "voting" | "settled" | "voided" | "ready_to_settle";

export function nextStatusAfterDeadlines(input: {
  currentStatus: "open" | "locked" | "voting" | "settled" | "voided";
  betType: "yes_no" | "multi_choice" | "over_under" | "prop" | "gif_challenge";
  deadline: string;
  votingDeadline: string | null;
  now: string;
}): BetStatus {
  const { currentStatus, betType, deadline, votingDeadline, now } = input;
  if (currentStatus === "settled" || currentStatus === "voided") return currentStatus;
  const nowMs = Date.parse(now);
  const deadlineMs = Date.parse(deadline);

  if (betType === "gif_challenge") {
    if (currentStatus === "open" && nowMs >= deadlineMs) return "voting";
    if (currentStatus === "voting" && votingDeadline && nowMs >= Date.parse(votingDeadline)) {
      return "ready_to_settle";
    }
    return currentStatus;
  }

  if (currentStatus === "open" && nowMs >= deadlineMs) return "locked";
  return currentStatus;
}
