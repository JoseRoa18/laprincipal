import { describe, expect, it } from "vitest";
import { prorateExtraCosts, weightedAverageCost } from "./costing";

describe("weightedAverageCost", () => {
  it("averages successive receipts", () => {
    // 10 @ 5 = 50 ; + 10 @ 7 = 70 → 120 / 20 = 6
    expect(weightedAverageCost(10, 5, 10, 7).toFixed(4)).toBe("6.0000");
    // 20 @ 6 = 120 ; + 5 @ 10 = 50 → 170 / 25 = 6.8
    expect(weightedAverageCost(20, 6, 5, 10).toFixed(4)).toBe("6.8000");
  });

  it("resets to the incoming cost when stock is zero or negative", () => {
    expect(weightedAverageCost(0, 99, 3, 4.5).toFixed(4)).toBe("4.5000");
    expect(weightedAverageCost(-2, 99, 3, 4.5).toFixed(4)).toBe("4.5000");
  });

  it("rejects zero incoming quantity", () => {
    expect(() => weightedAverageCost(1, 1, 0, 1)).toThrow();
  });
});

describe("prorateExtraCosts", () => {
  it("distributes freight by line value and absorbs rounding on the last line", () => {
    const out = prorateExtraCosts(
      [
        { key: "a", quantity: 10, unitCostUsd: "1" }, // 10
        { key: "b", quantity: 1, unitCostUsd: "20" }, // 20
      ],
      "10",
    );
    expect(out[0].extraCostShareUsd.toFixed(4)).toBe("3.3333");
    expect(out[1].extraCostShareUsd.toFixed(4)).toBe("6.6667");
    expect(out[0].unitCostFinalUsd.toFixed(4)).toBe("1.3333");
    expect(out[1].unitCostFinalUsd.toFixed(4)).toBe("26.6667");
  });

  it("returns zero shares without extra costs", () => {
    const out = prorateExtraCosts([{ key: "a", quantity: 2, unitCostUsd: "3" }], 0);
    expect(out[0].extraCostShareUsd.toFixed(4)).toBe("0.0000");
    expect(out[0].unitCostFinalUsd.toFixed(4)).toBe("3.0000");
  });
});
