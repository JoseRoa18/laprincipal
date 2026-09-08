import { and, asc, count, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import {
  brands,
  categories,
  priceListItems,
  productBarcodes,
  productCompatibilities,
  productEquivalences,
  productImages,
  productStats,
  products,
  stockLevels,
  stockSettings,
  units,
} from "@/db/schema";
import { D } from "@/lib/money";
import { getStorage } from "@/lib/storage";
import { stockStatus, type StockStatus } from "@/modules/inventory/domain/velocity";
import type { ProductListFilter } from "../domain/list-filters";
import { normalizeSearch } from "../domain/search-text";
import { categoryWithDescendants, getPriceListIds, listCategoryOptions } from "./catalog-options";

export { ACTIVE_FILTER_LABELS, parseListFilter, STOCK_FILTER_LABELS, type ActiveFilter, type ProductListFilter, type StockFilter } from "../domain/list-filters";

export interface ProductListRow {
  id: string;
  sku: string;
  name: string;
  partNumber: string | null;
  categoryName: string | null;
  categoryPath: string | null;
  brandName: string | null;
  unitSymbol: string;
  unitDecimals: number;
  locationCode: string | null;
  isActive: boolean;
  publicPriceUsd: string | null;
  techPriceUsd: string | null;
  costAvgUsd: string;
  stockAvailable: string;
  stockPhysical: string;
  minStock: string;
  maxStock: string;
  reorderPoint: string;
  status: StockStatus;
  daysOfCover: string | null;
  thumbUrl: string | null;
}

const STATUS_VALUES: StockStatus[] = ["buy_now", "soon", "ok", "excess", "no_data"];

function asStatus(value: string | null | undefined): StockStatus | null {
  return value && (STATUS_VALUES as string[]).includes(value) ? (value as StockStatus) : null;
}

/** Same rule as `stockStatus()` in manual mode, expressed in SQL so it can filter. */
function statusSql(): { stockAvailable: SQL<string>; statusExpr: SQL<string> } {
  const stockAvailable = sql<string>`coalesce(${stockLevels.quantity}, 0) - coalesce(${stockLevels.reservedQty}, 0)`;
  const reorder = sql`coalesce(nullif(${stockSettings.reorderPoint}, 0), ${stockSettings.minStock}, 0)`;
  const statusExpr = sql<string>`case
    when ${productStats.status} is not null and ${productStats.status} <> 'no_data' then ${productStats.status}::text
    when ${reorder} > 0 and ${stockAvailable} <= ${reorder} then 'buy_now'
    when coalesce(${stockSettings.maxStock}, 0) > 0 and ${stockAvailable} > ${stockSettings.maxStock} then 'excess'
    when ${reorder} > 0 or coalesce(${stockSettings.maxStock}, 0) > 0 then 'ok'
    else 'no_data' end`;
  return { stockAvailable, statusExpr };
}

export function rowStatus(r: {
  statsStatus: string | null;
  stockAvailable: string;
  minStock: string | null;
  maxStock: string | null;
  reorderPoint: string | null;
}): StockStatus {
  const fromStats = asStatus(r.statsStatus);
  if (fromStats && fromStats !== "no_data") return fromStats;
  const reorder = D(r.reorderPoint ?? 0).gt(0) ? D(r.reorderPoint) : D(r.minStock ?? 0);
  return stockStatus({ stock: r.stockAvailable, reorderPoint: reorder, maxStock: r.maxStock ?? 0, daysOfCover: null, hasData: false });
}

async function buildConditions(dbx: DbOrTx, filter: ProductListFilter): Promise<SQL[]> {
  const conds: SQL[] = [isNull(products.deletedAt)];
  if (filter.active === "1") conds.push(eq(products.isActive, true));
  if (filter.active === "0") conds.push(eq(products.isActive, false));
  if (filter.brandId) conds.push(eq(products.brandId, filter.brandId));
  if (filter.categoryId) {
    const options = await listCategoryOptions(dbx, { includeInactive: true });
    conds.push(inArray(products.categoryId, categoryWithDescendants(options, filter.categoryId)));
  }
  if (filter.q) {
    const term = filter.q.trim();
    const normalized = normalizeSearch(term);
    conds.push(
      or(
        ilike(products.searchText, `%${normalized}%`),
        eq(products.sku, term.toUpperCase()),
        sql`exists (select 1 from ${productBarcodes} where ${productBarcodes.productId} = ${products.id} and ${productBarcodes.code} = ${term})`,
      )!,
    );
  }
  const { stockAvailable, statusExpr } = statusSql();
  if (filter.stock === "out") conds.push(sql`${stockAvailable} <= 0`);
  else if (filter.stock !== "all") conds.push(sql`${statusExpr} = ${filter.stock}`);
  return conds;
}

function listSubquery(dbx: DbOrTx, warehouseId: string, conds: SQL[]) {
  const parentCat = alias(categories, "parent_category");
  const { stockAvailable, statusExpr } = statusSql();
  return dbx
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      partNumber: products.partNumber,
      description: products.description,
      warrantyDays: products.warrantyDays,
      locationCode: products.locationCode,
      isActive: products.isActive,
      costAvgUsd: products.costAvgUsd,
      createdAt: products.createdAt,
      // Aliased explicitly: several joined tables have a "name" column and the
      // outer select over the subquery would otherwise be ambiguous.
      unitSymbol: sql<string>`${units.symbol}`.as("unit_symbol"),
      unitName: sql<string>`${units.name}`.as("unit_name"),
      unitDecimals: sql<number>`${units.decimals}`.as("unit_decimals"),
      categoryName: sql<string | null>`${categories.name}`.as("category_name"),
      parentCategoryName: sql<string | null>`${parentCat.name}`.as("parent_category_name"),
      brandName: sql<string | null>`${brands.name}`.as("brand_name"),
      stockQty: stockLevels.quantity,
      stockReserved: stockLevels.reservedQty,
      stockAvailable: stockAvailable.as("stock_available"),
      minStock: stockSettings.minStock,
      maxStock: stockSettings.maxStock,
      reorderPoint: stockSettings.reorderPoint,
      statsStatus: productStats.status,
      daysOfCover: productStats.daysOfCover,
      statusExpr: statusExpr.as("status_expr"),
      thumbPath: sql<string | null>`(select coalesce(pi.thumb_path, pi.processed_path, pi.original_path) from ${productImages} pi where pi.product_id = ${products.id} and pi.is_primary order by pi.sort_order limit 1)`.as(
        "thumb_path",
      ),
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(parentCat, eq(parentCat.id, categories.parentId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, warehouseId)))
    .leftJoin(stockSettings, and(eq(stockSettings.productId, products.id), eq(stockSettings.warehouseId, warehouseId)))
    .leftJoin(productStats, eq(productStats.productId, products.id))
    .where(and(...conds))
    .as("plist");
}

