import Decimal from "decimal.js";
import { D, roundTo, sum, type Num } from "@/lib/money";

/**
 * Pure cash-session math. No database, no React.
 *
 * Expected cash per currency =
 *   opening + cash payments - change given - cash refunds + movements in - movements out
 *
 * "Cash" means payments/refunds whose method counts in the drawer.
 */

export type PaymentKind = "cash" | "mobile_payment" | "card_terminal" | "transfer" | "crypto";

export interface OpeningInput {
  currencyCode: string;
  openingAmount: Num;
}

export interface PaymentInput {
  paymentMethodId: string;
  methodCode: string;
  methodName: string;
  methodKind: PaymentKind;
  countsInDrawer: boolean;
  currencyCode: string;
  /** Amount in the payment currency. */
  amount: Num;
  amountUsd: Num;
  reference?: string | null;
  saleId: string;
  saleNumber?: string | null;
  createdAt?: Date | string | null;
}

export interface ChangeInput {
  currencyCode: string | null;
  amount: Num;
}

export interface RefundInput {
  refundMethodId: string | null;
  methodCode?: string | null;
  methodName?: string | null;
  countsInDrawer: boolean;
  currencyCode: string | null;
  amount: Num;
  amountUsd: Num;
  returnId: string;
  returnNumber?: string | null;
}

export interface MovementInput {
  type: "in" | "out";
  currencyCode: string;
  amount: Num;
}

export interface SummaryInput {
  openings: OpeningInput[];
  payments: PaymentInput[];
  changes: ChangeInput[];
  refunds: RefundInput[];
  movements: MovementInput[];
}

/** Per cash currency. Amounts as strings with 4 decimals (ready for numeric columns). */
export interface CurrencyBalance {
  currencyCode: string;
  opening: string;
  salesCash: string;
  changeGiven: string;
  refundsCash: string;
  movementsIn: string;
  movementsOut: string;
  expected: string;
}

/** Per payment method (one method has one currency). */
export interface MethodTotal {
  paymentMethodId: string;
  code: string;
  name: string;
  kind: PaymentKind;
  currencyCode: string;
  countsInDrawer: boolean;
  count: number;
  amount: string;
  amountUsd: string;
  refundsCount: number;
  refundsAmount: string;
  refundsAmountUsd: string;
}

export interface SessionTotals {
  /** Distinct sales with at least one payment. */
  salesCount: number;
  paymentsUsd: string;
  refundsCount: number;
  refundsUsd: string;
  /** paymentsUsd - refundsUsd */
  netUsd: string;
  movementsInCount: number;
  movementsOutCount: number;
}

export interface SessionSummaryComputed {
  balances: CurrencyBalance[];
  methods: MethodTotal[];
  totals: SessionTotals;
}

export interface ClosingBalance extends CurrencyBalance {
  counted: string;
  difference: string;
  justification: string | null;
}

export interface ClosingReference {
  paymentMethodId: string;
  methodName: string;
  currencyCode: string;
  amount: string;
  amountUsd: string;
  reference: string | null;
  saleNumber: string | null;
  /** ISO timestamp of the payment. */
  at: string | null;
}

/** Snapshot stored in `cash_sessions.closing_summary` when the drawer is closed. */
export interface ClosingSummary {
  version: 1;
  closedAt: string;
  balances: ClosingBalance[];
  methods: MethodTotal[];
  totals: SessionTotals;
  counts: {
    /** currency -> bill -> number of bills, from the counting helper. */
    denominations: Record<string, Record<string, number>>;
    /** payment method id -> reconciled checkbox at close. */
    reconciled: Record<string, boolean>;
  };
  /** Electronic payments with their references, for reconciliation. */
  references: ClosingReference[];
}

const fmt = (v: Decimal | Num) => roundTo(v, 4).toFixed(4);

