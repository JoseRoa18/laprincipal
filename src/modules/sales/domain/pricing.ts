import Decimal from "decimal.js";
import { D, roundTo, splitTaxIncluded, sum, type Num } from "@/lib/money";

export type DiscountType = "pct" | "amount";

export interface LineInput {
  /** Any identifier the caller needs back (product id, cart line id). */
  key: string;
  quantity: Num;
  /** List price per unit in USD, tax included. */
  unitPriceUsd: Num;
  /** 0.16 for IVA 16 %. */
  taxRate: Num;
  discountType?: DiscountType;
  discountValue?: Num;
}

export interface ComputedLine {
  key: string;
  quantity: Decimal;
  unitPriceUsd: Decimal;
  taxRate: Decimal;
  discountType: DiscountType;
  discountValue: Decimal;
  /** quantity × unit price, tax included, before discounts. */
  grossUsd: Decimal;
  /** Line discount + prorated share of the global discount. */
  discountUsd: Decimal;
  /** Amount the customer pays for the line, tax included. */
  lineTotalUsd: Decimal;
  /** Taxable base contained in lineTotalUsd. */
  baseUsd: Decimal;
  /** IVA contained in lineTotalUsd. */
  taxUsd: Decimal;
}

export interface GlobalDiscount {
  type: DiscountType;
  value: Num;
}

export interface SaleTotals {
  lines: ComputedLine[];
  /** Sum of gross lines (tax included, before discounts). */
  subtotalUsd: Decimal;
  discountUsd: Decimal;
  baseUsd: Decimal;
  taxUsd: Decimal;
  /** subtotal − discount. What the customer pays. */
  totalUsd: Decimal;
}

const MONEY_SCALE = 2;

function lineDiscount(gross: Decimal, type: DiscountType, value: Decimal): Decimal {
  if (value.lte(0)) return D(0);
  const d = type === "pct" ? gross.mul(value).div(100) : value;
  const capped = Decimal.min(d, gross);
  return roundTo(capped, MONEY_SCALE);
}

function finishLine(partial: Omit<ComputedLine, "lineTotalUsd" | "baseUsd" | "taxUsd">): ComputedLine {
  const lineTotalUsd = roundTo(partial.grossUsd.minus(partial.discountUsd), MONEY_SCALE);
  const { tax } = splitTaxIncluded(lineTotalUsd, partial.taxRate);
  const taxUsd = roundTo(tax, MONEY_SCALE);
  return { ...partial, lineTotalUsd, taxUsd, baseUsd: lineTotalUsd.minus(taxUsd) };
}

export function computeLine(input: LineInput): ComputedLine {
  const quantity = D(input.quantity);
  const unitPriceUsd = D(input.unitPriceUsd);
  const taxRate = D(input.taxRate);
  const discountType = input.discountType ?? "pct";
  const discountValue = D(input.discountValue);
  if (quantity.lte(0)) throw new Error("La cantidad debe ser mayor que cero");
  if (unitPriceUsd.lt(0)) throw new Error("El precio no puede ser negativo");

  const grossUsd = roundTo(quantity.mul(unitPriceUsd), MONEY_SCALE);
  const discountUsd = lineDiscount(grossUsd, discountType, discountValue);
  return finishLine({ key: input.key, quantity, unitPriceUsd, taxRate, discountType, discountValue, grossUsd, discountUsd });
}

/**
 * Compute all totals. A global discount is prorated across lines in proportion
 * to their net amount so that line totals always add up to the sale total.
 */
export function computeTotals(inputs: LineInput[], global?: GlobalDiscount | null): SaleTotals {
  let lines = inputs.map(computeLine);

  if (global && D(global.value).gt(0) && lines.length > 0) {
    const netBefore = sum(lines.map((l) => l.lineTotalUsd));
    const wanted =
      global.type === "pct" ? netBefore.mul(D(global.value)).div(100) : D(global.value);
    const globalTotal = roundTo(Decimal.min(wanted, netBefore), MONEY_SCALE);

    let allocated = D(0);
    lines = lines.map((l, i) => {
      const isLast = i === lines.length - 1;
      const share = isLast
        ? globalTotal.minus(allocated)
        : netBefore.isZero()
          ? D(0)
          : roundTo(globalTotal.mul(l.lineTotalUsd).div(netBefore), MONEY_SCALE);
      allocated = allocated.plus(share);
      return finishLine({ ...l, discountUsd: l.discountUsd.plus(share) });
    });
  }

  const subtotalUsd = sum(lines.map((l) => l.grossUsd));
  const discountUsd = sum(lines.map((l) => l.discountUsd));
  const taxUsd = sum(lines.map((l) => l.taxUsd));
  const totalUsd = sum(lines.map((l) => l.lineTotalUsd));
  return { lines, subtotalUsd, discountUsd, taxUsd, baseUsd: totalUsd.minus(taxUsd), totalUsd };
}

/** Effective discount percentage of a line or a sale, for permission checks. */
export function effectiveDiscountPct(grossUsd: Num, discountUsd: Num): Decimal {
  const g = D(grossUsd);
  if (g.isZero()) return D(0);
  return D(discountUsd).div(g).mul(100);
}
