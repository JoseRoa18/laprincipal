import { and, asc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { categories, productStats, products, stockLevels, stockSettings, units } from "@/db/schema";
import { D, toMoneyDb } from "@/lib/money";
import { getStorage } from "@/lib/storage";
import { normalizeSearch } from "@/modules/catalog/infrastructure/product-lookup";
import { getDefaultLocation } from "@/modules/core/application/context";
import type { StockStatus } from "../domain/velocity";

export const STOCK_STATUSES: StockStatus[] = ["buy_now", "soon", "ok", "excess", "no_data"];

export function isStockStatus(value: unknown): value is StockStatus {
  return typeof value === "string" && (STOCK_STATUSES as string[]).includes(value);
}

/** Physical quantity (0 when the product has no stock row). */
export const qtyExpr = sql<string>`coalesce(${stockLevels.quantity}, 0)`;
export const reservedExpr = sql<string>`coalesce(${stockLevels.reservedQty}, 0)`;
/** Manual reorder point: reorder_point, falling back to min_stock. */
export const reorderPointExpr = sql<string>`coalesce(nullif(${stockSettings.reorderPoint}, 0), ${stockSettings.minStock}, 0)`;
export const maxStockExpr = sql<string>`coalesce(${stockSettings.maxStock}, 0)`;

/**
 * Traffic-light status in SQL. Mirrors `stockStatus()` from the domain:
 * uses `product_stats.status` when the daily statistics exist (and are not
 * "no_data"), otherwise the manual min/max rule.
 */
export const statusExpr = sql<StockStatus>`case
  when ${productStats.productId} is not null and ${productStats.status} <> 'no_data' then ${productStats.status}::text
  when ${reorderPointExpr} > 0 and ${qtyExpr} <= ${reorderPointExpr} then 'buy_now'
  when ${maxStockExpr} > 0 and ${qtyExpr} > ${maxStockExpr} then 'excess'
  when ${reorderPointExpr} > 0 or ${maxStockExpr} > 0 then 'ok'
  else 'no_data' end`;

/** Inventory value at average cost (negative stock does not subtract). */
export const valueExpr = sql<string>`greatest(${qtyExpr}, 0) * ${products.costAvgUsd}`;

const thumbExpr = sql<string | null>`(select coalesce(pi.thumb_path, pi.processed_path, pi.original_path)
  from product_images pi where pi.product_id = ${products.id}
  order by pi.is_primary desc, pi.sort_order asc limit 1)`;

export interface StockRow {
  productId: string;
  sku: string;
  name: string;
  partNumber: string | null;
  locationCode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  unitSymbol: string;
  unitDecimals: number;
  isActive: boolean;
  quantity: string;
  reservedQty: string;
  available: string;
  hasSettings: boolean;
  minStock: string;
  maxStock: string;
  reorderPoint: string;
  reorderQty: string;
  mode: "manual" | "auto";
  hasStats: boolean;
  daysOfCover: string | null;
  velocity: string | null;
  lastSaleAt: Date | null;
  suggestedQty: string;
  status: StockStatus;
  costAvgUsd: string;
  costLastUsd: string | null;
  valueUsd: string;
  thumbUrl: string | null;
}

export interface StockFilters {
  q?: string;
  status?: StockStatus | "";
  categoryId?: string;
  onlyWithStock?: boolean;
  includeInactive?: boolean;
  productIds?: string[];
  /** Extra SQL conditions (alerts). */
  extraWhere?: SQL[];
}

export interface StockListOptions extends StockFilters {
  page?: number;
  pageSize?: number;
  warehouseId?: string;
  dbx?: DbOrTx;
}

function buildWhere(f: StockFilters): SQL | undefined {
  const conds: (SQL | undefined)[] = [isNull(products.deletedAt)];
  if (!f.includeInactive) conds.push(eq(products.isActive, true));
  const q = f.q?.trim();
  if (q) {
    const norm = normalizeSearch(q);
    conds.push(
      or(
        ilike(products.searchText, `%${norm}%`),
        ilike(products.sku, `%${q}%`),
        ilike(products.partNumber, `%${q}%`),
        ilike(products.locationCode, `%${q}%`),
      ),
    );
  }
  if (f.status) conds.push(sql`${statusExpr} = ${f.status}`);
  if (f.categoryId) conds.push(or(eq(products.categoryId, f.categoryId), eq(categories.parentId, f.categoryId)));
  if (f.onlyWithStock) conds.push(sql`${qtyExpr} > 0`);
  if (f.productIds) {
    if (f.productIds.length === 0) conds.push(sql`false`);
    else conds.push(inArray(products.id, f.productIds));
  }
  for (const extra of f.extraWhere ?? []) conds.push(extra);
  return and(...conds);
}

/**
 * Products joined with stock, settings, statistics and category for one warehouse.
 * Returns the page rows, the total row count and the inventory value of the whole filtered set.
 */
export async function listStock(opts: StockListOptions = {}): Promise<{ rows: StockRow[]; total: number; totalValueUsd: string }> {
  const dbx = opts.dbx ?? db;
  const warehouseId = opts.warehouseId ?? (await getDefaultLocation(dbx)).warehouseId;
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? 50);
  const where = buildWhere(opts);
  const storage = getStorage();

  const stockJoin = and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, warehouseId));
  const settingsJoin = and(eq(stockSettings.productId, products.id), eq(stockSettings.warehouseId, warehouseId));

  const rows = await dbx
    .select({
      productId: products.id,
      sku: products.sku,
      name: products.name,
      partNumber: products.partNumber,
      locationCode: products.locationCode,
      categoryId: products.categoryId,
      categoryName: categories.name,
      unitSymbol: units.symbol,
      unitDecimals: units.decimals,
      isActive: products.isActive,
      quantity: qtyExpr,
      reservedQty: reservedExpr,
      settingsProductId: stockSettings.productId,
      minStock: stockSettings.minStock,
      maxStock: stockSettings.maxStock,
      reorderPoint: stockSettings.reorderPoint,
      reorderQty: stockSettings.reorderQty,
      mode: stockSettings.mode,
      statsProductId: productStats.productId,
      daysOfCover: productStats.daysOfCover,
      velocity: productStats.velocity,
      lastSaleAt: productStats.lastSaleAt,
      suggestedQty: productStats.suggestedQty,
      status: statusExpr,
      costAvgUsd: products.costAvgUsd,
      costLastUsd: products.costLastUsd,
      valueUsd: valueExpr,
      thumbPath: thumbExpr,
    })
    .from(products)
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(stockLevels, stockJoin)
    .leftJoin(stockSettings, settingsJoin)
    .leftJoin(productStats, eq(productStats.productId, products.id))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(where)
    .orderBy(asc(products.name), asc(products.sku))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [agg] = await dbx
    .select({
      count: sql<number>`count(*)::int`,
      value: sql<string>`coalesce(sum(${valueExpr}), 0)`,
    })
    .from(products)
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(stockLevels, stockJoin)
    .leftJoin(stockSettings, settingsJoin)
    .leftJoin(productStats, eq(productStats.productId, products.id))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(where);

  return {
    rows: rows.map((r) => {
      const quantity = D(r.quantity);
      const available = quantity.minus(D(r.reservedQty));
      return {
        productId: r.productId,
        sku: r.sku,
        name: r.name,
        partNumber: r.partNumber,
        locationCode: r.locationCode,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        unitSymbol: r.unitSymbol,
        unitDecimals: r.unitDecimals,
        isActive: r.isActive,
        quantity: quantity.toFixed(3),
        reservedQty: D(r.reservedQty).toFixed(3),
        available: available.toFixed(3),
        hasSettings: r.settingsProductId !== null,
        minStock: D(r.minStock).toFixed(3),
        maxStock: D(r.maxStock).toFixed(3),
        reorderPoint: D(r.reorderPoint).toFixed(3),
        reorderQty: D(r.reorderQty).toFixed(3),
        mode: r.mode ?? "manual",
        hasStats: r.statsProductId !== null,
        daysOfCover: r.daysOfCover,
        velocity: r.velocity,
        lastSaleAt: r.lastSaleAt,
        suggestedQty: D(r.suggestedQty).toFixed(3),
        status: isStockStatus(r.status) ? r.status : "no_data",
        costAvgUsd: r.costAvgUsd,
        costLastUsd: r.costLastUsd,
        valueUsd: toMoneyDb(r.valueUsd),
        thumbUrl: r.thumbPath ? storage.publicUrl("product-photos", r.thumbPath) : null,
      };
    }),
    total: agg?.count ?? 0,
    totalValueUsd: toMoneyDb(agg?.value ?? 0),
  };
}

export interface CategoryOption {
  id: string;
  label: string;
  parentId: string | null;
}

/** Active categories as "Padre › Hijo" options for filters. */
export async function listCategoryOptions(dbx: DbOrTx = db): Promise<CategoryOption[]> {
  const rows = await dbx
    .select({ id: categories.id, name: categories.name, parentId: categories.parentId, sortOrder: categories.sortOrder })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const parents = rows.filter((r) => !r.parentId);
  const out: CategoryOption[] = [];
  for (const p of parents) {
    out.push({ id: p.id, label: p.name, parentId: null });
    for (const c of rows.filter((r) => r.parentId === p.id)) {
      out.push({ id: c.id, label: `${p.name} › ${c.name}`, parentId: p.id });
    }
  }
  // Orphans (parent inactive) at the end.
  for (const r of rows) {
    if (r.parentId && !byId.has(r.parentId)) out.push({ id: r.id, label: r.name, parentId: r.parentId });
  }
  return out;
}
