import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { categories, products, stockLevels, units } from "@/db/schema";
import { D, roundTo } from "@/lib/money";
import { resolveScope, sumOf, type ScopeOptions } from "./common";

export type InventorySort = "value" | "qty" | "name";

export interface InventoryRow {
  productId: string;
  sku: string;
  name: string;
  partNumber: string | null;
  category: string;
  unitDecimals: number;
  quantity: string;
  costAvg: string;
  value: string;
}

export interface InventoryValuation {
  totalValue: string;
  totalQty: string;
  withStock: number;
  withoutStock: number;
  byCategory: Array<{ categoryId: string | null; name: string; products: number; quantity: string; value: string; share: number }>;
  /** Products with stock, sorted; limited to `limit` when given. */
  rows: InventoryRow[];
  /** Number of products with stock (rows may be truncated). */
  rowsTotal: number;
}

export interface InventoryOptions extends ScopeOptions {
  sort?: InventorySort;
  limit?: number;
}

const valueExpr = sql`(${stockLevels.quantity} * ${products.costAvgUsd})`;

export async function getInventoryValuation(opts: InventoryOptions = {}): Promise<InventoryValuation> {
  const { dbx, warehouseId } = await resolveScope(opts);
  const activeFilter = and(isNull(products.deletedAt), eq(products.isActive, true));
  const stockJoin = and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, warehouseId));
  const hasStock = sql`coalesce(${stockLevels.quantity}, 0) > 0`;
  const categoryLabel = sql<string>`coalesce(${categories.name}, 'Sin categoría')`;

  const order =
    opts.sort === "qty"
      ? [desc(stockLevels.quantity), asc(products.name)]
      : opts.sort === "name"
        ? [asc(products.name)]
        : [desc(valueExpr), asc(products.name)];

  const rowsQuery = dbx
    .select({
      productId: products.id,
      sku: products.sku,
      name: products.name,
      partNumber: products.partNumber,
      category: categoryLabel,
      unitDecimals: units.decimals,
      quantity: stockLevels.quantity,
      costAvg: products.costAvgUsd,
      value: sql<string>`${valueExpr}`,
    })
    .from(products)
    .innerJoin(stockLevels, stockJoin)
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(activeFilter, hasStock))
    .orderBy(...order);

  const [[summary], [counts], byCategoryRows, rows] = await Promise.all([
    dbx
      .select({ totalValue: sumOf(valueExpr), totalQty: sumOf(stockLevels.quantity), withStock: count() })
      .from(products)
      .innerJoin(stockLevels, stockJoin)
      .where(and(activeFilter, hasStock)),
    dbx
      .select({ total: count() })
      .from(products)
      .where(activeFilter),
    dbx
      .select({
        categoryId: products.categoryId,
        name: categoryLabel,
        products: count(),
        quantity: sumOf(stockLevels.quantity),
        value: sumOf(valueExpr),
      })
      .from(products)
      .innerJoin(stockLevels, stockJoin)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(and(activeFilter, hasStock))
      .groupBy(products.categoryId, categoryLabel)
      .orderBy(desc(sumOf(valueExpr))),
    opts.limit ? rowsQuery.limit(opts.limit) : rowsQuery,
  ]);

  const totalValue = D(summary?.totalValue ?? 0);
  const withStock = summary?.withStock ?? 0;

  return {
    totalValue: totalValue.toFixed(4),
    totalQty: summary?.totalQty ?? "0",
    withStock,
    withoutStock: Math.max((counts?.total ?? 0) - withStock, 0),
    byCategory: byCategoryRows.map((r) => ({
      ...r,
      share: totalValue.gt(0) ? roundTo(D(r.value).div(totalValue).mul(100), 1).toNumber() : 0,
    })),
    rows: rows.map((r) => ({ ...r, quantity: r.quantity ?? "0", value: r.value ?? "0" })),
    rowsTotal: withStock,
  };
}
