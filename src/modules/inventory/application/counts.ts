import { and, eq, exists, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import {
  adjustmentReasons,
  categories,
  inventoryMovements,
  products,
  stockCountItems,
  stockCounts,
  stockLevels,
  stockSettings,
} from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { D, toQtyDb } from "@/lib/money";
import { writeAudit } from "@/modules/core/application/audit";
import { getDefaultLocation } from "@/modules/core/application/context";
import { nextDocumentNumber } from "@/modules/core/application/numbering";
import { getSetting } from "@/modules/settings/infrastructure/settings";
import { applyMovements, type MovementInput } from "./stock";
import type { CountAddItemInput, CountCreateInput, CountItemInput } from "./schemas";
import { inTransaction } from "./transaction";

export interface Actor {
  id: string;
}

export const COUNT_REASON_NAME = "Error de conteo";

export interface CountFilter {
  categoryId?: string | null;
  locationPrefix?: string | null;
}

/**
 * Open a physical count: snapshots the expected quantity of every active
 * product that matches the filter and has a stock or settings row.
 */
export async function createCount(input: CountCreateInput, actor: Actor, dbx: DbOrTx = db): Promise<{ id: string; itemCount: number }> {
  return inTransaction(dbx, async (tx) => {
    const { warehouseId } = await getDefaultLocation(tx);
    const categoryId = input.categoryId || null;
    const locationPrefix = input.locationPrefix?.trim() || null;

    const conds = [
      isNull(products.deletedAt),
      eq(products.isActive, true),
      or(
        exists(tx.select({ one: sql`1` }).from(stockLevels).where(and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, warehouseId)))),
        exists(tx.select({ one: sql`1` }).from(stockSettings).where(and(eq(stockSettings.productId, products.id), eq(stockSettings.warehouseId, warehouseId)))),
      ),
    ];
    if (categoryId) conds.push(or(eq(products.categoryId, categoryId), eq(categories.parentId, categoryId)));
    if (locationPrefix) conds.push(ilike(products.locationCode, `${locationPrefix.replace(/[%_]/g, "")}%`));

    const matches = await tx
      .select({ productId: products.id, quantity: sql<string>`coalesce(${stockLevels.quantity}, 0)` })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, warehouseId)))
      .where(and(...conds))
      .orderBy(products.locationCode, products.name);

    if (matches.length === 0) throw new AppError("VALIDATION", "No hay productos que contar con ese filtro. Prueba con otra categoría o ubicación.");

    const filter: CountFilter = { categoryId, locationPrefix };
    const [count] = await tx
      .insert(stockCounts)
      .values({ warehouseId, filter, blind: input.blind, notes: input.notes || null, startedBy: actor.id, status: "open" })
      .returning();
    await tx.insert(stockCountItems).values(matches.map((m) => ({ countId: count.id, productId: m.productId, expectedQty: toQtyDb(m.quantity) })));
    await writeAudit(tx, { userId: actor.id, action: "count.create", entityType: "stock_count", entityId: count.id, after: { ...count, items: matches.length } });
    return { id: count.id, itemCount: matches.length };
  });
}

async function loadOpenCount(tx: DbOrTx, countId: string, forUpdate = false) {
  const base = tx.select().from(stockCounts).where(eq(stockCounts.id, countId));
  const [count] = forUpdate ? await base.for("update") : await base;
  if (!count) throw notFound("El conteo");
  if (count.status !== "open") throw new AppError("INVALID_STATE", "Este conteo ya fue aplicado o cancelado.");
  return count;
}

/** Record (or clear) the counted quantity of one item. */
export async function recordCountItem(input: CountItemInput, actor: Actor, dbx: DbOrTx = db) {
  await loadOpenCount(dbx, input.countId);
  const [item] = await dbx
    .select()
    .from(stockCountItems)
    .where(and(eq(stockCountItems.id, input.itemId), eq(stockCountItems.countId, input.countId)))
    .limit(1);
  if (!item) throw notFound("El producto del conteo");

  const counted = input.countedQty === null ? null : D(input.countedQty);
  const [updated] = await dbx
    .update(stockCountItems)
    .set({
      countedQty: counted === null ? null : toQtyDb(counted),
      difference: counted === null ? null : toQtyDb(counted.minus(D(item.expectedQty))),
      countedBy: counted === null ? null : actor.id,
      countedAt: counted === null ? null : new Date(),
    })
    .where(eq(stockCountItems.id, item.id))
    .returning();
  return updated;
}

