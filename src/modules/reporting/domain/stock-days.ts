import type Decimal from "decimal.js";
import { D, type Num } from "@/lib/money";
import { eachDay } from "./date-range";

/**
 * A kardex row reduced to what the velocity needs: the business day it
 * happened and the balance it left. Must be in chronological order
 * (created_at, id) within a day; days are sorted here.
 */
export interface DayMovement {
  /** yyyy-MM-dd in the business time zone. */
  day: string;
  balanceAfter: Num;
}

export interface DaySales {
  day: string;
  units: Num;
}

export interface StockDays {
  /** Days in the window with end-of-day stock > 0 or at least one sale. */
  daysWithStock: number;
  /** Days in the window (inclusive of both ends). */
  windowDays: number;
  /** Units sold inside the window. */
  unitsSold: Decimal;
  /** Units sold on each day with stock (zeros included), for the demand deviation. */
  dailyUnits: Decimal[];
}

/**
 * Reconstructs the end-of-day balance for every day in [windowStart, today]
 * and counts the days the product could actually be sold.
 *
 * - The balance before the window is the last movement before `windowStart`
 *   (0 when there is none).
 * - A day counts as "with stock" when its end-of-day balance is positive or
 *   a sale happened that day (the last units were sold that day).
 * - Movements after `today` are ignored.
 */
export function daysWithStock(movements: DayMovement[], sales: DaySales[], windowStart: string, today: string): StockDays {
  const days = eachDay(windowStart, today);
  const result: StockDays = { daysWithStock: 0, windowDays: days.length, unitsSold: D(0), dailyUnits: [] };
  if (days.length === 0) return result;

  const salesByDay = new Map<string, Decimal>();
  for (const s of sales) {
    salesByDay.set(s.day, (salesByDay.get(s.day) ?? D(0)).plus(D(s.units)));
  }

  // Stable sort by day keeps the intra-day order the caller provided.
  const sorted = [...movements].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  let idx = 0;
  let balance = D(0);
  while (idx < sorted.length && sorted[idx].day < windowStart) {
    balance = D(sorted[idx].balanceAfter);
    idx++;
  }

  for (const day of days) {
    while (idx < sorted.length && sorted[idx].day === day) {
      balance = D(sorted[idx].balanceAfter);
      idx++;
    }
    const units = salesByDay.get(day) ?? D(0);
    if (balance.gt(0) || units.gt(0)) {
      result.daysWithStock++;
      result.dailyUnits.push(units);
      result.unitsSold = result.unitsSold.plus(units);
    }
  }
  return result;
}
