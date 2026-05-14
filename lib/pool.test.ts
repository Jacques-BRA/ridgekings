import { describe, it, expect } from "vitest";
import { computeParimutuelPayouts } from "./pool";

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
