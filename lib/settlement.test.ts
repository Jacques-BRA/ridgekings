import { describe, it, expect } from "vitest";
import { tallyVoteSettlement, nextStatusAfterDeadlines } from "./settlement";

describe("tallyVoteSettlement", () => {
  it("returns pending when no option is mathematically locked in", () => {
    // 5 bettors, 2 voted A, 1 voted B, 2 haven't voted.
    const r = tallyVoteSettlement({
      totalBettors: 5,
      votes: [
        { outcomeKey: "A" }, { outcomeKey: "A" }, { outcomeKey: "B" },
      ],
    });
    expect(r.status).toBe("pending");
  });

  it("locks in a winner once it cannot mathematically be beaten", () => {
    // 5 bettors, 3 voted A, 1 voted B, 1 remaining.
    const r = tallyVoteSettlement({
      totalBettors: 5,
      votes: [
        { outcomeKey: "A" }, { outcomeKey: "A" }, { outcomeKey: "A" }, { outcomeKey: "B" },
      ],
    });
    expect(r.status).toBe("decided");
    if (r.status !== "decided") throw new Error();
    expect(r.winningKey).toBe("A");
  });

  it("voids on a tie once all bettors have voted", () => {
    const r = tallyVoteSettlement({
      totalBettors: 4,
      votes: [
        { outcomeKey: "A" }, { outcomeKey: "A" },
        { outcomeKey: "B" }, { outcomeKey: "B" },
      ],
    });
    expect(r.status).toBe("void_tie");
  });

  it("treats VOID votes as their own option", () => {
    const r = tallyVoteSettlement({
      totalBettors: 3,
      votes: [{ outcomeKey: null }, { outcomeKey: null }, { outcomeKey: null }],
    });
    expect(r.status).toBe("decided");
    if (r.status !== "decided") throw new Error();
    expect(r.winningKey).toBe(null);
  });

  it("returns pending when no votes have been cast", () => {
    const r = tallyVoteSettlement({ totalBettors: 3, votes: [] });
    expect(r.status).toBe("pending");
  });
});

describe("nextStatusAfterDeadlines", () => {
  const now = "2026-06-01T12:00:00Z";

  it("keeps non-GIF bet open before deadline", () => {
    const r = nextStatusAfterDeadlines({
      currentStatus: "open",
      betType: "yes_no",
      deadline: "2026-06-01T13:00:00Z",
      votingDeadline: null,
      now,
    });
    expect(r).toBe("open");
  });

  it("transitions non-GIF bet open → locked when deadline passes", () => {
    const r = nextStatusAfterDeadlines({
      currentStatus: "open",
      betType: "yes_no",
      deadline: "2026-06-01T11:00:00Z",
      votingDeadline: null,
      now,
    });
    expect(r).toBe("locked");
  });

  it("transitions GIF open → voting at submission deadline", () => {
    const r = nextStatusAfterDeadlines({
      currentStatus: "open",
      betType: "gif_challenge",
      deadline: "2026-06-01T11:00:00Z",
      votingDeadline: "2026-06-01T14:00:00Z",
      now,
    });
    expect(r).toBe("voting");
  });

  it("transitions GIF voting → ready_to_settle when voting deadline passes", () => {
    const r = nextStatusAfterDeadlines({
      currentStatus: "voting",
      betType: "gif_challenge",
      deadline: "2026-06-01T11:00:00Z",
      votingDeadline: "2026-06-01T11:30:00Z",
      now,
    });
    expect(r).toBe("ready_to_settle");
  });

  it("does not transition settled or voided bets", () => {
    expect(
      nextStatusAfterDeadlines({
        currentStatus: "settled",
        betType: "yes_no",
        deadline: "2026-01-01T00:00:00Z",
        votingDeadline: null,
        now,
      }),
    ).toBe("settled");
    expect(
      nextStatusAfterDeadlines({
        currentStatus: "voided",
        betType: "yes_no",
        deadline: "2026-01-01T00:00:00Z",
        votingDeadline: null,
        now,
      }),
    ).toBe("voided");
  });
});
