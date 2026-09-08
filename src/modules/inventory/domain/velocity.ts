import Decimal from "decimal.js";
import { D, roundTo, sum, type Num } from "@/lib/money";

export type StockStatus = "buy_now" | "soon" | "ok" | "excess" | "no_data";
export type AbcClass = "A" | "B" | "C";

/** z-scores for common service levels. */
const Z_BY_SERVICE_LEVEL: Array<[number, number]> = [
  [0.99, 2.326],
  [0.98, 2.054],
  [0.95, 1.645],
  [0.9, 1.282],
  [0.85, 1.036],
  [0.8, 0.842],
];

export function zForServiceLevel(level: number): number {
  for (const [lvl, z] of Z_BY_SERVICE_LEVEL) {
    if (level >= lvl) return z;
  }
  return 0.842;
}

/** Units sold per day over the days the product was available. */
export function velocity(unitsSold: Num, daysWithStock: number): Decimal {
  if (daysWithStock <= 0) return D(0);
  return roundTo(D(unitsSold).div(daysWithStock), 4);
}

export interface WindowVelocity {
  days: number;
  unitsSold: Num;
  daysWithStock: number;
}

/**
 * Weighted velocity across windows (default 30/60/90 with weights 0.5/0.3/0.2).
 * Windows without stock days are ignored and the weights are renormalized.
 */
export function weightedVelocity(windows: WindowVelocity[], weights = [0.5, 0.3, 0.2]): Decimal {
  let num = D(0);
  let den = D(0);
  windows.forEach((w, i) => {
    if (w.daysWithStock <= 0) return;
    const wt = D(weights[i] ?? 0);
    num = num.plus(velocity(w.unitsSold, w.daysWithStock).mul(wt));
    den = den.plus(wt);
  });
  return den.isZero() ? D(0) : roundTo(num.div(den), 4);
}

/** Population standard deviation of daily demand. */
export function stdDev(values: Num[]): Decimal {
  if (values.length === 0) return D(0);
  const n = D(values.length);
  const mean = sum(values).div(n);
  const variance = sum(values.map((v) => D(v).minus(mean).pow(2))).div(n);
  return roundTo(variance.sqrt(), 4);
}

export function daysOfCover(stock: Num, velocityPerDay: Num): Decimal | null {
  const v = D(velocityPerDay);
  if (v.lte(0)) return null;
  return roundTo(D(stock).div(v), 2);
}

/** Safety stock = z × σ_daily × √leadTime */
export function safetyStock(demandStdDev: Num, leadTimeDays: number, serviceLevel: number): Decimal {
  const z = zForServiceLevel(serviceLevel);
  return roundTo(D(demandStdDev).mul(z).mul(D(Math.max(leadTimeDays, 1)).sqrt()), 3);
}

export function reorderPoint(velocityPerDay: Num, leadTimeDays: number, safety: Num): Decimal {
  return roundTo(D(velocityPerDay).mul(Math.max(leadTimeDays, 0)).plus(D(safety)), 3);
}

/**
 * Suggested order quantity to reach `targetCoverDays` of stock,
 * rounded up to the supplier pack size.
 */
export function suggestedQty(
  velocityPerDay: Num,
  targetCoverDays: number,
  stock: Num,
  onOrder: Num = 0,
  packSize = 1,
): Decimal {
  const need = D(velocityPerDay).mul(targetCoverDays).minus(D(stock)).minus(D(onOrder));
  if (need.lte(0)) return D(0);
  const pack = Math.max(packSize, 1);
  return need.div(pack).ceil().mul(pack);
}

export function abcClassify<T extends { id: string; revenue: Num }>(items: T[], cutA = 0.8, cutB = 0.95): Map<string, AbcClass> {
  const sorted = [...items].sort((a, b) => D(b.revenue).minus(D(a.revenue)).toNumber());
  const total = sum(sorted.map((i) => i.revenue));
  const out = new Map<string, AbcClass>();
  let acc = D(0);
  for (const item of sorted) {
    // Share accumulated BEFORE this item: an item is A while the top group has not yet reached cutA.
    const before = total.isZero() ? D(1) : acc.div(total);
    acc = acc.plus(D(item.revenue));
    // Items with zero revenue are always C.
    const cls: AbcClass = D(item.revenue).lte(0) ? "C" : before.lt(cutA) ? "A" : before.lt(cutB) ? "B" : "C";
    out.set(item.id, cls);
  }
  return out;
}

export interface StatusInput {
  stock: Num;
  reorderPoint: Num;
  maxStock: Num;
  daysOfCover: Decimal | null;
  hasData: boolean;
  soonThresholdDays?: number;
}

export function stockStatus(i: StatusInput): StockStatus {
  const stock = D(i.stock);
  const rop = D(i.reorderPoint);
  const max = D(i.maxStock);
  if (!i.hasData) {
    // Manual mode: rely on min/max only.
    if (rop.gt(0) && stock.lte(rop)) return "buy_now";
    if (max.gt(0) && stock.gt(max)) return "excess";
    return rop.gt(0) || max.gt(0) ? "ok" : "no_data";
  }
  if (stock.lte(rop)) return "buy_now";
  if (i.daysOfCover !== null && i.daysOfCover.lte(i.soonThresholdDays ?? 7)) return "soon";
  if (max.gt(0) && stock.gt(max)) return "excess";
  return "ok";
}
