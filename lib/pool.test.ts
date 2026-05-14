import { describe, it, expect } from "vitest";
import { computeParimutuelPayouts, computeGifChallengePayout } from "./pool";

describe("computeParimutuelPayouts — basic", () => {
  it("splits the pool proportionally to stake on the winning side", () => {
    const result = computeParimutuelPayouts({
      wagers: [
        { id: 1, userId: 10, outcomeKey: "YES", stake: 100 },
        { id: 2, userId: 20, outcomeKey: "YES", stake: 300 },
        { id: 3, userId: 30, outcomeKey: "NO", stake: 600 },
      ],
      winningOutcomeKey: "YES",
      creatorUserId: 999,
    });
    expect(result.kind).toBe("paid");
    if (result.kind !== "paid") throw new Error();
    expect(result.payouts).toEqual([
      { userId: 10, wagerId: 1, amount: 250 },
      { userId: 20, wagerId: 2, amount: 750 },
    ]);
    expect(result.creatorTip).toBe(0);
    expect(result.totalPool).toBe(1000);
    expect(result.winningPool).toBe(400);
  });
});

describe("computeParimutuelPayouts — rounding", () => {
  it("credits the rounding remainder to the bet creator", () => {
    const result = computeParimutuelPayouts({
      wagers: [
        { id: 1, userId: 10, outcomeKey: "YES", stake: 1 },
        { id: 2, userId: 20, outcomeKey: "YES", stake: 1 },
        { id: 3, userId: 30, outcomeKey: "YES", stake: 1 },
        { id: 4, userId: 40, outcomeKey: "NO", stake: 7 },
      ],
      winningOutcomeKey: "YES",
      creatorUserId: 999,
    });
    expect(result.kind).toBe("paid");
    if (result.kind !== "paid") throw new Error();
    expect(result.payouts).toEqual([
      { userId: 10, wagerId: 1, amount: 3 },
      { userId: 20, wagerId: 2, amount: 3 },
      { userId: 30, wagerId: 3, amount: 3 },
    ]);
    expect(result.creatorTip).toBe(1);
  });
});

describe("computeParimutuelPayouts — voids", () => {
  it("voids and refunds when there is a single bettor", () => {
    const r = computeParimutuelPayouts({
      wagers: [{ id: 1, userId: 10, outcomeKey: "YES", stake: 100 }],
      winningOutcomeKey: "YES",
      creatorUserId: 999,
    });
    expect(r.kind).toBe("void");
    if (r.kind !== "void") throw new Error();
    expect(r.reason).toBe("single_bettor");
    expect(r.refunds).toEqual([{ wagerId: 1, userId: 10, amount: 100 }]);
  });

  it("voids and refunds when no one bet on the winning side", () => {
    const r = computeParimutuelPayouts({
      wagers: [
        { id: 1, userId: 10, outcomeKey: "NO", stake: 50 },
        { id: 2, userId: 20, outcomeKey: "NO", stake: 50 },
      ],
      winningOutcomeKey: "YES",
      creatorUserId: 999,
    });
    expect(r.kind).toBe("void");
    if (r.kind !== "void") throw new Error();
    expect(r.reason).toBe("no_winners");
    expect(r.refunds).toEqual([
      { wagerId: 1, userId: 10, amount: 50 },
      { wagerId: 2, userId: 20, amount: 50 },
    ]);
  });

  it("voids with no_bettors when wagers is empty", () => {
    const r = computeParimutuelPayouts({ wagers: [], winningOutcomeKey: "YES", creatorUserId: 999 });
    expect(r.kind).toBe("void");
    if (r.kind !== "void") throw new Error();
    expect(r.reason).toBe("no_bettors");
    expect(r.refunds).toEqual([]);
  });
});

describe("computeParimutuelPayouts — everyone-wins", () => {
  it("returns stake-back when everyone bet the winning outcome", () => {
    const r = computeParimutuelPayouts({
      wagers: [
        { id: 1, userId: 10, outcomeKey: "YES", stake: 100 },
        { id: 2, userId: 20, outcomeKey: "YES", stake: 200 },
        { id: 3, userId: 30, outcomeKey: "YES", stake: 300 },
      ],
      winningOutcomeKey: "YES",
      creatorUserId: 999,
    });
    expect(r.kind).toBe("paid");
    if (r.kind !== "paid") throw new Error();
    expect(r.payouts).toEqual([
      { userId: 10, wagerId: 1, amount: 100 },
      { userId: 20, wagerId: 2, amount: 200 },
      { userId: 30, wagerId: 3, amount: 300 },
    ]);
    expect(r.creatorTip).toBe(0);
  });
});

describe("computeGifChallengePayout", () => {
  it("pays the pool to the winning submitter", () => {
    const r = computeGifChallengePayout({
      submissions: [
        { id: 1, userId: 10, voteCount: 3 },
        { id: 2, userId: 20, voteCount: 1 },
        { id: 3, userId: 30, voteCount: 1 },
      ],
      entryFee: 50,
    });
    expect(r.kind).toBe("paid");
    if (r.kind !== "paid") throw new Error();
    expect(r.winningSubmissionId).toBe(1);
    expect(r.winnerUserId).toBe(10);
    expect(r.payout).toBe(150);
  });

  it("voids when no submissions", () => {
    const r = computeGifChallengePayout({ submissions: [], entryFee: 50 });
    expect(r.kind).toBe("void");
    if (r.kind !== "void") throw new Error();
    expect(r.reason).toBe("no_submissions");
  });

  it("voids when no votes were cast", () => {
    const r = computeGifChallengePayout({
      submissions: [
        { id: 1, userId: 10, voteCount: 0 },
        { id: 2, userId: 20, voteCount: 0 },
      ],
      entryFee: 50,
    });
    expect(r.kind).toBe("void");
    if (r.kind !== "void") throw new Error();
    expect(r.reason).toBe("no_votes");
    expect(r.refundUserIds).toEqual([10, 20]);
  });

  it("voids on tie for first", () => {
    const r = computeGifChallengePayout({
      submissions: [
        { id: 1, userId: 10, voteCount: 2 },
        { id: 2, userId: 20, voteCount: 2 },
        { id: 3, userId: 30, voteCount: 1 },
      ],
      entryFee: 50,
    });
    expect(r.kind).toBe("void");
    if (r.kind !== "void") throw new Error();
    expect(r.reason).toBe("tie");
    expect(r.refundUserIds).toEqual([10, 20, 30]);
  });
});
