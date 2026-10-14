import Decimal from "decimal.js";
import { formatMoney } from "@/lib/format";
import { D, roundTo, sum, type Num } from "@/lib/money";
import { rateFor, toCash, type CurrencyInfo, type RateSet } from "@/modules/currency/domain/conversion";

export interface PaymentInput {
  key: string;
  paymentMethodId: string;
  currencyCode: string;
  /** Amount in the payment currency. */
  amount: Num;
  reference?: string | null;
  /** Percentage surcharge for the method (IGTF), 0 by default. */
  surchargePct?: Num;
}

export interface ComputedPayment extends PaymentInput {
  amountDec: Decimal;
  exchangeRate: Decimal;
  amountUsd: Decimal;
}

export interface ChangePart {
  currency: CurrencyInfo;
  /** Amount in that currency, rounded to its cash step. */
  amount: Decimal;
}

/**
 * One way to hand the change back: all in one currency ("USD", "COP"...) or
 * "USD+COP", whole dollars plus the cents in pesos (there are no US coins at
 * the counter).
 */
export interface ChangeOption {
  key: string;
  parts: ChangePart[];
}

export const MIXED_CHANGE_KEY = "USD+COP";

/** Smallest amount of pesos handed back when the cents go in pesos (default of `policies.minCopChange`). */
export const DEFAULT_MIN_COP_CHANGE = 200;

/**
 * Whole dollars in USD and the cents in pesos, rounded to the nearest peso
 * cash step (100) and never below `minCop`: $5.37 at 4,000 → $5 + COP 1,500;
 * $0.03 → COP 200. Null when there are no cents or no peso rate.
 */
export function mixedChange(changeUsd: Num, usd: CurrencyInfo, cop: CurrencyInfo, rates: RateSet, minCop: Num = DEFAULT_MIN_COP_CHANGE): ChangeOption | null {
  const change = D(changeUsd);
  const whole = change.floor();
  const cents = change.minus(whole);
  if (cents.lte(0) || !rates[cop.code]) return null;
  let pesos = toCash(cents.mul(rateFor(cop.code, rates)), cop);
  const min = D(minCop ?? DEFAULT_MIN_COP_CHANGE);
  if (pesos.lt(min)) pesos = min;
  return { key: MIXED_CHANGE_KEY, parts: [...(whole.gt(0) ? [{ currency: usd, amount: whole }] : []), { currency: cop, amount: pesos }] };
}

export interface PaymentState {
  payments: ComputedPayment[];
  paidUsd: Decimal;
  /** Still owed, 0 when fully paid. */
  remainingUsd: Decimal;
  /** Overpayment to return, 0 when not overpaid. */
  changeUsd: Decimal;
  /** Change expressed in each cash currency that allows change. */
  changeOptions: ChangeOption[];
  isPaid: boolean;
}

export function computePayment(p: PaymentInput, rates: RateSet): ComputedPayment {
  const amountDec = D(p.amount);
  if (amountDec.lte(0)) throw new Error("El monto del pago debe ser mayor que cero");
  const exchangeRate = rateFor(p.currencyCode, rates);
  const amountUsd = roundTo(amountDec.div(exchangeRate), 4);
  return { ...p, amountDec, exchangeRate, amountUsd };
}

/**
 * Compute paid / remaining / change for a set of payments.
 * `cashCurrencies` are the currencies in which change can be handed back.
 */
export function computePaymentState(
  totalUsd: Num,
  inputs: PaymentInput[],
  rates: RateSet,
  cashCurrencies: CurrencyInfo[],
  opts: { minCopChange?: Num } = {},
): PaymentState {
  const total = D(totalUsd);
  const payments = inputs.map((p) => computePayment(p, rates));
  const paidUsd = roundTo(sum(payments.map((p) => p.amountUsd)), 4);

  const diff = paidUsd.minus(total);
  // Tolerance of half a cent to absorb rate rounding.
  const remainingUsd = diff.lt("-0.005") ? roundTo(diff.abs(), 2) : D(0);
  const changeUsd = diff.gt("0.005") ? roundTo(diff, 2) : D(0);

  const changeOptions: ChangeOption[] = [];
  if (changeUsd.gt(0)) {
    // Dollars plus the cents in pesos comes first: it is how the counter gives change.
    const usd = cashCurrencies.find((c) => c.code === "USD");
    const cop = cashCurrencies.find((c) => c.code === "COP");
    const mixed = usd && cop ? mixedChange(changeUsd, usd, cop, rates, opts.minCopChange) : null;
    if (mixed) changeOptions.push(mixed);
    for (const c of cashCurrencies) {
      changeOptions.push({ key: c.code, parts: [{ currency: c, amount: toCash(changeUsd.mul(rateFor(c.code, rates)), c) }] });
    }
  }

  return { payments, paidUsd, remainingUsd, changeUsd, changeOptions, isPaid: remainingUsd.isZero() };
}

export interface ChangeGiven {
  currencyCode: string;
  amount: string;
}

/** The change as saved on a sale: main part plus the pesos of a split change. */
export function changePartsOf(row: { changeCurrencyCode: string | null; changeAmount: Num; changeExtraCurrencyCode?: string | null; changeExtraAmount?: Num }): ChangeGiven[] {
  const parts: ChangeGiven[] = [];
  if (row.changeCurrencyCode && D(row.changeAmount).gt(0)) parts.push({ currencyCode: row.changeCurrencyCode, amount: D(row.changeAmount).toString() });
  if (row.changeExtraCurrencyCode && D(row.changeExtraAmount ?? 0).gt(0)) parts.push({ currencyCode: row.changeExtraCurrencyCode, amount: D(row.changeExtraAmount!).toString() });
  return parts;
}

/** "$ 5,00 + COP 1.500". */
export function formatChange(parts: ChangeGiven[]): string {
  return parts.map((p) => formatMoney(p.amount, p.currencyCode)).join(" + ");
}

/** Amount still owed expressed in a given currency (for the "faltan" hint). */
export function remainingIn(remainingUsd: Num, code: string, rates: RateSet, decimals: number): Decimal {
  return roundTo(D(remainingUsd).mul(rateFor(code, rates)), decimals);
}
