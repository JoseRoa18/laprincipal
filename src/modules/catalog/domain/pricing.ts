import type Decimal from "decimal.js";
import { D, marginPct, roundTo, ZERO, type Num } from "@/lib/money";

/** Like D() but tolerant of blank form strings ("" → 0). */
export function toDecimal(value: Num): Decimal {
  if (typeof value === "string" && value.trim() === "") return ZERO;
  try {
    return D(value);
  } catch {
    return ZERO;
  }
}

/** Technician price suggested from the public price: public × (1 − markdown %). */
export function suggestTechPrice(publicPriceUsd: Num, markdownPct: Num): Decimal {
  const price = toDecimal(publicPriceUsd);
  if (price.lte(0)) return ZERO;
  const pct = toDecimal(markdownPct);
  if (pct.lte(0)) return roundTo(price, 2);
  if (pct.gte(100)) return ZERO;
  return roundTo(price.mul(D(1).minus(pct.div(100))), 2);
}

export interface MarginInfo {
  /** Gross margin over price, in percent (null when price or cost is missing). */
  marginPct: Decimal | null;
  belowCost: boolean;
}

export function priceMargin(priceUsd: Num, costUsd: Num): MarginInfo {
  const price = toDecimal(priceUsd);
  const cost = toDecimal(costUsd);
  if (price.lte(0) || cost.lte(0)) return { marginPct: null, belowCost: false };
  return { marginPct: roundTo(marginPct(price, cost), 1), belowCost: price.lt(cost) };
}
