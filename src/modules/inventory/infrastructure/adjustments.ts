import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { adjustmentReasons, inventoryAdjustmentItems, inventoryAdjustments, products, stockLevels, units, users } from "@/db/schema";

export type AdjustmentStatus = "draft" | "applied" | "cancelled";

export interface AdjustmentListRow {
  id: string;
  number: string | null;
  status: AdjustmentStatus;
  reasonName: string;
  notes: string | null;
  createdAt: Date;
  appliedAt: Date | null;
  createdByName: string;
  itemCount: number;
}

export async function listAdjustments(
  opts: { status?: AdjustmentStatus | ""; page?: number; pageSize?: number; dbx?: DbOrTx } = {},
): Promise<{ rows: AdjustmentListRow[]; total: number }> {
  const dbx = opts.dbx ?? db;
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? 25);
  const where: SQL | undefined = opts.status ? eq(inventoryAdjustments.status, opts.status) : undefined;

  const itemCount = sql<number>`(select count(*)::int from ${inventoryAdjustmentItems} i where i.adjustment_id = ${inventoryAdjustments.id})`;
  const rows = await dbx
    .select({
      id: inventoryAdjustments.id,
      number: inventoryAdjustments.number,
      status: inventoryAdjustments.status,
      reasonName: adjustmentReasons.name,
      notes: inventoryAdjustments.notes,
      createdAt: inventoryAdjustments.createdAt,
      appliedAt: inventoryAdjustments.appliedAt,
      createdByName: users.name,
      itemCount,
    })
    .from(inventoryAdjustments)
    .innerJoin(adjustmentReasons, eq(adjustmentReasons.id, inventoryAdjustments.reasonId))
    .innerJoin(users, eq(users.id, inventoryAdjustments.createdBy))
    .where(where)
    .orderBy(desc(inventoryAdjustments.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [agg] = await dbx.select({ count: sql<number>`count(*)::int` }).from(inventoryAdjustments).where(where);
  return { rows, total: agg?.count ?? 0 };
}

export interface AdjustmentItemRow {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  partNumber: string | null;
  unitSymbol: string;
  unitDecimals: number;
  quantityDelta: string;
  unitCostUsd: string;
  notes: string | null;
  /** Current physical stock (for previews while the adjustment is a draft). */
  currentStock: string;
  costAvgUsd: string;
}

export interface AdjustmentDetail {
  id: string;
  number: string | null;
  status: AdjustmentStatus;
  reasonId: string;
  reasonName: string;
  reasonKind: "increase" | "decrease" | "both";
  notes: string | null;
  createdAt: Date;
  createdByName: string;
  appliedAt: Date | null;
  appliedByName: string | null;
  items: AdjustmentItemRow[];
}

export async function getAdjustment(id: string, dbx: DbOrTx = db): Promise<AdjustmentDetail | null> {
  const creator = alias(users, "creator");
  const applier = alias(users, "applier");
  const [row] = await dbx
    .select({
      id: inventoryAdjustments.id,
      number: inventoryAdjustments.number,
      status: inventoryAdjustments.status,
      reasonId: inventoryAdjustments.reasonId,
      reasonName: adjustmentReasons.name,
      reasonKind: adjustmentReasons.kind,
      notes: inventoryAdjustments.notes,
      createdAt: inventoryAdjustments.createdAt,
      createdByName: creator.name,
      appliedAt: inventoryAdjustments.appliedAt,
      appliedByName: applier.name,
      warehouseId: inventoryAdjustments.warehouseId,
    })
    .from(inventoryAdjustments)
    .innerJoin(adjustmentReasons, eq(adjustmentReasons.id, inventoryAdjustments.reasonId))
    .innerJoin(creator, eq(creator.id, inventoryAdjustments.createdBy))
    .leftJoin(applier, eq(applier.id, inventoryAdjustments.appliedBy))
    .where(eq(inventoryAdjustments.id, id))
    .limit(1);
  if (!row) return null;

  const items = await dbx
    .select({
      id: inventoryAdjustmentItems.id,
      productId: inventoryAdjustmentItems.productId,
      productName: products.name,
      sku: products.sku,
      partNumber: products.partNumber,
      unitSymbol: units.symbol,
      unitDecimals: units.decimals,
      quantityDelta: inventoryAdjustmentItems.quantityDelta,
      unitCostUsd: inventoryAdjustmentItems.unitCostUsd,
      notes: inventoryAdjustmentItems.notes,
      currentStock: sql<string>`coalesce(${stockLevels.quantity}, 0)`,
      costAvgUsd: products.costAvgUsd,
    })
    .from(inventoryAdjustmentItems)
    .innerJoin(products, eq(products.id, inventoryAdjustmentItems.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, row.warehouseId)))
    .where(eq(inventoryAdjustmentItems.adjustmentId, id))
    .orderBy(asc(products.name));

  return { ...row, items };
}

export interface ReasonOption {
  id: string;
  name: string;
  kind: "increase" | "decrease" | "both";
}

export async function listAdjustmentReasons(dbx: DbOrTx = db): Promise<ReasonOption[]> {
  return dbx
    .select({ id: adjustmentReasons.id, name: adjustmentReasons.name, kind: adjustmentReasons.kind })
    .from(adjustmentReasons)
    .where(eq(adjustmentReasons.isActive, true))
    .orderBy(asc(adjustmentReasons.sortOrder), asc(adjustmentReasons.name));
}

export async function countDraftAdjustments(dbx: DbOrTx = db): Promise<number> {
  const [row] = await dbx.select({ count: sql<number>`count(*)::int` }).from(inventoryAdjustments).where(eq(inventoryAdjustments.status, "draft"));
  return row?.count ?? 0;
}
