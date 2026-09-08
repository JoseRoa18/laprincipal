import { and, asc, count, eq, isNull, sql, type SQL } from "drizzle-orm";
import { categories, productStats, products, stockLevels, stockSettings, units } from "@/db/schema";
import type { AbcClass, StockStatus } from "@/modules/inventory/domain/velocity";
import { getStatsComputedAt } from "../application/product-stats";
import { resolveScope, type ScopeOptions } from "./common";

export type VelocitySort = "velocity" | "cover" | "name";

export interface VelocityFilters extends ScopeOptions {
  status?: StockStatus;
  abc?: AbcClass;
  categoryId?: string;
  sort?: VelocitySort;
  page?: number;
  pageSize?: number;
}

export interface VelocityRow {
  productId: string;
  sku: string;
  name: string;
  partNumber: string | null;
  category: string;
  unitDecimals: number;
  available: string;
  velocity: string;
  velocity30: string;
  daysOfCover: string | null;
  abcClass: AbcClass | null;
  status: StockStatus;
  suggestedReorderPoint: string;
  suggestedQty: string;
  units90: string;
  lastSaleAt: Date | null;
  mode: "manual" | "auto";
  reorderPoint: string;
  minStock: string;
  hasStats: boolean;
}

export interface VelocityReport {
  rows: VelocityRow[];
  total: number;
  page: number;
  pageSize: number;
  computedAt: Date | null;
  statusCounts: Record<StockStatus, number>;
}

export const STATUS_ORDER: StockStatus[] = ["buy_now", "soon", "ok", "excess", "no_data"];

export async function getVelocityReport(filters: VelocityFilters = {}): Promise<VelocityReport> {
  const { dbx, warehouseId } = await resolveScope(filters);
  const page = Math.max(filters.page ?? 1, 1);
  const pageSize = filters.pageSize ?? 50;

  const statusExpr = sql<StockStatus>`coalesce(${productStats.status}, 'no_data')`;
  const availableExpr = sql<string>`coalesce(${stockLevels.quantity}, 0) - coalesce(${stockLevels.reservedQty}, 0)`;
  const categoryLabel = sql<string>`coalesce(${categories.name}, 'Sin categoría')`;

  const conditions: SQL[] = [isNull(products.deletedAt), eq(products.isActive, true)];
  if (filters.status) conditions.push(sql`${statusExpr} = ${filters.status}`);
  if (filters.abc) conditions.push(eq(productStats.abcClass, filters.abc));
  if (filters.categoryId) conditions.push(eq(products.categoryId, filters.categoryId));
  const where = and(...conditions);

  const order =
    filters.sort === "cover"
      ? [sql`${productStats.daysOfCover} asc nulls last`, asc(products.name)]
      : filters.sort === "name"
        ? [asc(products.name)]
        : [sql`coalesce(${productStats.velocity}, 0) desc`, asc(products.name)];

  const [rows, [totalRow], statusRows, computedAt] = await Promise.all([
    dbx
      .select({
        productId: products.id,
        sku: products.sku,
        name: products.name,
        partNumber: products.partNumber,
        category: categoryLabel,
        unitDecimals: units.decimals,
        available: availableExpr,
        velocity: sql<string>`coalesce(${productStats.velocity}, 0)`,
        velocity30: sql<string>`coalesce(${productStats.velocity30}, 0)`,
        daysOfCover: productStats.daysOfCover,
        abcClass: productStats.abcClass,
        status: statusExpr,
        suggestedReorderPoint: sql<string>`coalesce(${productStats.suggestedReorderPoint}, 0)`,
        suggestedQty: sql<string>`coalesce(${productStats.suggestedQty}, 0)`,
        units90: sql<string>`coalesce(${productStats.units90}, 0)`,
        lastSaleAt: productStats.lastSaleAt,
        mode: sql<"manual" | "auto">`coalesce(${stockSettings.mode}, 'manual')`,
        reorderPoint: sql<string>`coalesce(${stockSettings.reorderPoint}, 0)`,
        minStock: sql<string>`coalesce(${stockSettings.minStock}, 0)`,
        hasStats: sql<boolean>`${productStats.productId} is not null`,
      })
      .from(products)
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(productStats, and(eq(productStats.productId, products.id), eq(productStats.warehouseId, warehouseId)))
      .leftJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, warehouseId)))
      .leftJoin(stockSettings, and(eq(stockSettings.productId, products.id), eq(stockSettings.warehouseId, warehouseId)))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    dbx
      .select({ total: count() })
      .from(products)
      .leftJoin(productStats, and(eq(productStats.productId, products.id), eq(productStats.warehouseId, warehouseId)))
      .where(where),
    dbx
      .select({ status: statusExpr, count: count() })
      .from(products)
      .leftJoin(productStats, and(eq(productStats.productId, products.id), eq(productStats.warehouseId, warehouseId)))
      .where(and(isNull(products.deletedAt), eq(products.isActive, true)))
      .groupBy(statusExpr),
    getStatsComputedAt(dbx),
  ]);

  const statusCounts: Record<StockStatus, number> = { buy_now: 0, soon: 0, ok: 0, excess: 0, no_data: 0 };
  for (const r of statusRows) statusCounts[r.status] = r.count;

  return {
    rows: rows.map((r) => ({ ...r, abcClass: (r.abcClass as AbcClass | null) ?? null })),
    total: totalRow?.total ?? 0,
    page,
    pageSize,
    computedAt,
    statusCounts,
  };
}
