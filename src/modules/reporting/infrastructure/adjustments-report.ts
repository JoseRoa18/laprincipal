import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { adjustmentReasons, inventoryAdjustments, inventoryMovements, products, stockCounts, units, users } from "@/db/schema";
import type { MovementType } from "@/db/schema/enums";
import { allQueries } from "@/db/parallel";
import { D } from "@/lib/money";
import { dayEndExclusive, dayStart, type DateRange } from "../domain/date-range";
import { resolveScope, sumOf, type ScopeOptions } from "./common";

/**
 * Kardex movements that are adjustments: documented ones (with a reason),
 * physical counts and the generic manual in/out. Undoing an Excel import
 * also writes `adjust_out`, but it is a correction, not a loss: excluded.
 */
export const ADJUSTMENT_TYPES = ["adjust_in", "adjust_out", "count_adjust", "manual_in", "manual_out"] as const satisfies readonly MovementType[];

export interface AdjustmentGroupRow {
  id: string | null;
  name: string;
  detail: string | null;
  movements: number;
  /** Units added (positive). */
  unitsIn: string;
  /** Units removed (positive). */
  unitsOut: string;
  /** Cost of the units added, USD. */
  valueIn: string;
  /** Cost of the units removed (the loss), USD. */
  valueOut: string;
  /** valueIn − valueOut: negative means a net loss. */
  net: string;
}

export interface AdjustmentMovementRow {
  id: number;
  createdAt: Date;
  type: MovementType;
  productId: string;
  productName: string;
  sku: string;
  unitSymbol: string;
  unitDecimals: number;
  /** Signed quantity. */
  quantity: string;
  /** Signed value at the movement's unit cost, USD. */
  value: string;
  reasonName: string | null;
  userName: string | null;
  documentNumber: string | null;
  /** Screen of the source document (adjustment or count). */
  documentHref: string | null;
  notes: string | null;
}

export interface AdjustmentsReport {
  range: DateRange;
  totals: AdjustmentGroupRow;
  /** Distinct products with at least one adjustment. */
  products: number;
  byReason: AdjustmentGroupRow[];
  byProduct: AdjustmentGroupRow[];
  /** Latest movements first, up to `movementLimit`. */
  movements: AdjustmentMovementRow[];
}

const qty = inventoryMovements.quantity;
const cost = inventoryMovements.totalCostUsd;
const groupColumns = {
  movements: sql<number>`count(*)::int`,
  unitsIn: sumOf(sql`greatest(${qty}, 0)`),
  unitsOut: sumOf(sql`greatest(-${qty}, 0)`),
  valueIn: sumOf(sql`case when ${qty} > 0 then ${cost} else 0 end`),
  valueOut: sumOf(sql`case when ${qty} < 0 then ${cost} else 0 end`),
};
const netOrder = sql`sum(case when ${qty} > 0 then ${cost} else -${cost} end)`;

function toGroupRow(r: { id: string | null; name: string; detail?: string | null; movements: number; unitsIn: string; unitsOut: string; valueIn: string; valueOut: string }): AdjustmentGroupRow {
  return {
    id: r.id,
    name: r.name,
    detail: r.detail ?? null,
    movements: r.movements,
    unitsIn: D(r.unitsIn).toFixed(3),
    unitsOut: D(r.unitsOut).toFixed(3),
    valueIn: D(r.valueIn).toFixed(4),
    valueOut: D(r.valueOut).toFixed(4),
    net: D(r.valueIn).minus(D(r.valueOut)).toFixed(4),
  };
}

