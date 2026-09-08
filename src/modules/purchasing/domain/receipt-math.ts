import Decimal from "decimal.js";
import { D, roundTo, sum, type Num } from "@/lib/money";
import { prorateExtraCosts } from "@/modules/inventory/domain/costing";

export interface ReceiptLineInput {
  key: string;
  productId: string;
  quantity: Num;
  /** Unit cost in the receipt currency. */
  unitCostAmount: Num;
}

export interface ComputedReceiptLine {
  key: string;
  productId: string;
  quantity: Decimal;
  unitCostAmount: Decimal;
  /** unitCostAmount ÷ exchangeRate, 4 decimals. */
  unitCostUsd: Decimal;
  /** quantity × unitCostUsd (extra costs are not included). */
  lineTotalUsd: Decimal;
  extraCostShareUsd: Decimal;
  /** unitCostUsd + prorated extra cost per unit. Used for the weighted average. */
  unitCostFinalUsd: Decimal;
}

export interface ReceiptTotals {
  lines: ComputedReceiptLine[];
  subtotalUsd: Decimal;
  extraCostsUsd: Decimal;
  totalUsd: Decimal;
}

/**
 * Convert receipt lines from the document currency to USD and prorate the
 * extra costs (freight, customs) across them by value.
 */
export function computeReceipt(lines: ReceiptLineInput[], exchangeRate: Num, extraCostsUsd: Num): ReceiptTotals {
  const rate = D(exchangeRate);
  if (rate.lte(0)) throw new Error("La tasa de cambio debe ser mayor que cero");
  const extra = roundTo(extraCostsUsd, 4);

  const converted = lines.map((l) => {
    const quantity = D(l.quantity);
    const unitCostAmount = D(l.unitCostAmount);
    const unitCostUsd = roundTo(unitCostAmount.div(rate), 4);
    return { ...l, quantity, unitCostAmount, unitCostUsd, lineTotalUsd: roundTo(quantity.mul(unitCostUsd), 4) };
  });

  const prorated = prorateExtraCosts(
    converted.map((l) => ({ key: l.key, quantity: l.quantity, unitCostUsd: l.unitCostUsd })),
    extra,
  );

  const out: ComputedReceiptLine[] = converted.map((l, i) => ({
    key: l.key,
    productId: l.productId,
    quantity: l.quantity,
    unitCostAmount: l.unitCostAmount,
    unitCostUsd: l.unitCostUsd,
    lineTotalUsd: l.lineTotalUsd,
    extraCostShareUsd: prorated[i].extraCostShareUsd,
    unitCostFinalUsd: prorated[i].unitCostFinalUsd,
  }));

  const subtotalUsd = roundTo(sum(out.map((l) => l.lineTotalUsd)), 4);
  return { lines: out, subtotalUsd, extraCostsUsd: extra, totalUsd: roundTo(subtotalUsd.plus(extra), 4) };
}

/**
 * Average cost after removing a voided purchase from stock:
 * (avg × qtyNow − costFinal × qty) ÷ (qtyNow − qty). When nothing (or less
 * than the voided quantity) remains, fall back to the previous purchase cost.
 */
export function averageAfterVoid(avgNow: Num, qtyNow: Num, costFinal: Num, qty: Num, fallbackCost: Num): Decimal {
  const remaining = D(qtyNow).minus(D(qty));
  if (remaining.lte(0)) return roundTo(fallbackCost ?? avgNow, 4);
  const value = D(avgNow).mul(D(qtyNow)).minus(D(costFinal).mul(D(qty)));
  const avg = value.div(remaining);
  return avg.lt(0) ? D(0) : roundTo(avg, 4);
}
