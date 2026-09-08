import { eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { adjustmentReasons, inventoryAdjustmentItems, inventoryAdjustments, products, type MovementType } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { D, toMoneyDb, toQtyDb } from "@/lib/money";
import { writeAudit } from "@/modules/core/application/audit";
import { getDefaultLocation } from "@/modules/core/application/context";
import { nextDocumentNumber } from "@/modules/core/application/numbering";
import { getSetting } from "@/modules/settings/infrastructure/settings";
import { weightedAverageCost } from "../domain/costing";
import { applyMovements, type MovementInput } from "./stock";
import type { AdjustmentInput } from "./schemas";
import { inTransaction } from "./transaction";

export interface Actor {
  id: string;
}

/**
 * Create or update an adjustment in draft state. Lines are replaced as a whole.
 * The sign of each line comes from the reason kind (increase/decrease) or, for
 * "both" reasons, from the direction chosen by the user.
 */
export async function saveAdjustmentDraft(input: AdjustmentInput, actor: Actor, dbx: DbOrTx = db): Promise<{ id: string }> {
  return inTransaction(dbx, async (tx) => {
    const [reason] = await tx.select().from(adjustmentReasons).where(eq(adjustmentReasons.id, input.reasonId)).limit(1);
    if (!reason || !reason.isActive) throw new AppError("VALIDATION", "El motivo no existe o está inactivo.", { fields: { reasonId: "Elige un motivo válido." } });

    const productIds = [...new Set(input.lines.map((l) => l.productId))];
    const prods = await tx
      .select({ id: products.id, name: products.name, costAvgUsd: products.costAvgUsd, deletedAt: products.deletedAt })
      .from(products)
      .where(inArray(products.id, productIds));
    const byId = new Map(prods.map((p) => [p.id, p]));
    for (const id of productIds) {
      const p = byId.get(id);
      if (!p || p.deletedAt) throw new AppError("VALIDATION", "Uno de los productos ya no existe.");
    }

    const items = input.lines.map((line) => {
      const product = byId.get(line.productId)!;
      const direction = reason.kind === "increase" ? "in" : reason.kind === "decrease" ? "out" : line.direction;
      const qty = D(line.quantity);
      const unitCost = direction === "in" && line.unitCostUsd !== undefined ? D(line.unitCostUsd) : D(product.costAvgUsd);
      return {
        productId: line.productId,
        quantityDelta: toQtyDb(direction === "in" ? qty : qty.neg()),
        unitCostUsd: toMoneyDb(unitCost),
        notes: line.notes || null,
      };
    });

    const { warehouseId } = await getDefaultLocation(tx);

    if (input.id) {
      const [existing] = await tx.select().from(inventoryAdjustments).where(eq(inventoryAdjustments.id, input.id)).for("update");
      if (!existing) throw notFound("El ajuste");
      if (existing.status !== "draft") throw new AppError("INVALID_STATE", "Solo se puede editar un ajuste en borrador.");
      await tx
        .update(inventoryAdjustments)
        .set({ reasonId: reason.id, notes: input.notes || null })
        .where(eq(inventoryAdjustments.id, existing.id));
      await tx.delete(inventoryAdjustmentItems).where(eq(inventoryAdjustmentItems.adjustmentId, existing.id));
      await tx.insert(inventoryAdjustmentItems).values(items.map((it) => ({ ...it, adjustmentId: existing.id })));
      await writeAudit(tx, {
        userId: actor.id,
        action: "adjustment.update",
        entityType: "inventory_adjustment",
        entityId: existing.id,
        before: existing,
        after: { reasonId: reason.id, notes: input.notes ?? null, items },
      });
      return { id: existing.id };
    }

    const [created] = await tx
      .insert(inventoryAdjustments)
      .values({ warehouseId, reasonId: reason.id, notes: input.notes || null, createdBy: actor.id, status: "draft" })
      .returning();
    await tx.insert(inventoryAdjustmentItems).values(items.map((it) => ({ ...it, adjustmentId: created.id })));
    await writeAudit(tx, {
      userId: actor.id,
      action: "adjustment.create",
      entityType: "inventory_adjustment",
      entityId: created.id,
      after: { ...created, items },
    });
    return { id: created.id };
  });
}

/**
 * Apply a draft adjustment: assigns the document number, moves stock through
 * the kardex (adjust_in / adjust_out) and, for increases with an explicit cost,
 * folds that cost into the product's weighted average.
 */
export async function applyAdjustment(id: string, actor: Actor, dbx: DbOrTx = db): Promise<{ id: string; number: string }> {
  return inTransaction(dbx, async (tx) => {
    const [adj] = await tx.select().from(inventoryAdjustments).where(eq(inventoryAdjustments.id, id)).for("update");
    if (!adj) throw notFound("El ajuste");
    if (adj.status !== "draft") throw new AppError("INVALID_STATE", "Este ajuste ya fue aplicado o cancelado.");

    const items = await tx.select().from(inventoryAdjustmentItems).where(eq(inventoryAdjustmentItems.adjustmentId, id));
    if (items.length === 0) throw new AppError("VALIDATION", "El ajuste no tiene productos.");

    const policies = await getSetting("policies", tx);
    const number = await nextDocumentNumber(tx, "adjustment");

    const movements: MovementInput[] = items.map((it) => {
      const delta = D(it.quantityDelta);
      const type: MovementType = delta.gt(0) ? "adjust_in" : "adjust_out";
      return {
        productId: it.productId,
        warehouseId: adj.warehouseId,
        type,
        quantity: delta,
        unitCostUsd: it.unitCostUsd,
        referenceType: "adjustment",
        referenceId: adj.id,
        reasonId: adj.reasonId,
        userId: actor.id,
        notes: it.notes,
        allowNegative: policies.allowNegativeStock,
      };
    });
    const results = await applyMovements(tx, movements);

    // Weighted average for increases (only changes the average when the cost differs).
    const productIds = [...new Set(items.map((i) => i.productId))];
    const prods = await tx.select({ id: products.id, costAvgUsd: products.costAvgUsd }).from(products).where(inArray(products.id, productIds));
    const avg = new Map(prods.map((p) => [p.id, D(p.costAvgUsd)]));
    const changed = new Set<string>();
    items.forEach((it, i) => {
      const delta = D(it.quantityDelta);
      if (delta.lte(0)) return;
      const current = avg.get(it.productId) ?? D(0);
      const next = weightedAverageCost(results[i].balanceBefore, current, delta, it.unitCostUsd);
      if (!next.eq(current)) {
        avg.set(it.productId, next);
        changed.add(it.productId);
      }
    });
    for (const pid of changed) {
      await tx.update(products).set({ costAvgUsd: toMoneyDb(avg.get(pid)) }).where(eq(products.id, pid));
    }

    const [updated] = await tx
      .update(inventoryAdjustments)
      .set({ number, status: "applied", appliedBy: actor.id, appliedAt: new Date() })
      .where(eq(inventoryAdjustments.id, id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      action: "adjustment.apply",
      entityType: "inventory_adjustment",
      entityId: id,
      before: adj,
      after: { ...updated, movements: results.map((r) => r.movementId) },
    });
    return { id, number };
  });
}

export async function cancelAdjustment(id: string, actor: Actor, dbx: DbOrTx = db): Promise<void> {
  return inTransaction(dbx, async (tx) => {
    const [adj] = await tx.select().from(inventoryAdjustments).where(eq(inventoryAdjustments.id, id)).for("update");
    if (!adj) throw notFound("El ajuste");
    if (adj.status !== "draft") throw new AppError("INVALID_STATE", "Solo se puede cancelar un ajuste en borrador.");
    const [updated] = await tx.update(inventoryAdjustments).set({ status: "cancelled" }).where(eq(inventoryAdjustments.id, id)).returning();
    await writeAudit(tx, { userId: actor.id, action: "adjustment.cancel", entityType: "inventory_adjustment", entityId: id, before: adj, after: updated });
  });
}