async function pricesFor(dbx: DbOrTx, ids: string[]) {
  const lists = await getPriceListIds(dbx);
  const listIds = [lists.publicId, lists.techId].filter((x): x is string => Boolean(x));
  const rows = ids.length
    ? await dbx
        .select({ productId: priceListItems.productId, priceListId: priceListItems.priceListId, priceUsd: priceListItems.priceUsd })
        .from(priceListItems)
        .where(and(inArray(priceListItems.productId, ids), inArray(priceListItems.priceListId, listIds)))
    : [];
  return {
    publicFor: (id: string) => rows.find((r) => r.productId === id && r.priceListId === lists.publicId)?.priceUsd ?? null,
    techFor: (id: string) => (lists.techId ? (rows.find((r) => r.productId === id && r.priceListId === lists.techId)?.priceUsd ?? null) : null),
  };
}

export async function listProducts(
  filter: ProductListFilter,
  opts: { warehouseId: string; page: number; pageSize: number; dbx?: DbOrTx },
): Promise<{ rows: ProductListRow[]; total: number }> {
  const dbx = opts.dbx ?? db;
  const conds = await buildConditions(dbx, filter);
  const sq = listSubquery(dbx, opts.warehouseId, conds);

  const [{ total }] = await dbx.select({ total: count() }).from(sq);
  const rows = await dbx
    .select()
    .from(sq)
    .orderBy(asc(sq.name), asc(sq.sku))
    .limit(opts.pageSize)
    .offset((opts.page - 1) * opts.pageSize);

  const prices = await pricesFor(dbx, rows.map((r) => r.id));
  const storage = getStorage();

  return {
    total: Number(total),
    rows: rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      partNumber: r.partNumber,
      categoryName: r.categoryName,
      categoryPath: r.categoryName ? (r.parentCategoryName ? `${r.parentCategoryName} > ${r.categoryName}` : r.categoryName) : null,
      brandName: r.brandName,
      unitSymbol: r.unitSymbol,
      unitDecimals: r.unitDecimals,
      locationCode: r.locationCode,
      isActive: r.isActive,
      publicPriceUsd: prices.publicFor(r.id),
      techPriceUsd: prices.techFor(r.id),
      costAvgUsd: r.costAvgUsd,
      stockAvailable: D(r.stockAvailable ?? 0).toFixed(3),
      stockPhysical: D(r.stockQty ?? 0).toFixed(3),
      minStock: r.minStock ?? "0",
      maxStock: r.maxStock ?? "0",
      reorderPoint: r.reorderPoint ?? "0",
      status: rowStatus({ statsStatus: r.statsStatus, stockAvailable: r.stockAvailable ?? "0", minStock: r.minStock, maxStock: r.maxStock, reorderPoint: r.reorderPoint }),
      daysOfCover: r.daysOfCover,
      thumbUrl: r.thumbPath ? storage.publicUrl("product-photos", r.thumbPath) : null,
    })),
  };
}

