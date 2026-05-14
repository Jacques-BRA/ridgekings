import { describe, it, expect } from "vitest";
import { americanOdds, impliedPayoutPer100 } from "./odds";

describe("americanOdds", () => {
  it("returns +inf for an outcome with zero stake", () => {
    expect(americanOdds({ stakeOnOutcome: 0, totalPool: 100 })).toBe("+∞");
  });
  it("returns 'EVEN' when totalPool is 0", () => {
    expect(americanOdds({ stakeOnOutcome: 0, totalPool: 0 })).toBe("EVEN");
  });
  it("returns negative odds for a favored outcome (p > 0.5)", () => {
    // p = 0.75 → -X where X = round(0.75/0.25*100) = -300
    expect(americanOdds({ stakeOnOutcome: 75, totalPool: 100 })).toBe("-300");
  });
  it("returns positive odds for an underdog (p < 0.5)", () => {
    // p = 0.25 → +X where X = round(0.75/0.25*100) = +300
    expect(americanOdds({ stakeOnOutcome: 25, totalPool: 100 })).toBe("+300");
  });
  it("returns +100 / -100 at exactly even", () => {
    expect(americanOdds({ stakeOnOutcome: 50, totalPool: 100 })).toBe("+100");
  });
});

describe("impliedPayoutPer100", () => {
  it("returns the parimutuel ratio for 100 staked", () => {
    // total=1000, winningPool=400 → 100 stake returns 100 * 1000/400 = 250
    expect(impliedPayoutPer100({ stakeOnOutcome: 400, totalPool: 1000 })).toBe(250);
  });
  it("returns 0 when nobody has staked on that outcome", () => {
    expect(impliedPayoutPer100({ stakeOnOutcome: 0, totalPool: 1000 })).toBe(0);
  });
});
