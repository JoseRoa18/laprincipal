import { describe, expect, it } from "vitest";
import { priceMargin, suggestTechPrice } from "./pricing";

describe("suggestTechPrice", () => {
  it("applies the markdown percentage and rounds to cents", () => {
    expect(suggestTechPrice("12.50", 10).toFixed(2)).toBe("11.25");
    expect(suggestTechPrice("9.99", 15).toFixed(2)).toBe("8.49");
    expect(suggestTechPrice(100, 0).toFixed(2)).toBe("100.00");
  });

  it("returns zero for empty prices or absurd markdowns", () => {
    expect(suggestTechPrice("", 10).isZero()).toBe(true);
    expect(suggestTechPrice(10, 100).isZero()).toBe(true);
  });
});

describe("priceMargin", () => {
  it("computes the margin over price and flags prices below cost", () => {
    expect(priceMargin("20", "13").marginPct?.toFixed(1)).toBe("35.0");
    expect(priceMargin("20", "13").belowCost).toBe(false);
    expect(priceMargin("10", "12").belowCost).toBe(true);
    expect(priceMargin("10", "").marginPct).toBeNull();
  });
});
