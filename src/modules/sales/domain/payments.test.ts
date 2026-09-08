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
    const usd = s.changeOptions.find((o) => o.currency.code === "USD")!;
    const cop = s.changeOptions.find((o) => o.currency.code === "COP")!;
    expect(usd.amount.toFixed(2)).toBe("2.50");
    // 2.5 × 4100 = 10250 → rounded to 100 → 10300
    expect(cop.amount.toFixed(0)).toBe("10300");
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
