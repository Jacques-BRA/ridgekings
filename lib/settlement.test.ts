import { describe, it, expect } from "vitest";
import { tallyVoteSettlement } from "./settlement";

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
