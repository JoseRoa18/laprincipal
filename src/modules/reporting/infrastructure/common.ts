import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { saleItems } from "@/db/schema";
import { DEFAULT_TZ } from "@/lib/format";
import { getDefaultLocation } from "@/modules/core/application/context";

/** Sale statuses that count as sold (voided and held never do). */
export const SOLD_STATUSES = ["completed", "partially_refunded", "refunded"] as const;

export interface ScopeOptions {
  db?: DbOrTx;
  warehouseId?: string;
  tz?: string;
}

export interface Scope {
  dbx: DbOrTx;
  warehouseId: string;
  tz: string;
}

/** Resolves the database handle, warehouse and time zone for a report. */
export async function resolveScope(opts: ScopeOptions = {}): Promise<Scope> {
  const dbx = opts.db ?? db;
  const warehouseId = opts.warehouseId ?? (await getDefaultLocation(dbx)).warehouseId;
  return { dbx, warehouseId, tz: opts.tz ?? DEFAULT_TZ };
}

const TZ_RE = /^[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+)*$/;

/**
 * Time zone as an SQL literal. It must be inlined (not a bound parameter):
 * Postgres only accepts a GROUP BY expression when it is textually identical
 * to the SELECT one, and Drizzle would bind a fresh parameter for each use.
 * The value comes from configuration, never from user input, and is validated.
 */
function tzLiteral(tz: string): SQL {
  if (!TZ_RE.test(tz)) throw new Error(`Invalid time zone: ${tz}`);
  return sql.raw(`'${tz}'`);
}

/** `yyyy-MM-dd` of a timestamptz column in the business time zone. */
export function dayExpr(column: PgColumn | SQL, tz: string): SQL<string> {
  return sql<string>`to_char(${column} at time zone ${tzLiteral(tz)}, 'YYYY-MM-DD')`;
}

/** Hour of the day (0-23) of a timestamptz column in the business time zone. */
export function hourExpr(column: PgColumn | SQL, tz: string): SQL<number> {
  return sql<number>`extract(hour from ${column} at time zone ${tzLiteral(tz)})::int`;
}

/** Units actually kept by the customer: quantity minus what was returned. */
export const netQty = sql`(${saleItems.quantity} - ${saleItems.returnedQty})`;

/** Line revenue (tax included) prorated to the units not returned. */
export const netLineTotal = sql`(case when ${saleItems.quantity} = 0 then 0 else ${saleItems.lineTotalUsd} * ${netQty} / ${saleItems.quantity} end)`;

/** Line revenue without tax, prorated to the units not returned. */
export const netLineBase = sql`(case when ${saleItems.quantity} = 0 then 0 else (${saleItems.lineTotalUsd} - ${saleItems.taxUsd}) * ${netQty} / ${saleItems.quantity} end)`;

/** Historical cost of the units not returned. */
export const netLineCost = sql`(${saleItems.unitCostUsd} * ${netQty})`;

/** `coalesce(sum(expr), 0)` as a numeric string. */
export function sumOf(expr: SQL | PgColumn): SQL<string> {
  return sql<string>`coalesce(sum(${expr}), 0)`;
}

/** Percentage change between two amounts; null when there is no base to compare. */
export function pctChange(current: string | number, previous: string | number): number | null {
  const prev = Number(previous);
  const cur = Number(current);
  if (!Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}
