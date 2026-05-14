import { describe, it, expect } from "vitest";
import { isoWeekOf } from "./iso-week";

describe("isoWeekOf", () => {
  it("returns the ISO-week key for a known date", () => {
    // 2026-01-01 is a Thursday → ISO week 1 of 2026
    expect(isoWeekOf(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
  });
  it("rolls into the next year correctly", () => {
    // 2025-12-29 is a Monday → ISO week 1 of 2026
    expect(isoWeekOf(new Date("2025-12-29T00:00:00Z"))).toBe("2026-W01");
  });
  it("pads weeks under 10", () => {
    expect(isoWeekOf(new Date("2026-03-02T12:00:00Z"))).toBe("2026-W10");
    expect(isoWeekOf(new Date("2026-02-23T12:00:00Z"))).toBe("2026-W09");
  });
});