export interface ProductExportRow extends ProductListRow {
  description: string | null;
  warrantyDays: number;
  unitName: string;
  barcodes: string;
  equivalences: string;
  compatibilities: string;
  createdAt: Date;
}

export const EXPORT_LIMIT = 5000;

/** Rows for the Excel export (same filters as the list, no pagination, capped). */
export async function listProductsForExport(filter: ProductListFilter, opts: { warehouseId: string; dbx?: DbOrTx }): Promise<ProductExportRow[]> {
  const dbx = opts.dbx ?? db;
  const conds = await buildConditions(dbx, filter);
  const sq = listSubquery(dbx, opts.warehouseId, conds);
  const rows = await dbx.select().from(sq).orderBy(asc(sq.name), asc(sq.sku)).limit(EXPORT_LIMIT);
  const ids = rows.map((r) => r.id);
  const prices = await pricesFor(dbx, ids);
  const [codes, eqs, compat] = ids.length
    ? await Promise.all([
        dbx.select({ productId: productBarcodes.productId, code: productBarcodes.code }).from(productBarcodes).where(inArray(productBarcodes.productId, ids)),
        dbx.select({ productId: productEquivalences.productId, code: productEquivalences.code }).from(productEquivalences).where(inArray(productEquivalences.productId, ids)),
        dbx
          .select({
            productId: productCompatibilities.productId,
            applianceType: productCompatibilities.applianceType,
            brand: productCompatibilities.brand,
            model: productCompatibilities.model,
          })
          .from(productCompatibilities)
          .where(inArray(productCompatibilities.productId, ids)),
      ])
    : [[], [], []];
  const storage = getStorage();

  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    partNumber: r.partNumber,
    description: r.description,
    warrantyDays: r.warrantyDays,
    categoryName: r.categoryName,
    categoryPath: r.categoryName ? (r.parentCategoryName ? `${r.parentCategoryName} > ${r.categoryName}` : r.categoryName) : null,
    brandName: r.brandName,
    unitSymbol: r.unitSymbol,
    unitName: r.unitName,
    unitDecimals: r.unitDecimals,
    locationCode: r.locationCode,
    isActive: r.isActive,
    publicPriceUsd: prices.publicFor(r.id),
    techPriceUsd: prices.techFor(r.id),
    costAvgUsd: r.costAvgUsd,
    stockAvailable: D(r.stockAvailable ?? 0).toFixed(3),
    stockPhysical: D(r.stockQty ?? 0).toFixed(3),
    minStock: r.minStock ?? "0",
    maxStock: r.maxStock ?? "0",
    reorderPoint: r.reorderPoint ?? "0",
    status: rowStatus({ statsStatus: r.statsStatus, stockAvailable: r.stockAvailable ?? "0", minStock: r.minStock, maxStock: r.maxStock, reorderPoint: r.reorderPoint }),
    daysOfCover: r.daysOfCover,
    thumbUrl: r.thumbPath ? storage.publicUrl("product-photos", r.thumbPath) : null,
    barcodes: codes
      .filter((c) => c.productId === r.id)
      .map((c) => c.code)
      .join(", "),
    equivalences: eqs
      .filter((e) => e.productId === r.id)
      .map((e) => e.code)
      .join(", "),
    compatibilities: compat
      .filter((c) => c.productId === r.id)
      .map((c) => [c.applianceType, c.brand, c.model].filter(Boolean).join(" "))
      .join("; "),
    createdAt: r.createdAt,
  }));
}
