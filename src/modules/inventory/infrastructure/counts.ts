import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { categories, products, stockCountItems, stockCounts, stockLevels, units, users } from "@/db/schema";
import { D } from "@/lib/money";
import type { CountFilter } from "../application/counts";

export type CountStatus = "open" | "applied" | "cancelled";

export interface CountListRow {
  id: string;
  number: string | null;
  status: CountStatus;
  blind: boolean;
  filter: CountFilter;
  categoryName: string | null;
  startedAt: Date;
  startedByName: string;
  appliedAt: Date | null;
  totalItems: number;
  countedItems: number;
}

export async function listCounts(
  opts: { status?: CountStatus | ""; page?: number; pageSize?: number; dbx?: DbOrTx } = {},
): Promise<{ rows: CountListRow[]; total: number }> {
  const dbx = opts.dbx ?? db;
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? 25);
  const where: SQL | undefined = opts.status ? eq(stockCounts.status, opts.status) : undefined;

  const rows = await dbx
    .select({
      id: stockCounts.id,
      number: stockCounts.number,
      status: stockCounts.status,
      blind: stockCounts.blind,
      filter: stockCounts.filter,
      categoryName: categories.name,
      startedAt: stockCounts.startedAt,
      startedByName: users.name,
      appliedAt: stockCounts.appliedAt,
      totalItems: sql<number>`(select count(*)::int from ${stockCountItems} i where i.count_id = ${stockCounts.id})`,
      countedItems: sql<number>`(select count(*)::int from ${stockCountItems} i where i.count_id = ${stockCounts.id} and i.counted_qty is not null)`,
    })
    .from(stockCounts)
    .innerJoin(users, eq(users.id, stockCounts.startedBy))
    .leftJoin(categories, sql`${categories.id}::text = ${stockCounts.filter}->>'categoryId'`)
    .where(where)
    .orderBy(desc(stockCounts.startedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [agg] = await dbx.select({ count: sql<number>`count(*)::int` }).from(stockCounts).where(where);
  return { rows: rows.map((r) => ({ ...r, filter: (r.filter ?? {}) as CountFilter })), total: agg?.count ?? 0 };
}

export interface CountItemRow {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  partNumber: string | null;
  locationCode: string | null;
  unitSymbol: string;
  unitDecimals: number;
  expectedQty: string;
  countedQty: string | null;
  difference: string | null;
  costAvgUsd: string;
  countedAt: Date | null;
  /** Physical stock right now (may differ from expected if there were movements). */
  currentStock: string;
}

export interface CountDetail {
  id: string;
  number: string | null;
  status: CountStatus;
  blind: boolean;
  filter: CountFilter;
  categoryName: string | null;
  notes: string | null;
  startedAt: Date;
  startedByName: string;
  appliedAt: Date | null;
  appliedByName: string | null;
  items: CountItemRow[];
  totalItems: number;
  countedItems: number;
  differences: number;
  /** Net value of the differences at average cost (positive = surplus). */
  differenceValueUsd: string;
}

export async function getCount(id: string, dbx: DbOrTx = db): Promise<CountDetail | null> {
  const starter = alias(users, "starter");
  const applier = alias(users, "applier");
  const [row] = await dbx
    .select({
      id: stockCounts.id,
      number: stockCounts.number,
      status: stockCounts.status,
      blind: stockCounts.blind,
      filter: stockCounts.filter,
      categoryName: categories.name,
      notes: stockCounts.notes,
      startedAt: stockCounts.startedAt,
      startedByName: starter.name,
      appliedAt: stockCounts.appliedAt,
      appliedByName: applier.name,
      warehouseId: stockCounts.warehouseId,
    })
    .from(stockCounts)
    .innerJoin(starter, eq(starter.id, stockCounts.startedBy))
    .leftJoin(applier, eq(applier.id, stockCounts.appliedBy))
    .leftJoin(categories, sql`${categories.id}::text = ${stockCounts.filter}->>'categoryId'`)
    .where(eq(stockCounts.id, id))
    .limit(1);
  if (!row) return null;

  const items = await dbx
    .select({
      id: stockCountItems.id,
      productId: stockCountItems.productId,
      productName: products.name,
      sku: products.sku,
      partNumber: products.partNumber,
      locationCode: products.locationCode,
      unitSymbol: units.symbol,
      unitDecimals: units.decimals,
      expectedQty: stockCountItems.expectedQty,
      countedQty: stockCountItems.countedQty,
      difference: stockCountItems.difference,
      costAvgUsd: products.costAvgUsd,
      countedAt: stockCountItems.countedAt,
      currentStock: sql<string>`coalesce(${stockLevels.quantity}, 0)`,
    })
    .from(stockCountItems)
    .innerJoin(products, eq(products.id, stockCountItems.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, row.warehouseId)))
    .where(eq(stockCountItems.countId, id))
    .orderBy(asc(products.locationCode), asc(products.name));

  const counted = items.filter((i) => i.countedQty !== null);
  const diffs = counted.filter((i) => !D(i.difference).isZero());
  const value = diffs.reduce((acc, i) => acc.plus(D(i.difference).mul(D(i.costAvgUsd))), D(0));

  return {
    ...row,
    filter: (row.filter ?? {}) as CountFilter,
    items,
    totalItems: items.length,
    countedItems: counted.length,
    differences: diffs.length,
    differenceValueUsd: value.toFixed(4),
  };
}
