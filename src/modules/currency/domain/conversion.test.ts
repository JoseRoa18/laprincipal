import { describe, expect, it } from "vitest";
import { displayAmounts, fromUsd, toCash, toUsd } from "./conversion";

const rates = { VES: "36.50", COP: "4100" };

describe("currency conversion", () => {
  it("converts USD to VES and COP with currency decimals", () => {
    expect(fromUsd("10", "VES", rates).toFixed(2)).toBe("365.00");
    expect(fromUsd("10", "COP", rates, 0).toFixed(0)).toBe("41000");
    expect(fromUsd("12.5", "USD", rates).toFixed(2)).toBe("12.50");
  });

  it("converts back to USD with 4 decimals", () => {
    expect(toUsd("365", "VES", rates).toFixed(4)).toBe("10.0000");
    expect(toUsd("41000", "COP", rates).toFixed(4)).toBe("10.0000");
    expect(toUsd("1000", "COP", rates).toFixed(4)).toBe("0.2439");
  });

  it("throws when a rate is missing", () => {
    expect(() => fromUsd("1", "VES", {})).toThrow(/tasa/);
  });

  it("rounds cash to the currency step", () => {
    expect(toCash("41049", { cashRounding: "100", decimals: 0 }).toFixed(0)).toBe("41000");
    expect(toCash("41050", { cashRounding: "100", decimals: 0 }).toFixed(0)).toBe("41100");
    expect(toCash("3.456", { cashRounding: "0.01", decimals: 2 }).toFixed(2)).toBe("3.46");
  });

  it("builds display amounts and skips currencies without rate", () => {
    const out = displayAmounts("7.5", { VES: "36.5" }, [
      { code: "USD", symbol: "$", decimals: 2, cashRounding: "0.01", isBase: true },
      { code: "VES", symbol: "Bs", decimals: 2, cashRounding: "0.01", isBase: false },
      { code: "COP", symbol: "COP", decimals: 0, cashRounding: "100", isBase: false },
    ]);
    expect(out.USD.toFixed(2)).toBe("7.50");
    expect(out.VES.toFixed(2)).toBe("273.75");
    expect(out.COP).toBeUndefined();
  });
});
