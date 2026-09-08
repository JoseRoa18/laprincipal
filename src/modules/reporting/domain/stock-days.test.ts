import { describe, expect, it } from "vitest";
import { daysWithStock } from "./stock-days";

describe("daysWithStock", () => {
  it("returns zero days without movements or sales", () => {
    const r = daysWithStock([], [], "2026-09-01", "2026-09-08");
    expect(r.daysWithStock).toBe(0);
    expect(r.windowDays).toBe(8);
    expect(r.unitsSold.toNumber()).toBe(0);
    expect(r.dailyUnits).toEqual([]);
  });

  it("uses the last movement before the window as the opening balance", () => {
    const r = daysWithStock(
      [
        { day: "2026-07-01", balanceAfter: 5 },
        { day: "2026-08-20", balanceAfter: 0 },
        { day: "2026-08-25", balanceAfter: 12 }, // last one before the window
      ],
      [],
      "2026-09-01",
      "2026-09-08",
    );
    expect(r.daysWithStock).toBe(8);
    expect(r.dailyUnits.map((d) => d.toNumber())).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("respects window boundaries: a movement on windowStart counts, one after today does not", () => {
    const r = daysWithStock(
      [
        { day: "2026-09-01", balanceAfter: 3 }, // first day of the window
        { day: "2026-09-09", balanceAfter: 0 }, // after today: ignored
      ],
      [],
      "2026-09-01",
      "2026-09-08",
    );
    expect(r.daysWithStock).toBe(8);
  });

  it("stops counting when stock reaches zero mid-window and resumes after a receipt", () => {
    const r = daysWithStock(
      [
        { day: "2026-08-01", balanceAfter: 4 },
        { day: "2026-09-03", balanceAfter: 2 }, // sold 2, still in stock
        { day: "2026-09-03", balanceAfter: 0 }, // sold the last 2 the same day
        { day: "2026-09-07", balanceAfter: 10 }, // purchase received
      ],
      [
        { day: "2026-09-03", units: 4 },
        { day: "2026-09-08", units: 1 },
      ],
      "2026-09-01",
      "2026-09-08",
    );
    // 1,2 (stock 4) + 3 (sale, closes at 0) + 7,8 (restocked) = 5 days; 4,5,6 had no stock
    expect(r.daysWithStock).toBe(5);
    expect(r.unitsSold.toNumber()).toBe(5);
    expect(r.dailyUnits.map((d) => d.toNumber())).toEqual([0, 0, 4, 0, 1]);
  });

  it("counts a day with sales even when the end-of-day balance is zero or negative", () => {
    const r = daysWithStock(
      [
        { day: "2026-09-02", balanceAfter: 0 }, // sold everything on the 2nd
        { day: "2026-09-05", balanceAfter: -1 }, // negative stock allowed by policy
      ],
      [
        { day: "2026-09-02", units: 3 },
        { day: "2026-09-05", units: 1 },
      ],
      "2026-09-01",
      "2026-09-08",
    );
    expect(r.daysWithStock).toBe(2);
    expect(r.unitsSold.toNumber()).toBe(4);
  });

  it("aggregates several sales of the same day and tolerates unsorted movements", () => {
    const r = daysWithStock(
      [
        { day: "2026-09-04", balanceAfter: 6 },
        { day: "2026-08-30", balanceAfter: 8 },
      ],
      [
        { day: "2026-09-04", units: 1 },
        { day: "2026-09-04", units: "1.5" },
      ],
      "2026-09-04",
      "2026-09-04",
    );
    expect(r.daysWithStock).toBe(1);
    expect(r.windowDays).toBe(1);
    expect(r.unitsSold.toFixed(1)).toBe("2.5");
  });
});
