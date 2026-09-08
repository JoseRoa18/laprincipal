import Decimal from "decimal.js";

/**
 * Money and quantity arithmetic. Never use JS floats for amounts.
 * Drizzle returns `numeric` columns as strings; wrap them with D().
 */
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type Num = Decimal.Value | null | undefined;

export const D = (value: Num): Decimal => new Decimal(value ?? 0);

export const ZERO = new Decimal(0);

/** Round to a fixed number of decimals (half up). */
export function roundTo(value: Num, decimals: number): Decimal {
  return D(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

/** Round to the nearest multiple of `step` (e.g. COP cash to 100). */
export function roundToStep(value: Num, step: Num): Decimal {
  const s = D(step);
  if (s.lte(0)) return D(value);
  return D(value).div(s).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(s);
}

/** Serialize for a numeric column with the given scale. */
export function toDb(value: Num, scale = 4): string {
  return roundTo(value, scale).toFixed(scale);
}

export const toMoneyDb = (value: Num) => toDb(value, 4);
export const toQtyDb = (value: Num) => toDb(value, 3);
export const toRateDb = (value: Num) => toDb(value, 6);

export function sum(values: Num[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(D(v)), ZERO);
}

export function isPositive(value: Num): boolean {
  return D(value).gt(0);
}

/**
 * Split a price that includes tax into base and tax parts.
 * priceIncl = base * (1 + rate)
 */
export function splitTaxIncluded(priceIncl: Num, rate: Num) {
  const p = D(priceIncl);
  const r = D(rate);
  const base = p.div(r.plus(1));
  return { base, tax: p.minus(base) };
}

/** Apply tax to a base price. */
export function addTax(base: Num, rate: Num) {
  const b = D(base);
  const tax = b.mul(D(rate));
  return { base: b, tax, total: b.plus(tax) };
}

/** Suggested price from cost and margin percentage (margin over price). */
export function priceFromMargin(cost: Num, marginPct: Num): Decimal {
  const m = D(marginPct).div(100);
  if (m.gte(1)) throw new Error("Margin must be below 100%");
  return D(cost).div(D(1).minus(m));
}

/** Gross margin percentage over price. */
export function marginPct(price: Num, cost: Num): Decimal {
  const p = D(price);
  if (p.isZero()) return ZERO;
  return p.minus(D(cost)).div(p).mul(100);
}