/** Add a product found during the count that was not in the initial list. */
export async function addCountItem(input: CountAddItemInput, actor: Actor, dbx: DbOrTx = db) {
  const count = await loadOpenCount(dbx, input.countId);
  const [existing] = await dbx
    .select()
    .from(stockCountItems)
    .where(and(eq(stockCountItems.countId, count.id), eq(stockCountItems.productId, input.productId)))
    .limit(1);
  if (existing) return existing;

  const [product] = await dbx
    .select({ id: products.id, deletedAt: products.deletedAt, quantity: sql<string>`coalesce(${stockLevels.quantity}, 0)` })
    .from(products)
    .leftJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, count.warehouseId)))
    .where(eq(products.id, input.productId))
    .limit(1);
  if (!product || product.deletedAt) throw notFound("El producto");

  const [item] = await dbx
    .insert(stockCountItems)
    .values({ countId: count.id, productId: product.id, expectedQty: toQtyDb(product.quantity) })
    .returning();
  await writeAudit(dbx, { userId: actor.id, action: "count.add_item", entityType: "stock_count", entityId: count.id, after: item });
  return item;
}

/**
 * Apply a count: every counted item whose difference is not zero generates a
 * `count_adjust` movement with the reason "Error de conteo". Items that were
 * not counted are left untouched.
 */
export async function applyCount(id: string, actor: Actor, dbx: DbOrTx = db): Promise<{ id: string; number: string; adjusted: number }> {
  return inTransaction(dbx, async (tx) => {
    const count = await loadOpenCount(tx, id, true);
    const items = await tx.select().from(stockCountItems).where(eq(stockCountItems.countId, id));
    const counted = items.filter((it) => it.countedQty !== null);
    if (counted.length === 0) throw new AppError("VALIDATION", "Todavía no has contado ningún producto.");

    const policies = await getSetting("policies", tx);
    const number = count.number ?? (await nextDocumentNumber(tx, "count"));
    const [reason] = await tx.select({ id: adjustmentReasons.id }).from(adjustmentReasons).where(eq(adjustmentReasons.name, COUNT_REASON_NAME)).limit(1);

    const diffs = counted.filter((it) => !D(it.difference ?? 0).isZero());
    const productIds = [...new Set(diffs.map((d) => d.productId))];
    const prods = productIds.length
      ? await tx.select({ id: products.id, costAvgUsd: products.costAvgUsd }).from(products).where(inArray(products.id, productIds))
      : [];
    const cost = new Map(prods.map((p) => [p.id, p.costAvgUsd]));

    const movements: MovementInput[] = diffs.map((it) => ({
      productId: it.productId,
      warehouseId: count.warehouseId,
      type: "count_adjust",
      quantity: D(it.difference),
      unitCostUsd: cost.get(it.productId) ?? "0",
      referenceType: "count",
      referenceId: count.id,
      reasonId: reason?.id ?? null,
      userId: actor.id,
      allowNegative: policies.allowNegativeStock,
    }));
    const results = await applyMovements(tx, movements);

    const [updated] = await tx
      .update(stockCounts)
      .set({ number, status: "applied", appliedBy: actor.id, appliedAt: new Date() })
      .where(eq(stockCounts.id, id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      action: "count.apply",
      entityType: "stock_count",
      entityId: id,
      before: count,
      after: { ...updated, adjusted: diffs.length, movements: results.map((r) => r.movementId) },
    });
    return { id, number, adjusted: diffs.length };
  });
}

export async function cancelCount(id: string, actor: Actor, dbx: DbOrTx = db): Promise<void> {
  return inTransaction(dbx, async (tx) => {
    const count = await loadOpenCount(tx, id, true);
    const [updated] = await tx.update(stockCounts).set({ status: "cancelled" }).where(eq(stockCounts.id, id)).returning();
    await writeAudit(tx, { userId: actor.id, action: "count.cancel", entityType: "stock_count", entityId: id, before: count, after: updated });
  });
}

/** Movements generated by a count (for the detail screen after applying). */
export async function countMovementIds(countId: string, dbx: DbOrTx = db): Promise<number[]> {
  const rows = await dbx
    .select({ id: inventoryMovements.id })
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.referenceType, "count"), eq(inventoryMovements.referenceId, countId)));
  return rows.map((r) => r.id);
}
