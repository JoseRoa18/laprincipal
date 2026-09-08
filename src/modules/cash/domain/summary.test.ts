import { describe, expect, it } from "vitest";
import { denominationsFor, sumDenominations } from "./denominations";
import {
  computeCurrencyBalances,
  computeDifference,
  computeMethodTotals,
  computeTotals,
  needsJustification,
  summarizeSession,
  type PaymentInput,
  type RefundInput,
  type SummaryInput,
} from "./summary";

const cashUsd = { paymentMethodId: "m-cash-usd", methodCode: "CASH_USD", methodName: "Efectivo USD", methodKind: "cash" as const, countsInDrawer: true, currencyCode: "USD" };
const cashCop = { paymentMethodId: "m-cash-cop", methodCode: "CASH_COP", methodName: "Efectivo COP", methodKind: "cash" as const, countsInDrawer: true, currencyCode: "COP" };
const zelle = { paymentMethodId: "m-zelle", methodCode: "ZELLE", methodName: "Zelle", methodKind: "transfer" as const, countsInDrawer: false, currencyCode: "USD" };
const pagoMovil = { paymentMethodId: "m-pm", methodCode: "PAGO_MOVIL", methodName: "Pago Movil", methodKind: "mobile_payment" as const, countsInDrawer: false, currencyCode: "VES" };

function fixture(): SummaryInput {
  const payments: PaymentInput[] = [
    { ...cashUsd, amount: "20", amountUsd: "20", saleId: "s1", saleNumber: "V-000001" },
    { ...cashUsd, amount: "5.5", amountUsd: "5.5", saleId: "s2", saleNumber: "V-000002" },
    { ...cashCop, amount: "40000", amountUsd: "10", saleId: "s2", saleNumber: "V-000002" },
    { ...zelle, amount: "15", amountUsd: "15", reference: "Z-123", saleId: "s3", saleNumber: "V-000003" },
    { ...pagoMovil, amount: "3600", amountUsd: "100", reference: "PM-77", saleId: "s4", saleNumber: "V-000004" },
  ];
  const refunds: RefundInput[] = [
    { refundMethodId: "m-cash-usd", methodCode: "CASH_USD", methodName: "Efectivo USD", countsInDrawer: true, currencyCode: "USD", amount: "2", amountUsd: "2", returnId: "r1" },
    { refundMethodId: "m-zelle", methodCode: "ZELLE", methodName: "Zelle", countsInDrawer: false, currencyCode: "USD", amount: "4", amountUsd: "4", returnId: "r2" },
  ];
  return {
    openings: [
      { currencyCode: "USD", openingAmount: "50" },
      { currencyCode: "COP", openingAmount: "100000" },
    ],
    payments,
    changes: [
      { currencyCode: "USD", amount: "0.5" },
      { currencyCode: "COP", amount: "4000" },
      { currencyCode: null, amount: "0" },
    ],
    refunds,
    movements: [
      { type: "in", currencyCode: "USD", amount: "10" },
      { type: "out", currencyCode: "USD", amount: "30" },
      { type: "out", currencyCode: "COP", amount: "20000" },
    ],
  };
}

describe("computeCurrencyBalances", () => {
  it("expected = opening + cash sales - change - cash refunds + in - out, per currency", () => {
    const [usd, cop] = computeCurrencyBalances(fixture());
    expect(usd.currencyCode).toBe("USD");
    expect(usd.opening).toBe("50.0000");
    expect(usd.salesCash).toBe("25.5000");
    expect(usd.changeGiven).toBe("0.5000");
    expect(usd.refundsCash).toBe("2.0000");
    expect(usd.movementsIn).toBe("10.0000");
    expect(usd.movementsOut).toBe("30.0000");
    // 50 + 25.5 - 0.5 - 2 + 10 - 30
    expect(usd.expected).toBe("53.0000");

    expect(cop.currencyCode).toBe("COP");
    expect(cop.salesCash).toBe("40000.0000");
    expect(cop.changeGiven).toBe("4000.0000");
    expect(cop.refundsCash).toBe("0.0000");
    expect(cop.movementsOut).toBe("20000.0000");
    // 100000 + 40000 - 4000 - 0 + 0 - 20000
    expect(cop.expected).toBe("116000.0000");
  });

  it("ignores electronic payments and refunds for the drawer", () => {
    const input = fixture();
    input.payments = input.payments.filter((p) => !p.countsInDrawer);
    input.refunds = input.refunds.filter((r) => !r.countsInDrawer);
    const [usd] = computeCurrencyBalances(input);
    expect(usd.salesCash).toBe("0.0000");
    expect(usd.refundsCash).toBe("0.0000");
    expect(usd.expected).toBe("29.5000"); // 50 - 0.5 + 10 - 30
  });

  it("with nothing sold the expected equals the opening", () => {
    const [usd] = computeCurrencyBalances({ openings: [{ currencyCode: "USD", openingAmount: "12.34" }], payments: [], changes: [], refunds: [], movements: [] });
    expect(usd.expected).toBe("12.3400");
  });
});

