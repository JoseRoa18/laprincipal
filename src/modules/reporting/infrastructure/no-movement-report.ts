import { and, desc, eq, inArray, isNull, max, min, or, sql } from "drizzle-orm";
import { categories, inventoryMovements, products, saleItems, sales, stockLevels, units } from "@/db/schema";
import { businessDate } from "@/lib/format";
import { D } from "@/lib/money";
import { addDays, dayOf, dayStart, diffDays } from "../domain/date-range";
import { resolveScope, SOLD_STATUSES, type ScopeOptions } from "./common";

export interface NoMovementRow {
  productId: string;
  sku: string;
  name: string;
  partNumber: string | null;
  category: string;
  unitDecimals: number;
  quantity: string;
  costAvg: string;
  value: string;
  lastSaleAt: Date | null;
  lastInboundAt: Date | null;
  /** Days since the last sale, or since the product first had stock when it never sold. */
  idleDays: number;
}

export interface NoMovementReport {
  days: number;
  cutoff: string;
  rows: NoMovementRow[];
  count: number;
  totalValue: string;
}

export interface NoMovementOptions extends ScopeOptions {
  days: number;
  today?: string;
}

/** Products with stock that have not sold in `days` days (and were already in stock by then). */
export async function getNoMovementReport(opts: NoMovementOptions): Promise<NoMovementReport> {
  const { dbx, warehouseId, tz } = await resolveScope(opts);
  const today = opts.today ?? businessDate(new Date(), tz);
  const days = Math.max(1, Math.floor(opts.days));
  const cutoff = addDays(today, -days);
  // Anything before the start of (cutoff + 1) is "old". Bound as ISO text because the
  // comparisons below are against subquery aliases, which carry no Date encoder.
  const cutoffAt = dayStart(addDays(cutoff, 1), tz).toISOString();

  const lastSale = dbx
    .select({ productId: saleItems.productId, lastSaleAt: max(sales.saleDate).as("last_sale_at") })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(and(eq(sales.warehouseId, warehouseId), inArray(sales.status, [...SOLD_STATUSES])))
    .groupBy(saleItems.productId)
    .as("ls");

  const inbound = dbx
    .select({
      productId: inventoryMovements.productId,
      firstInAt: min(inventoryMovements.createdAt).as("first_in_at"),
      lastInAt: max(inventoryMovements.createdAt).as("last_in_at"),
    })
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.warehouseId, warehouseId), sql`${inventoryMovements.quantity} > 0`))
    .groupBy(inventoryMovements.productId)
    .as("inb");

  const inStockSince = sql`coalesce(${inbound.firstInAt}, ${products.createdAt})`;
  const valueExpr = sql<string>`${stockLevels.quantity} * ${products.costAvgUsd}`;
  const categoryLabel = sql<string>`coalesce(${categories.name}, 'Sin categoría')`;

  const rows = await dbx
    .select({
      productId: products.id,
      sku: products.sku,
      name: products.name,
      partNumber: products.partNumber,
      category: categoryLabel,
      unitDecimals: units.decimals,
      quantity: stockLevels.quantity,
      costAvg: products.costAvgUsd,
      value: valueExpr,
      lastSaleAt: lastSale.lastSaleAt,
      lastInboundAt: inbound.lastInAt,
      inStockSince: sql<Date>`${inStockSince}`.mapWith(products.createdAt),
    })
    .from(products)
    .innerJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, warehouseId)))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(lastSale, eq(lastSale.productId, products.id))
    .leftJoin(inbound, eq(inbound.productId, products.id))
    .where(
      and(
        isNull(products.deletedAt),
        eq(products.isActive, true),
        sql`${stockLevels.quantity} > 0`,
        or(isNull(lastSale.lastSaleAt), sql`${lastSale.lastSaleAt} < ${cutoffAt}::timestamptz`),
        sql`${inStockSince} < ${cutoffAt}::timestamptz`,
      ),
    )
    .orderBy(desc(valueExpr));

  const totalValue = rows.reduce((acc, r) => acc.plus(D(r.value)), D(0));

  return {
    days,
    cutoff,
    count: rows.length,
    totalValue: totalValue.toFixed(4),
    rows: rows.map((r) => {
      const since = r.lastSaleAt ?? r.inStockSince;
      return {
        productId: r.productId,
        sku: r.sku,
        name: r.name,
        partNumber: r.partNumber,
        category: r.category,
        unitDecimals: r.unitDecimals,
        quantity: r.quantity,
        costAvg: r.costAvg,
        value: r.value,
        lastSaleAt: r.lastSaleAt,
        lastInboundAt: r.lastInboundAt,
        idleDays: since ? Math.max(diffDays(dayOf(since, tz), today), 0) : days,
      };
    }),
  };
}
