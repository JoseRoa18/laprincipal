import { describe, expect, it } from "vitest";
import { computePaymentState, remainingIn } from "./payments";

const rates = { VES: "36.50", COP: "4100" };
const USD = { code: "USD", symbol: "$", decimals: 2, cashRounding: "0.01", isBase: true };
const COP = { code: "COP", symbol: "COP", decimals: 0, cashRounding: "100", isBase: false };

describe("computePaymentState", () => {
  it("reports remaining amount when underpaid", () => {
    const s = computePaymentState("25", [{ key: "1", paymentMethodId: "pm", currencyCode: "USD", amount: "10" }], rates, [USD, COP]);
    expect(s.paidUsd.toFixed(2)).toBe("10.00");
    expect(s.remainingUsd.toFixed(2)).toBe("15.00");
    expect(s.changeUsd.toFixed(2)).toBe("0.00");
    expect(s.isPaid).toBe(false);
    expect(remainingIn(s.remainingUsd, "VES", rates, 2).toFixed(2)).toBe("547.50");
    expect(remainingIn(s.remainingUsd, "COP", rates, 0).toFixed(0)).toBe("61500");
  });

  it("accepts mixed payments in three currencies", () => {
    const s = computePaymentState(
      "25",
      [
        { key: "1", paymentMethodId: "pm", currencyCode: "USD", amount: "10" },
        { key: "2", paymentMethodId: "pm", currencyCode: "VES", amount: "365" }, // 10 USD
        { key: "3", paymentMethodId: "pm", currencyCode: "COP", amount: "20500" }, // 5 USD
      ],
      rates,
      [USD, COP],
    );
    expect(s.paidUsd.toFixed(2)).toBe("25.00");
    expect(s.isPaid).toBe(true);
    expect(s.changeUsd.toFixed(2)).toBe("0.00");
  });

  it("computes change in cash currencies with cash rounding", () => {
    const s = computePaymentState("7.5", [{ key: "1", paymentMethodId: "pm", currencyCode: "USD", amount: "10" }], rates, [USD, COP]);
    expect(s.changeUsd.toFixed(2)).toBe("2.50");
    const usd = s.changeOptions.find((o) => o.key === "USD")!;
    const cop = s.changeOptions.find((o) => o.key === "COP")!;
    expect(usd.parts[0].amount.toFixed(2)).toBe("2.50");
    // 2.5 × 4100 = 10250 → rounded to 100 → 10300
    expect(cop.parts[0].amount.toFixed(0)).toBe("10300");
  });

  it("offers whole dollars plus the cents in pesos first", () => {
    const parts = (total: string, paid: string) => {
      const s = computePaymentState(total, [{ key: "1", paymentMethodId: "pm", currencyCode: "USD", amount: paid }], { COP: "4000" }, [USD, COP]);
      expect(s.changeOptions[0].key).toBe("USD+COP");
      return s.changeOptions[0].parts.map((p) => `${p.currency.code} ${p.amount.toFixed(p.currency.decimals)}`);
    };
    // $4.63 change: $4 + 0.63 × 4000 = 2520 → nearest hundred 2500.
    expect(parts("15.37", "20")).toEqual(["USD 4.00", "COP 2500"]);
    // 0.37 × 4000 = 1480 → 1500.
    expect(parts("4.63", "10")).toEqual(["USD 5.00", "COP 1500"]);
    // Under a dollar: only pesos. 0.43 × 4000 = 1720 → 1700.
    expect(parts("9.57", "10")).toEqual(["COP 1700"]);
    // 0.03 × 4000 = 120 → never less than 200 pesos.
    expect(parts("9.97", "10")).toEqual(["COP 200"]);
  });

  it("skips the mixed option for whole dollars, without a peso rate, and honours the minimum setting", () => {
    const whole = computePaymentState("8", [{ key: "1", paymentMethodId: "pm", currencyCode: "USD", amount: "10" }], rates, [USD, COP]);
    expect(whole.changeOptions.map((o) => o.key)).toEqual(["USD", "COP"]);
    const noRate = computePaymentState("9.5", [{ key: "1", paymentMethodId: "pm", currencyCode: "USD", amount: "10" }], { VES: "36.5" }, [USD]);
    expect(noRate.changeOptions.map((o) => o.key)).toEqual(["USD"]);
    const min = computePaymentState("9.99", [{ key: "1", paymentMethodId: "pm", currencyCode: "USD", amount: "10" }], { COP: "4000" }, [USD, COP], { minCopChange: 500 });
    expect(min.changeOptions[0].parts[0].amount.toFixed(0)).toBe("500");
  });

  it("tolerates half-cent rate rounding", () => {
    // 1 USD in VES at 36.5 → 36.50; paying 36.49 is 0.9997 USD, within tolerance
    const s = computePaymentState("1", [{ key: "1", paymentMethodId: "pm", currencyCode: "VES", amount: "36.49" }], rates, [USD]);
    expect(s.isPaid).toBe(true);
    expect(s.changeUsd.toFixed(2)).toBe("0.00");
  });

  it("rejects non-positive payments", () => {
    expect(() =>
      computePaymentState("1", [{ key: "1", paymentMethodId: "pm", currencyCode: "USD", amount: "0" }], rates, [USD]),
    ).toThrow();
  });
});