/** Expected cash for each opening currency (order preserved from `openings`). */
export function computeCurrencyBalances(input: SummaryInput): CurrencyBalance[] {
  return input.openings.map((o) => {
    const code = o.currencyCode;
    const salesCash = sum(input.payments.filter((p) => p.countsInDrawer && p.currencyCode === code).map((p) => p.amount));
    const changeGiven = sum(input.changes.filter((c) => c.currencyCode === code).map((c) => c.amount));
    const refundsCash = sum(input.refunds.filter((r) => r.countsInDrawer && r.currencyCode === code).map((r) => r.amount));
    const movementsIn = sum(input.movements.filter((m) => m.type === "in" && m.currencyCode === code).map((m) => m.amount));
    const movementsOut = sum(input.movements.filter((m) => m.type === "out" && m.currencyCode === code).map((m) => m.amount));
    const expected = D(o.openingAmount).plus(salesCash).minus(changeGiven).minus(refundsCash).plus(movementsIn).minus(movementsOut);
    return {
      currencyCode: code,
      opening: fmt(o.openingAmount),
      salesCash: fmt(salesCash),
      changeGiven: fmt(changeGiven),
      refundsCash: fmt(refundsCash),
      movementsIn: fmt(movementsIn),
      movementsOut: fmt(movementsOut),
      expected: fmt(expected),
    };
  });
}

type MethodSeed = Omit<MethodTotal, "count" | "amount" | "amountUsd" | "refundsCount" | "refundsAmount" | "refundsAmountUsd">;
type MethodAcc = MethodSeed & { count: number; refundsCount: number; amount: Decimal; amountUsd: Decimal; refundsAmount: Decimal; refundsAmountUsd: Decimal };

/** Totals per payment method, including refunds paid back through that method. */
export function computeMethodTotals(payments: PaymentInput[], refunds: RefundInput[]): MethodTotal[] {
  const map = new Map<string, MethodAcc>();

  const ensure = (key: string, seed: MethodSeed): MethodAcc => {
    let row = map.get(key);
    if (!row) {
      row = { ...seed, count: 0, refundsCount: 0, amount: D(0), amountUsd: D(0), refundsAmount: D(0), refundsAmountUsd: D(0) };
      map.set(key, row);
    }
    return row;
  };

  for (const p of payments) {
    const row = ensure(p.paymentMethodId, {
      paymentMethodId: p.paymentMethodId,
      code: p.methodCode,
      name: p.methodName,
      kind: p.methodKind,
      currencyCode: p.currencyCode,
      countsInDrawer: p.countsInDrawer,
    });
    row.count += 1;
    row.amount = row.amount.plus(D(p.amount));
    row.amountUsd = row.amountUsd.plus(D(p.amountUsd));
  }

  for (const r of refunds) {
    if (!r.refundMethodId) continue;
    const row = ensure(r.refundMethodId, {
      paymentMethodId: r.refundMethodId,
      code: r.methodCode ?? "",
      name: r.methodName ?? "",
      kind: r.countsInDrawer ? "cash" : "transfer",
      currencyCode: r.currencyCode ?? "USD",
      countsInDrawer: r.countsInDrawer,
    });
    row.refundsCount += 1;
    row.refundsAmount = row.refundsAmount.plus(D(r.amount));
    row.refundsAmountUsd = row.refundsAmountUsd.plus(D(r.amountUsd));
  }

  return [...map.values()].map((row) => ({
    ...row,
    amount: fmt(row.amount),
    amountUsd: fmt(row.amountUsd),
    refundsAmount: fmt(row.refundsAmount),
    refundsAmountUsd: fmt(row.refundsAmountUsd),
  }));
}

export function computeTotals(input: SummaryInput): SessionTotals {
  const paymentsUsd = sum(input.payments.map((p) => p.amountUsd));
  const refundsUsd = sum(input.refunds.map((r) => r.amountUsd));
  return {
    salesCount: new Set(input.payments.map((p) => p.saleId)).size,
    paymentsUsd: fmt(paymentsUsd),
    refundsCount: new Set(input.refunds.map((r) => r.returnId)).size,
    refundsUsd: fmt(refundsUsd),
    netUsd: fmt(paymentsUsd.minus(refundsUsd)),
    movementsInCount: input.movements.filter((m) => m.type === "in").length,
    movementsOutCount: input.movements.filter((m) => m.type === "out").length,
  };
}

export function summarizeSession(input: SummaryInput): SessionSummaryComputed {
  return {
    balances: computeCurrencyBalances(input),
    methods: computeMethodTotals(input.payments, input.refunds),
    totals: computeTotals(input),
  };
}

/** counted - expected, 4 decimals. */
export function computeDifference(expected: Num, counted: Num): string {
  return fmt(D(counted).minus(D(expected)));
}

/** Any currency with a non-zero difference needs a written justification. */
export function needsJustification(differences: Num[]): boolean {
  return differences.some((d) => !D(d).isZero());
}
