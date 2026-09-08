import type Decimal from "decimal.js";
import { D, sum, type Num } from "@/lib/money";

/** Bills available for the counting helper, per cash currency. */
export const DENOMINATIONS: Record<string, number[]> = {
  USD: [1, 5, 10, 20, 50, 100],
  COP: [2000, 5000, 10000, 20000, 50000, 100000],
};

export function denominationsFor(currencyCode: string): number[] {
  return DENOMINATIONS[currencyCode] ?? [];
}

/** Sum of bill x count. Counts that are not finite non-negative integers are ignored. */
export function sumDenominations(counts: Record<string, Num>): string {
  const parts: Num[] = [];
  for (const [bill, count] of Object.entries(counts)) {
    let n: Decimal;
    try {
      n = D(count === "" ? 0 : count);
    } catch {
      continue;
    }
    if (!n.isFinite() || n.lt(0) || !n.isInteger()) continue;
    parts.push(D(bill).mul(n));
  }
  return sum(parts).toFixed(4);
}