export async function getAdjustmentsReport(range: DateRange, opts: ScopeOptions & { movementLimit?: number } = {}): Promise<AdjustmentsReport> {
  const { dbx, warehouseId, tz } = await resolveScope(opts);
  const inRange = and(
    eq(inventoryMovements.warehouseId, warehouseId),
    inArray(inventoryMovements.type, [...ADJUSTMENT_TYPES]),
    or(isNull(inventoryMovements.referenceType), ne(inventoryMovements.referenceType, "import_job")),
    gte(inventoryMovements.createdAt, dayStart(range.from, tz)),
    lt(inventoryMovements.createdAt, dayEndExclusive(range.to, tz)),
  );
  const reasonLabel = sql<string>`coalesce(${adjustmentReasons.name}, 'Sin motivo')`;

  const [byReasonRows, byProductRows, movementRows] = await allQueries(dbx, [
    () =>
      dbx
        .select({ id: inventoryMovements.reasonId, name: reasonLabel, ...groupColumns })
        .from(inventoryMovements)
        .leftJoin(adjustmentReasons, eq(adjustmentReasons.id, inventoryMovements.reasonId))
        .where(inRange)
        .groupBy(inventoryMovements.reasonId, reasonLabel)
        .orderBy(asc(netOrder)),
    () =>
      dbx
        .select({ id: inventoryMovements.productId, name: products.name, detail: products.sku, ...groupColumns })
        .from(inventoryMovements)
        .innerJoin(products, eq(products.id, inventoryMovements.productId))
        .where(inRange)
        .groupBy(inventoryMovements.productId, products.name, products.sku)
        .orderBy(asc(netOrder), asc(products.name)),
    () =>
      dbx
        .select({
          id: inventoryMovements.id,
          createdAt: inventoryMovements.createdAt,
          type: inventoryMovements.type,
          productId: inventoryMovements.productId,
          productName: products.name,
          sku: products.sku,
          unitSymbol: units.symbol,
          unitDecimals: units.decimals,
          quantity: inventoryMovements.quantity,
          totalCostUsd: inventoryMovements.totalCostUsd,
          reasonName: adjustmentReasons.name,
          userName: users.name,
          referenceType: inventoryMovements.referenceType,
          referenceId: inventoryMovements.referenceId,
          adjustmentNumber: inventoryAdjustments.number,
          countNumber: stockCounts.number,
          notes: inventoryMovements.notes,
        })
        .from(inventoryMovements)
        .innerJoin(products, eq(products.id, inventoryMovements.productId))
        .innerJoin(units, eq(units.id, products.unitId))
        .leftJoin(adjustmentReasons, eq(adjustmentReasons.id, inventoryMovements.reasonId))
        .leftJoin(users, eq(users.id, inventoryMovements.userId))
        .leftJoin(inventoryAdjustments, and(eq(inventoryMovements.referenceType, "adjustment"), eq(inventoryAdjustments.id, inventoryMovements.referenceId)))
        .leftJoin(stockCounts, and(eq(inventoryMovements.referenceType, "count"), eq(stockCounts.id, inventoryMovements.referenceId)))
        .where(inRange)
        .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
        .limit(opts.movementLimit ?? 500),
  ]);

  const byReason = byReasonRows.map(toGroupRow);
  const byProduct = byProductRows.map(toGroupRow);
  const totals = toGroupRow({
    id: null,
    name: "Total",
    movements: byReason.reduce((acc, r) => acc + r.movements, 0),
    unitsIn: byReason.reduce((acc, r) => acc.plus(D(r.unitsIn)), D(0)).toFixed(3),
    unitsOut: byReason.reduce((acc, r) => acc.plus(D(r.unitsOut)), D(0)).toFixed(3),
    valueIn: byReason.reduce((acc, r) => acc.plus(D(r.valueIn)), D(0)).toFixed(4),
    valueOut: byReason.reduce((acc, r) => acc.plus(D(r.valueOut)), D(0)).toFixed(4),
  });

  const movements: AdjustmentMovementRow[] = movementRows.map((m) => {
    const signed = D(m.quantity).isNegative() ? D(m.totalCostUsd).neg() : D(m.totalCostUsd);
    const documentHref =
      m.referenceType === "adjustment" && m.referenceId
        ? `/inventario/ajustes/${m.referenceId}`
        : m.referenceType === "count" && m.referenceId
          ? `/inventario/conteos/${m.referenceId}`
          : null;
    return {
      id: m.id,
      createdAt: m.createdAt,
      type: m.type,
      productId: m.productId,
      productName: m.productName,
      sku: m.sku,
      unitSymbol: m.unitSymbol,
      unitDecimals: m.unitDecimals,
      quantity: m.quantity,
      value: signed.toFixed(4),
      reasonName: m.reasonName,
      userName: m.userName,
      documentNumber: m.adjustmentNumber ?? m.countNumber ?? null,
      documentHref,
      notes: m.notes,
    };
  });

  return { range, totals, products: byProduct.length, byReason, byProduct, movements };
}