describe("computeMethodTotals", () => {
  it("groups payments and refunds by method", () => {
    const rows = computeMethodTotals(fixture().payments, fixture().refunds);
    const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));
    expect(byCode.CASH_USD.count).toBe(2);
    expect(byCode.CASH_USD.amount).toBe("25.5000");
    expect(byCode.CASH_USD.amountUsd).toBe("25.5000");
    expect(byCode.CASH_USD.refundsCount).toBe(1);
    expect(byCode.CASH_USD.refundsAmount).toBe("2.0000");
    expect(byCode.CASH_COP.amount).toBe("40000.0000");
    expect(byCode.CASH_COP.amountUsd).toBe("10.0000");
    expect(byCode.ZELLE.amount).toBe("15.0000");
    expect(byCode.ZELLE.refundsAmountUsd).toBe("4.0000");
    expect(byCode.PAGO_MOVIL.currencyCode).toBe("VES");
    expect(byCode.PAGO_MOVIL.amount).toBe("3600.0000");
    expect(byCode.PAGO_MOVIL.amountUsd).toBe("100.0000");
  });

  it("a method used only for refunds still appears", () => {
    const rows = computeMethodTotals([], [{ refundMethodId: "m-x", methodCode: "X", methodName: "X", countsInDrawer: false, currencyCode: "USD", amount: "3", amountUsd: "3", returnId: "r" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(0);
    expect(rows[0].refundsCount).toBe(1);
  });
});

describe("computeTotals / summarizeSession", () => {
  it("counts distinct sales and nets refunds in USD", () => {
    const t = computeTotals(fixture());
    expect(t.salesCount).toBe(4);
    expect(t.paymentsUsd).toBe("150.5000");
    expect(t.refundsCount).toBe(2);
    expect(t.refundsUsd).toBe("6.0000");
    expect(t.netUsd).toBe("144.5000");
    expect(t.movementsInCount).toBe(1);
    expect(t.movementsOutCount).toBe(2);
  });

  it("summarizeSession bundles everything", () => {
    const s = summarizeSession(fixture());
    expect(s.balances).toHaveLength(2);
    expect(s.methods.length).toBe(4);
    expect(s.totals.netUsd).toBe("144.5000");
  });
});

describe("differences", () => {
  it("difference is counted - expected", () => {
    expect(computeDifference("53", "50")).toBe("-3.0000");
    expect(computeDifference("53", "53.0000")).toBe("0.0000");
    expect(computeDifference("100000", "100100")).toBe("100.0000");
  });

  it("needs justification only when some difference is not zero", () => {
    expect(needsJustification(["0", "0.0000"])).toBe(false);
    expect(needsJustification(["0", "-0.01"])).toBe(true);
  });
});

describe("denominations", () => {
  it("sums bills x counts and ignores bad counts", () => {
    expect(sumDenominations({ "100": 2, "20": 1, "5": 0 })).toBe("220.0000");
    expect(sumDenominations({ "50000": 3, "2000": "abc", "5000": -1, "1000": 1.5, "10000": "" })).toBe("150000.0000");
    expect(sumDenominations({})).toBe("0.0000");
  });

  it("knows USD and COP bills", () => {
    expect(denominationsFor("USD")).toEqual([1, 5, 10, 20, 50, 100]);
    expect(denominationsFor("COP")).toEqual([2000, 5000, 10000, 20000, 50000, 100000]);
    expect(denominationsFor("VES")).toEqual([]);
  });
});
