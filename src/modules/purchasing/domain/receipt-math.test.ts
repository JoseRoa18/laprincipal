import { describe, expect, it } from "vitest";
import { averageAfterVoid, computeReceipt } from "./receipt-math";

describe("computeReceipt", () => {
  it("converts the document currency to USD with 4 decimals and prorates freight", () => {
    // 36.5 Bs per USD. 10 × 365 Bs = 10 USD each; 1 × 730 Bs = 20 USD.
    const r = computeReceipt(
      [
        { key: "a", productId: "a", quantity: "10", unitCostAmount: "365" },
        { key: "b", productId: "b", quantity: "1", unitCostAmount: "730" },
      ],
      "36.5",
      "12",
    );
    expect(r.lines[0].unitCostUsd.toFixed(4)).toBe("10.0000");
    expect(r.lines[1].unitCostUsd.toFixed(4)).toBe("20.0000");
    expect(r.lines[0].lineTotalUsd.toFixed(4)).toBe("100.0000");
    expect(r.subtotalUsd.toFixed(4)).toBe("120.0000");
    expect(r.totalUsd.toFixed(4)).toBe("132.0000");
    // freight 12 split 100:20 → 10 and 2
    expect(r.lines[0].extraCostShareUsd.toFixed(4)).toBe("10.0000");
    expect(r.lines[1].extraCostShareUsd.toFixed(4)).toBe("2.0000");
    expect(r.lines[0].unitCostFinalUsd.toFixed(4)).toBe("11.0000");
    expect(r.lines[1].unitCostFinalUsd.toFixed(4)).toBe("22.0000");
  });

  it("keeps USD receipts unchanged with rate 1 and no extras", () => {
    const r = computeReceipt([{ key: "a", productId: "a", quantity: "3", unitCostAmount: "4.5" }], "1", "0");
    expect(r.lines[0].unitCostUsd.toFixed(4)).toBe("4.5000");
    expect(r.lines[0].unitCostFinalUsd.toFixed(4)).toBe("4.5000");
    expect(r.totalUsd.toFixed(4)).toBe("13.5000");
  });

  it("rounds the converted unit cost to 4 decimals", () => {
    const r = computeReceipt([{ key: "a", productId: "a", quantity: "1", unitCostAmount: "100" }], "3", "0");
    expect(r.lines[0].unitCostUsd.toFixed(4)).toBe("33.3333");
  });

  it("rejects a zero or negative rate", () => {
    expect(() => computeReceipt([], "0", "0")).toThrow();
  });
});

describe("averageAfterVoid", () => {
  it("restores the average that existed before the purchase", () => {
    // 10 @ 5 then bought 10 @ 7 → avg 6 with 20 units. Void the purchase → back to 5.
    expect(averageAfterVoid("6", "20", "7", "10", "5").toFixed(4)).toBe("5.0000");
  });

  it("falls back to the given cost when nothing remains", () => {
    expect(averageAfterVoid("7", "10", "7", "10", "4.25").toFixed(4)).toBe("4.2500");
    expect(averageAfterVoid("7", "8", "7", "10", "4.25").toFixed(4)).toBe("4.2500");
  });

  it("never returns a negative average", () => {
    expect(averageAfterVoid("1", "12", "7", "10", "0").toFixed(4)).toBe("0.0000");
  });
});
