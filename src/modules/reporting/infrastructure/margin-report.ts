import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { categories, products, saleItems, sales } from "@/db/schema";
import { D, roundTo } from "@/lib/money";
import { dayEndExclusive, dayStart, type DateRange } from "../domain/date-range";
import { netLineBase, netLineCost, netQty, resolveScope, SOLD_STATUSES, sumOf, type ScopeOptions } from "./common";

export interface MarginRow {
  id: string | null;
  name: string;
  detail: string | null;
  units: string;
  /** Revenue without tax (what the store keeps before cost). */
  revenue: string;
  cost: string;
  margin: string;
  /** Margin over revenue, in percent; null without revenue. */
  marginPct: number | null;
}

export interface MarginReport {
  range: DateRange;
  totals: MarginRow;
  byProduct: MarginRow[];
  byCategory: MarginRow[];
}

function toRow(r: { id: string | null; name: string; detail?: string | null; units: string; revenue: string; cost: string }): MarginRow {
  const revenue = D(r.revenue);
  const cost = D(r.cost);
  const margin = revenue.minus(cost);
  return {
    id: r.id,
    name: r.name,
    detail: r.detail ?? null,
    units: r.units,
    revenue: revenue.toFixed(4),
    cost: cost.toFixed(4),
    margin: margin.toFixed(4),
    marginPct: revenue.gt(0) ? roundTo(margin.div(revenue).mul(100), 1).toNumber() : null,
  };
}

export async function getMarginReport(range: DateRange, opts: ScopeOptions = {}): Promise<MarginReport> {
  const { dbx, warehouseId, tz } = await resolveScope(opts);
  const inRange = and(
    eq(sales.warehouseId, warehouseId),
    inArray(sales.status, [...SOLD_STATUSES]),
    gte(sales.saleDate, dayStart(range.from, tz)),
    lt(sales.saleDate, dayEndExclusive(range.to, tz)),
  );
  const categoryLabel = sql<string>`coalesce(${categories.name}, 'Sin categoría')`;

  const [byProductRows, byCategoryRows] = await Promise.all([
    dbx
      .select({
        id: saleItems.productId,
        name: products.name,
        detail: products.partNumber,
        units: sumOf(netQty),
        revenue: sumOf(netLineBase),
        cost: sumOf(netLineCost),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .innerJoin(products, eq(products.id, saleItems.productId))
      .where(inRange)
      .groupBy(saleItems.productId, products.name, products.partNumber)
      .orderBy(desc(sql`sum(${netLineBase}) - sum(${netLineCost})`), asc(products.name)),
    dbx
      .select({
        id: products.categoryId,
        name: categoryLabel,
        units: sumOf(netQty),
        revenue: sumOf(netLineBase),
        cost: sumOf(netLineCost),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .innerJoin(products, eq(products.id, saleItems.productId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(inRange)
      .groupBy(products.categoryId, categoryLabel)
      .orderBy(desc(sql`sum(${netLineBase}) - sum(${netLineCost})`)),
  ]);

  const byProduct = byProductRows.map(toRow);
  const totals = toRow({
    id: null,
    name: "Total",
    units: byProduct.reduce((acc, r) => acc.plus(D(r.units)), D(0)).toFixed(3),
    revenue: byProduct.reduce((acc, r) => acc.plus(D(r.revenue)), D(0)).toFixed(4),
    cost: byProduct.reduce((acc, r) => acc.plus(D(r.cost)), D(0)).toFixed(4),
  });

  return { range, totals, byProduct, byCategory: byCategoryRows.map(toRow) };
}
