import { describe, expect, it } from "vitest";
import { computeLine, computeTotals, effectiveDiscountPct } from "./pricing";

describe("computeLine", () => {
  it("splits IVA included in the price", () => {
    const l = computeLine({ key: "a", quantity: 2, unitPriceUsd: "11.60", taxRate: "0.16" });
    expect(l.grossUsd.toFixed(2)).toBe("23.20");
    expect(l.lineTotalUsd.toFixed(2)).toBe("23.20");
    expect(l.baseUsd.toFixed(2)).toBe("20.00");
    expect(l.taxUsd.toFixed(2)).toBe("3.20");
  });

  it("applies a percentage discount", () => {
    const l = computeLine({ key: "a", quantity: 1, unitPriceUsd: "100", taxRate: "0.16", discountType: "pct", discountValue: 10 });
    expect(l.discountUsd.toFixed(2)).toBe("10.00");
    expect(l.lineTotalUsd.toFixed(2)).toBe("90.00");
  });

  it("caps an amount discount at the gross", () => {
    const l = computeLine({ key: "a", quantity: 1, unitPriceUsd: "5", taxRate: "0", discountType: "amount", discountValue: 9 });
    expect(l.discountUsd.toFixed(2)).toBe("5.00");
    expect(l.lineTotalUsd.toFixed(2)).toBe("0.00");
  });

  it("handles decimal quantities (bulk items)", () => {
    const l = computeLine({ key: "a", quantity: "1.250", unitPriceUsd: "3.333", taxRate: "0.16" });
    expect(l.grossUsd.toFixed(2)).toBe("4.17");
  });

  it("rejects zero quantity", () => {
    expect(() => computeLine({ key: "a", quantity: 0, unitPriceUsd: 1, taxRate: 0 })).toThrow();
  });
});

describe("computeTotals", () => {
  it("sums lines and exposes tax", () => {
    const t = computeTotals([
      { key: "a", quantity: 1, unitPriceUsd: "11.60", taxRate: "0.16" },
      { key: "b", quantity: 3, unitPriceUsd: "2.00", taxRate: "0" },
    ]);
    expect(t.subtotalUsd.toFixed(2)).toBe("17.60");
    expect(t.discountUsd.toFixed(2)).toBe("0.00");
    expect(t.taxUsd.toFixed(2)).toBe("1.60");
    expect(t.totalUsd.toFixed(2)).toBe("17.60");
  });

  it("prorates a global discount so lines add up exactly", () => {
    const t = computeTotals(
      [
        { key: "a", quantity: 1, unitPriceUsd: "10", taxRate: "0.16" },
        { key: "b", quantity: 1, unitPriceUsd: "10", taxRate: "0.16" },
        { key: "c", quantity: 1, unitPriceUsd: "10", taxRate: "0.16" },
      ],
      { type: "amount", value: "1" },
    );
    expect(t.discountUsd.toFixed(2)).toBe("1.00");
    expect(t.totalUsd.toFixed(2)).toBe("29.00");
    const sumLines = t.lines.reduce((acc, l) => acc.plus(l.lineTotalUsd), t.lines[0].lineTotalUsd.minus(t.lines[0].lineTotalUsd));
    expect(sumLines.toFixed(2)).toBe("29.00");
    // 0.33 + 0.33 + 0.34
    expect(t.lines.map((l) => l.discountUsd.toFixed(2))).toEqual(["0.33", "0.33", "0.34"]);
  });

  it("applies a global percentage discount on top of line discounts", () => {
    const t = computeTotals(
      [{ key: "a", quantity: 2, unitPriceUsd: "50", taxRate: "0.16", discountType: "pct", discountValue: 10 }],
      { type: "pct", value: 5 },
    );
    // gross 100, line discount 10 → 90, global 5 % of 90 = 4.50 → 85.50
    expect(t.subtotalUsd.toFixed(2)).toBe("100.00");
    expect(t.discountUsd.toFixed(2)).toBe("14.50");
    expect(t.totalUsd.toFixed(2)).toBe("85.50");
  });

  it("never discounts below zero", () => {
    const t = computeTotals([{ key: "a", quantity: 1, unitPriceUsd: "10", taxRate: "0" }], { type: "amount", value: 50 });
    expect(t.totalUsd.toFixed(2)).toBe("0.00");
  });

  it("computes the effective discount percentage", () => {
    expect(effectiveDiscountPct("100", "14.5").toFixed(1)).toBe("14.5");
    expect(effectiveDiscountPct("0", "0").toFixed(1)).toBe("0.0");
  });
});
