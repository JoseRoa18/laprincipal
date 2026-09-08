import type Decimal from "decimal.js";
import { D, roundTo, roundToStep, type Num } from "@/lib/money";

export interface CurrencyInfo {
  code: string;
  symbol: string;
  decimals: number;
  /** Cash rounding step (100 for COP, 0.01 for USD). */
  cashRounding: Num;
  isBase: boolean;
}

/** Units of each currency per 1 USD. USD is always 1. */
export type RateSet = Record<string, Num>;

export const BASE_CURRENCY = "USD";

export function rateFor(code: string, rates: RateSet): Decimal {
  if (code === BASE_CURRENCY) return D(1);
  const r = rates[code];
  if (r === undefined || r === null || D(r).lte(0)) {
    throw new Error(`No hay tasa de cambio para ${code}`);
  }
  return D(r);
}

/** Convert a USD amount to another currency, rounded to its decimals. */
export function fromUsd(amountUsd: Num, code: string, rates: RateSet, decimals = 2): Decimal {
  return roundTo(D(amountUsd).mul(rateFor(code, rates)), decimals);
}

/** Convert an amount in `code` to USD with 4 decimals of precision. */
export function toUsd(amount: Num, code: string, rates: RateSet): Decimal {
  return roundTo(D(amount).div(rateFor(code, rates)), 4);
}

/** Round an amount to the physical cash step of a currency. */
export function toCash(amount: Num, currency: Pick<CurrencyInfo, "cashRounding" | "decimals">): Decimal {
  const step = D(currency.cashRounding);
  const rounded = step.gt(0) ? roundToStep(amount, step) : D(amount);
  return roundTo(rounded, currency.decimals);
}

/** All three amounts for display: { USD, VES, COP }. Missing rates are omitted. */
export function displayAmounts(amountUsd: Num, rates: RateSet, currencies: CurrencyInfo[]): Record<string, Decimal> {
  const out: Record<string, Decimal> = {};
  for (const c of currencies) {
    if (c.isBase) {
      out[c.code] = roundTo(amountUsd, c.decimals);
      continue;
    }
    const r = rates[c.code];
    if (r === undefined || r === null || D(r).lte(0)) continue;
    out[c.code] = fromUsd(amountUsd, c.code, rates, c.decimals);
  }
  return out;
}
