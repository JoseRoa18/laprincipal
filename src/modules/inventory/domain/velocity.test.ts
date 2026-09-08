import { describe, expect, it } from "vitest";
import { D } from "@/lib/money";
import {
  abcClassify,
  daysOfCover,
  reorderPoint,
  safetyStock,
  stdDev,
  stockStatus,
  suggestedQty,
  velocity,
  weightedVelocity,
} from "./velocity";

describe("velocity", () => {
  it("divides units by days with stock, ignoring days without stock", () => {
    expect(velocity(30, 30).toFixed(4)).toBe("1.0000");
    expect(velocity(30, 15).toFixed(4)).toBe("2.0000");
    expect(velocity(30, 0).toFixed(4)).toBe("0.0000");
  });

  it("weights windows and renormalizes when a window has no data", () => {
    const v = weightedVelocity([
      { days: 30, unitsSold: 60, daysWithStock: 30 }, // 2/day
      { days: 60, unitsSold: 60, daysWithStock: 60 }, // 1/day
      { days: 90, unitsSold: 0, daysWithStock: 0 }, // no data
    ]);
    // (2×0.5 + 1×0.3) / 0.8 = 1.625
    expect(v.toFixed(4)).toBe("1.6250");
  });

  it("computes std dev, cover, safety stock and reorder point", () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9]).toFixed(4)).toBe("2.0000");
    expect(daysOfCover(10, 2)!.toFixed(2)).toBe("5.00");
    expect(daysOfCover(10, 0)).toBeNull();
    // z(0.95)=1.645 × σ 2 × √4 = 6.58
    expect(safetyStock(2, 4, 0.95).toFixed(3)).toBe("6.580");
    // 1.5/day × 7 days + 3 = 13.5
    expect(reorderPoint("1.5", 7, 3).toFixed(3)).toBe("13.500");
  });

  it("suggests quantity to reach target cover rounded to pack size", () => {
    // need 2 × 30 − 20 − 0 = 40 → pack 12 → 48
    expect(suggestedQty(2, 30, 20, 0, 12).toFixed(0)).toBe("48");
    expect(suggestedQty(1, 10, 50).toFixed(0)).toBe("0");
  });

  it("classifies ABC by cumulative revenue", () => {
    const cls = abcClassify([
      { id: "a", revenue: 800 },
      { id: "b", revenue: 150 },
      { id: "c", revenue: 40 },
      { id: "d", revenue: 10 },
      { id: "e", revenue: 0 },
    ]);
    expect(cls.get("a")).toBe("A");
    expect(cls.get("b")).toBe("B");
    expect(cls.get("c")).toBe("C");
    expect(cls.get("e")).toBe("C");
  });

  it("derives the traffic-light status", () => {
    expect(stockStatus({ stock: 3, reorderPoint: 5, maxStock: 0, daysOfCover: D(2), hasData: true })).toBe("buy_now");
    expect(stockStatus({ stock: 8, reorderPoint: 5, maxStock: 0, daysOfCover: D(4), hasData: true })).toBe("soon");
    expect(stockStatus({ stock: 20, reorderPoint: 5, maxStock: 0, daysOfCover: D(30), hasData: true })).toBe("ok");
    expect(stockStatus({ stock: 200, reorderPoint: 5, maxStock: 100, daysOfCover: D(300), hasData: true })).toBe("excess");
    expect(stockStatus({ stock: 3, reorderPoint: 5, maxStock: 0, daysOfCover: null, hasData: false })).toBe("buy_now");
    expect(stockStatus({ stock: 3, reorderPoint: 0, maxStock: 0, daysOfCover: null, hasData: false })).toBe("no_data");
  });
});
