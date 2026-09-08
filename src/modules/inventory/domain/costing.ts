import Decimal from "decimal.js";
import { D, roundTo, sum, type Num } from "@/lib/money";

/**
 * Weighted average cost after receiving `incomingQty` at `incomingUnitCost`.
 * When current stock is zero or negative the average resets to the incoming cost.
 */
export function weightedAverageCost(currentQty: Num, currentAvg: Num, incomingQty: Num, incomingUnitCost: Num): Decimal {
  const q0 = D(currentQty);
  const c0 = D(currentAvg);
  const q1 = D(incomingQty);
  const c1 = D(incomingUnitCost);
  if (q1.lte(0)) throw new Error("La cantidad recibida debe ser mayor que cero");
  if (q0.lte(0)) return roundTo(c1, 4);
  const total = q0.mul(c0).plus(q1.mul(c1));
  return roundTo(total.div(q0.plus(q1)), 4);
}

export interface CostLine {
  key: string;
  quantity: Num;
  unitCostUsd: Num;
}

export interface ProratedLine extends CostLine {
  lineValueUsd: Decimal;
  extraCostShareUsd: Decimal;
  unitCostFinalUsd: Decimal;
}

/**
 * Prorate extra purchase costs (freight, customs) across lines in proportion
 * to their value. The last line absorbs the rounding remainder.
 */
export function prorateExtraCosts(lines: CostLine[], extraCostsUsd: Num): ProratedLine[] {
  const extra = D(extraCostsUsd);
  const values = lines.map((l) => D(l.quantity).mul(D(l.unitCostUsd)));
  const totalValue = sum(values);
  let allocated = D(0);

  return lines.map((l, i) => {
    const lineValueUsd = values[i];
    const qty = D(l.quantity);
    let share: Decimal;
    if (extra.lte(0) || totalValue.isZero()) {
      share = D(0);
    } else if (i === lines.length - 1) {
      share = roundTo(extra.minus(allocated), 4);
    } else {
      share = roundTo(extra.mul(lineValueUsd).div(totalValue), 4);
    }
    allocated = allocated.plus(share);
    const perUnit = qty.isZero() ? D(0) : share.div(qty);
    return {
      ...l,
      lineValueUsd: roundTo(lineValueUsd, 4),
      extraCostShareUsd: share,
      unitCostFinalUsd: roundTo(D(l.unitCostUsd).plus(perUnit), 4),
    };
  });
}
