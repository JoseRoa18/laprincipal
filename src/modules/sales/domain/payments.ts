import Decimal from "decimal.js";
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

export interface ChangeOption {
  currency: CurrencyInfo;
  /** Change amount in that currency, rounded to its cash step. */
  amount: Decimal;
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
): PaymentState {
  const total = D(totalUsd);
  const payments = inputs.map((p) => computePayment(p, rates));
  const paidUsd = roundTo(sum(payments.map((p) => p.amountUsd)), 4);

  const diff = paidUsd.minus(total);
  // Tolerance of half a cent to absorb rate rounding.
  const remainingUsd = diff.lt("-0.005") ? roundTo(diff.abs(), 2) : D(0);
  const changeUsd = diff.gt("0.005") ? roundTo(diff, 2) : D(0);

  const changeOptions: ChangeOption[] = changeUsd.gt(0)
    ? cashCurrencies.map((c) => ({
        currency: c,
        amount: toCash(changeUsd.mul(rateFor(c.code, rates)), c),
      }))
    : [];

  return { payments, paidUsd, remainingUsd, changeUsd, changeOptions, isPaid: remainingUsd.isZero() };
}

/** Amount still owed expressed in a given currency (for the "faltan" hint). */
export function remainingIn(remainingUsd: Num, code: string, rates: RateSet, decimals: number): Decimal {
  return roundTo(D(remainingUsd).mul(rateFor(code, rates)), decimals);
}
