import Decimal from "decimal.js";
import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { inventoryMovements, stockLevels, type MovementType } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { D, toMoneyDb, toQtyDb, type Num } from "@/lib/money";

export interface StockRow {
  productId: string;
  warehouseId: string;
  quantity: Decimal;
  reservedQty: Decimal;
}

/**
 * Make sure stock rows exist and lock them (FOR UPDATE) in a deterministic
 * order so concurrent transactions never deadlock. Call this once at the
 * start of any transaction that will move stock for several products.
 */
export async function lockStock(tx: Tx, productIds: string[], warehouseId: string): Promise<Map<string, StockRow>> {
  const ids = [...new Set(productIds)].sort();
  if (ids.length === 0) return new Map();

  await tx
    .insert(stockLevels)
    .values(ids.map((productId) => ({ productId, warehouseId })))
    .onConflictDoNothing();

  const rows = await tx
    .select()
    .from(stockLevels)
    .where(and(inArray(stockLevels.productId, ids), eq(stockLevels.warehouseId, warehouseId)))
    .orderBy(stockLevels.productId)
    .for("update");

  const map = new Map<string, StockRow>();
  for (const r of rows) {
    map.set(r.productId, { productId: r.productId, warehouseId: r.warehouseId, quantity: D(r.quantity), reservedQty: D(r.reservedQty) });
  }
  return map;
}

export interface MovementInput {
  productId: string;
  warehouseId: string;
  type: MovementType;
  /** Signed quantity: positive inbound, negative outbound. */
  quantity: Num;
  /** Cost per unit in USD at the time of the movement (weighted average for outbound). */
  unitCostUsd?: Num;
  referenceType?: string;
  referenceId?: string | null;
  reasonId?: string | null;
  userId: string;
  notes?: string | null;
  /** Policy: allow the balance to go below zero. */
  allowNegative?: boolean;
}

export interface MovementResult {
  movementId: number;
  balanceBefore: Decimal;
  balanceAfter: Decimal;
}

/**
 * Apply one stock movement: updates stock_levels and inserts the kardex row
 * with the resulting balance. Locks the stock row if it was not locked yet.
 * Must run inside a transaction.
 */
export async function applyMovement(tx: Tx, input: MovementInput): Promise<MovementResult> {
  const qty = D(input.quantity);
  if (qty.isZero()) throw new AppError("VALIDATION", "La cantidad del movimiento no puede ser cero.");

  const locked = await lockStock(tx, [input.productId], input.warehouseId);
  const current = locked.get(input.productId);
  if (!current) throw new AppError("INTERNAL", "No se pudo bloquear la existencia del producto.");

  const balanceAfter = current.quantity.plus(qty);
  if (balanceAfter.lt(0) && !input.allowNegative) {
    throw new AppError("INSUFFICIENT_STOCK", "No hay existencia suficiente.", {
      productId: input.productId,
      available: current.quantity.toString(),
      requested: qty.abs().toString(),
    });
  }

  await tx
    .update(stockLevels)
    .set({ quantity: toQtyDb(balanceAfter) })
    .where(and(eq(stockLevels.productId, input.productId), eq(stockLevels.warehouseId, input.warehouseId)));

  const unitCost = D(input.unitCostUsd);
  const [mv] = await tx
    .insert(inventoryMovements)
    .values({
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: input.type,
      quantity: toQtyDb(qty),
      unitCostUsd: toMoneyDb(unitCost),
      totalCostUsd: toMoneyDb(unitCost.mul(qty.abs())),
      balanceAfter: toQtyDb(balanceAfter),
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      reasonId: input.reasonId ?? null,
      userId: input.userId,
      notes: input.notes ?? null,
    })
    .returning({ id: inventoryMovements.id });

  return { movementId: mv.id, balanceBefore: current.quantity, balanceAfter };
}

/** Apply several movements in deterministic order (locks everything first). */
export async function applyMovements(tx: Tx, inputs: MovementInput[]): Promise<MovementResult[]> {
  if (inputs.length === 0) return [];
  const warehouseId = inputs[0].warehouseId;
  await lockStock(
    tx,
    inputs.map((i) => i.productId),
    warehouseId,
  );
  const results: MovementResult[] = [];
  for (const input of inputs) results.push(await applyMovement(tx, input));
  return results;
}

/** Adjust the reserved quantity (quotes/orders). Positive reserves, negative releases. */
export async function adjustReserved(tx: Tx, productId: string, warehouseId: string, delta: Num): Promise<Decimal> {
  const locked = await lockStock(tx, [productId], warehouseId);
  const current = locked.get(productId)!;
  const next = Decimal.max(current.reservedQty.plus(D(delta)), 0);
  await tx
    .update(stockLevels)
    .set({ reservedQty: toQtyDb(next) })
    .where(and(eq(stockLevels.productId, productId), eq(stockLevels.warehouseId, warehouseId)));
  return next;
}
