import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { adjustmentReasons, inventoryMovements, products, units, users, type MovementType } from "@/db/schema";
import { DEFAULT_TZ } from "@/lib/format";
import { MOVEMENT_TYPES } from "./labels";

export function isMovementType(value: unknown): value is MovementType {
  return typeof value === "string" && (MOVEMENT_TYPES as string[]).includes(value);
}

/** Start of a business day (yyyy-MM-dd) as an absolute instant. */
export function dayStart(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new TZDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]), DEFAULT_TZ);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getTime());
}

/** First instant of the day after `date`. */
export function dayEnd(date: string): Date | null {
  const start = dayStart(date);
  if (!start) return null;
  return new Date(addDays(new TZDate(start.getTime(), DEFAULT_TZ), 1).getTime());
}

export interface MovementFilters {
  productId?: string;
  type?: MovementType | "";
  /** yyyy-MM-dd inclusive. */
  from?: string;
  /** yyyy-MM-dd inclusive. */
  to?: string;
  userId?: string;
  referenceType?: string;
  referenceId?: string;
}

export interface MovementRow {
  id: number;
  createdAt: Date;
  type: MovementType;
  quantity: string;
  unitCostUsd: string;
  totalCostUsd: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  reasonName: string | null;
  userId: string | null;
  userName: string | null;
  notes: string | null;
  productId: string;
  productName: string;
  productSku: string;
  partNumber: string | null;
  unitSymbol: string;
  unitDecimals: number;
}

function buildWhere(f: MovementFilters): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  if (f.productId) conds.push(eq(inventoryMovements.productId, f.productId));
  if (f.type) conds.push(eq(inventoryMovements.type, f.type));
  if (f.userId) conds.push(eq(inventoryMovements.userId, f.userId));
  if (f.referenceType) conds.push(eq(inventoryMovements.referenceType, f.referenceType));
  if (f.referenceId) conds.push(eq(inventoryMovements.referenceId, f.referenceId));
  if (f.from) {
    const start = dayStart(f.from);
    if (start) conds.push(gte(inventoryMovements.createdAt, start));
  }
  if (f.to) {
    const end = dayEnd(f.to);
    if (end) conds.push(lt(inventoryMovements.createdAt, end));
  }
  return conds.length ? and(...conds) : undefined;
}

export async function listMovements(
  opts: MovementFilters & { page?: number; pageSize?: number; dbx?: DbOrTx } = {},
): Promise<{ rows: MovementRow[]; total: number }> {
  const dbx = opts.dbx ?? db;
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? 50);
  const where = buildWhere(opts);

  const rows = await dbx
    .select({
      id: inventoryMovements.id,
      createdAt: inventoryMovements.createdAt,
      type: inventoryMovements.type,
      quantity: inventoryMovements.quantity,
      unitCostUsd: inventoryMovements.unitCostUsd,
      totalCostUsd: inventoryMovements.totalCostUsd,
      balanceAfter: inventoryMovements.balanceAfter,
      referenceType: inventoryMovements.referenceType,
      referenceId: inventoryMovements.referenceId,
      reasonName: adjustmentReasons.name,
      userId: inventoryMovements.userId,
      userName: users.name,
      notes: inventoryMovements.notes,
      productId: products.id,
      productName: products.name,
      productSku: products.sku,
      partNumber: products.partNumber,
      unitSymbol: units.symbol,
      unitDecimals: units.decimals,
    })
    .from(inventoryMovements)
    .innerJoin(products, eq(products.id, inventoryMovements.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(users, eq(users.id, inventoryMovements.userId))
    .leftJoin(adjustmentReasons, eq(adjustmentReasons.id, inventoryMovements.reasonId))
    .where(where)
    .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [agg] = await dbx.select({ count: sql<number>`count(*)::int` }).from(inventoryMovements).where(where);
  return { rows, total: agg?.count ?? 0 };
}

/** Users that have registered at least one movement (for the kardex filter). */
export async function listMovementUsers(dbx: DbOrTx = db): Promise<Array<{ id: string; name: string }>> {
  return dbx
    .selectDistinct({ id: users.id, name: users.name })
    .from(inventoryMovements)
    .innerJoin(users, eq(users.id, inventoryMovements.userId))
    .orderBy(users.name);
}
