import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, type DbOrTx, type Tx } from "@/db/client";
import { currencies, inventoryMovements, productSuppliers, products, purchaseReceiptItems, purchaseReceipts, suppliers } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { D, toMoneyDb, toQtyDb, toRateDb } from "@/lib/money";
import { writeAudit } from "@/modules/core/application/audit";
import { getDefaultLocation } from "@/modules/core/application/context";
import { nextDocumentNumber } from "@/modules/core/application/numbering";
import { weightedAverageCost } from "@/modules/inventory/domain/costing";
import { applyMovements, lockStock, type MovementInput } from "@/modules/inventory/application/stock";
import { inTransaction } from "@/modules/inventory/application/transaction";
import { averageAfterVoid, computeReceipt } from "../domain/receipt-math";
import type { ReceiptInput } from "./schemas";

export interface Actor {
  id: string;
}

async function validateHeader(tx: Tx, input: ReceiptInput) {
  const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
  if (!supplier || supplier.deletedAt) throw new AppError("VALIDATION", "El proveedor no existe.", { fields: { supplierId: "Elige un proveedor válido." } });
  const [currency] = await tx.select({ code: currencies.code }).from(currencies).where(eq(currencies.code, input.currencyCode)).limit(1);
  if (!currency) throw new AppError("VALIDATION", "La moneda no existe.", { fields: { currencyCode: "Elige una moneda válida." } });
  const rate = D(input.exchangeRate);
  if (input.currencyCode === "USD" && !rate.eq(1)) throw new AppError("VALIDATION", "La tasa de USD siempre es 1.", { fields: { exchangeRate: "Debe ser 1 para USD." } });

  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const prods = await tx.select({ id: products.id, deletedAt: products.deletedAt }).from(products).where(inArray(products.id, productIds));
  if (prods.length !== productIds.length || prods.some((p) => p.deletedAt)) throw new AppError("VALIDATION", "Uno de los productos ya no existe.");
  return supplier;
}

/** Create or update a receipt in draft state. Lines are replaced as a whole. */
export async function saveReceiptDraft(input: ReceiptInput, actor: Actor, dbx: DbOrTx = db): Promise<{ id: string }> {
  return inTransaction(dbx, async (tx) => {
    await validateHeader(tx, input);
    const totals = computeReceipt(
      input.lines.map((l, i) => ({ key: String(i), productId: l.productId, quantity: l.quantity, unitCostAmount: l.unitCostAmount })),
      input.exchangeRate,
      input.extraCostsUsd,
    );
    const header = {
      supplierId: input.supplierId,
      supplierDocument: input.supplierDocument || null,
      receiptDate: input.receiptDate,
      currencyCode: input.currencyCode,
      exchangeRate: toRateDb(input.exchangeRate),
      subtotalUsd: toMoneyDb(totals.subtotalUsd),
      extraCostsUsd: toMoneyDb(totals.extraCostsUsd),
      totalUsd: toMoneyDb(totals.totalUsd),
      notes: input.notes || null,
    };
    const items = totals.lines.map((l) => ({
      productId: l.productId,
      quantity: toQtyDb(l.quantity),
      unitCostAmount: toMoneyDb(l.unitCostAmount),
      unitCostUsd: toMoneyDb(l.unitCostUsd),
      extraCostShareUsd: toMoneyDb(l.extraCostShareUsd),
      unitCostFinalUsd: toMoneyDb(l.unitCostFinalUsd),
      lineTotalUsd: toMoneyDb(l.lineTotalUsd),
    }));

    if (input.id) {
      const [existing] = await tx.select().from(purchaseReceipts).where(eq(purchaseReceipts.id, input.id)).for("update");
      if (!existing) throw notFound("La entrada");
      if (existing.status !== "draft") throw new AppError("INVALID_STATE", "Solo se puede editar una entrada en borrador.");
      await tx.update(purchaseReceipts).set(header).where(eq(purchaseReceipts.id, existing.id));
      await tx.delete(purchaseReceiptItems).where(eq(purchaseReceiptItems.receiptId, existing.id));
      await tx.insert(purchaseReceiptItems).values(items.map((it) => ({ ...it, receiptId: existing.id })));
      await writeAudit(tx, { userId: actor.id, action: "purchase_receipt.update", entityType: "purchase_receipt", entityId: existing.id, before: existing, after: { ...header, items } });
      return { id: existing.id };
    }

    const { warehouseId } = await getDefaultLocation(tx);
    const [created] = await tx
      .insert(purchaseReceipts)
      .values({ ...header, warehouseId, status: "draft", createdBy: actor.id })
      .returning();
    await tx.insert(purchaseReceiptItems).values(items.map((it) => ({ ...it, receiptId: created.id })));
    await writeAudit(tx, { userId: actor.id, action: "purchase_receipt.create", entityType: "purchase_receipt", entityId: created.id, after: { ...created, items } });
    return { id: created.id };
  });
}

export async function deleteReceiptDraft(id: string, actor: Actor, dbx: DbOrTx = db): Promise<void> {
  return inTransaction(dbx, async (tx) => {
    const [existing] = await tx.select().from(purchaseReceipts).where(eq(purchaseReceipts.id, id)).for("update");
    if (!existing) throw notFound("La entrada");
    if (existing.status !== "draft") throw new AppError("INVALID_STATE", "Solo se puede eliminar una entrada en borrador.");
    await tx.delete(purchaseReceipts).where(eq(purchaseReceipts.id, id));
    await writeAudit(tx, { userId: actor.id, action: "purchase_receipt.delete", entityType: "purchase_receipt", entityId: id, before: existing });
  });
}

/**
 * Apply a draft receipt: consecutive number, `purchase_in` movements at the
 * landed unit cost, weighted average and last cost per product, and the
 * product-supplier link with the latest cost.
 */
export async function applyReceipt(id: string, actor: Actor, dbx: DbOrTx = db): Promise<{ id: string; number: string }> {
  return inTransaction(dbx, async (tx) => {
    const [receipt] = await tx.select().from(purchaseReceipts).where(eq(purchaseReceipts.id, id)).for("update");
    if (!receipt) throw notFound("La entrada");
    if (receipt.status !== "draft") throw new AppError("INVALID_STATE", "Esta entrada ya fue aplicada o anulada.");

    const items = await tx.select().from(purchaseReceiptItems).where(eq(purchaseReceiptItems.receiptId, id)).orderBy(purchaseReceiptItems.id);
    if (items.length === 0) throw new AppError("VALIDATION", "La entrada no tiene productos.");

    const productIds = [...new Set(items.map((i) => i.productId))];
    const prods = await tx
      .select({ id: products.id, name: products.name, costAvgUsd: products.costAvgUsd, deletedAt: products.deletedAt })
      .from(products)
      .where(inArray(products.id, productIds));
    if (prods.length !== productIds.length || prods.some((p) => p.deletedAt)) throw new AppError("VALIDATION", "Uno de los productos ya no existe.");

    const number = await nextDocumentNumber(tx, "purchase_receipt");

    const movements: MovementInput[] = items.map((it) => ({
      productId: it.productId,
      warehouseId: receipt.warehouseId,
      type: "purchase_in",
      quantity: it.quantity,
      unitCostUsd: it.unitCostFinalUsd,
      referenceType: "purchase_receipt",
      referenceId: receipt.id,
      userId: actor.id,
      allowNegative: true,
    }));
    const results = await applyMovements(tx, movements);

    // Running weighted average per product (a product may appear on several lines).
    const avg = new Map(prods.map((p) => [p.id, D(p.costAvgUsd)]));
    const last = new Map<string, (typeof items)[number]>();
    items.forEach((it, i) => {
      const current = avg.get(it.productId) ?? D(0);
      avg.set(it.productId, weightedAverageCost(results[i].balanceBefore, current, it.quantity, it.unitCostFinalUsd));
      last.set(it.productId, it);
    });

    const now = new Date();
    for (const pid of productIds) {
      const lastItem = last.get(pid)!;
      await tx
        .update(products)
        .set({ costAvgUsd: toMoneyDb(avg.get(pid)), costLastUsd: toMoneyDb(lastItem.unitCostFinalUsd) })
        .where(eq(products.id, pid));

      const [hasPreferred] = await tx
        .select({ productId: productSuppliers.productId })
        .from(productSuppliers)
        .where(and(eq(productSuppliers.productId, pid), eq(productSuppliers.isPreferred, true)))
        .limit(1);
      const linkValues = {
        lastCostAmount: toMoneyDb(lastItem.unitCostAmount),
        lastCostCurrency: receipt.currencyCode,
        lastCostUsd: toMoneyDb(lastItem.unitCostUsd),
        lastPurchaseAt: now,
      };
      await tx
        .insert(productSuppliers)
        .values({ productId: pid, supplierId: receipt.supplierId, isPreferred: !hasPreferred, ...linkValues })
        .onConflictDoUpdate({
          target: [productSuppliers.productId, productSuppliers.supplierId],
          set: { ...linkValues, updatedAt: now },
        });
    }

    const [updated] = await tx
      .update(purchaseReceipts)
      .set({ number, status: "applied", appliedAt: now })
      .where(eq(purchaseReceipts.id, id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      action: "purchase_receipt.apply",
      entityType: "purchase_receipt",
      entityId: id,
      before: receipt,
      after: { ...updated, movements: results.map((r) => r.movementId) },
    });
    return { id, number };
  });
}

/**
 * Void an applied receipt. Only allowed when none of its products has a later
 * movement, so the stock and the average cost can be restored exactly.
 */
export async function voidReceipt(id: string, reason: string, actor: Actor, dbx: DbOrTx = db): Promise<void> {
  return inTransaction(dbx, async (tx) => {
    const [receipt] = await tx.select().from(purchaseReceipts).where(eq(purchaseReceipts.id, id)).for("update");
    if (!receipt) throw notFound("La entrada");
    if (receipt.status !== "applied") throw new AppError("INVALID_STATE", "Solo se puede anular una entrada aplicada.");

    const items = await tx.select().from(purchaseReceiptItems).where(eq(purchaseReceiptItems.receiptId, id));
    const productIds = [...new Set(items.map((i) => i.productId))];
    const prods = await tx
      .select({ id: products.id, name: products.name, costAvgUsd: products.costAvgUsd, costLastUsd: products.costLastUsd })
      .from(products)
      .where(inArray(products.id, productIds));
    const prodById = new Map(prods.map((p) => [p.id, p]));

    // The receipt's own movements, and the latest movement of each product.
    const own = await tx
      .select({ id: inventoryMovements.id, productId: inventoryMovements.productId })
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.referenceType, "purchase_receipt"), eq(inventoryMovements.referenceId, id), eq(inventoryMovements.type, "purchase_in")));
    const ownMax = new Map<string, number>();
    const ownMin = new Map<string, number>();
    for (const m of own) {
      ownMax.set(m.productId, Math.max(ownMax.get(m.productId) ?? 0, m.id));
      ownMin.set(m.productId, Math.min(ownMin.get(m.productId) ?? Number.MAX_SAFE_INTEGER, m.id));
    }
    const latest = await tx
      .select({ productId: inventoryMovements.productId, maxId: sql<number>`max(${inventoryMovements.id})::bigint` })
      .from(inventoryMovements)
      .where(inArray(inventoryMovements.productId, productIds))
      .groupBy(inventoryMovements.productId);
    for (const l of latest) {
      const mine = ownMax.get(l.productId) ?? 0;
      if (Number(l.maxId) > mine) {
        const name = prodById.get(l.productId)?.name ?? "Un producto";
        throw new AppError("INVALID_STATE", `"${name}" tiene movimientos posteriores a esta entrada. No se puede anular.`);
      }
    }

    const stockNow = await lockStock(tx, productIds, receipt.warehouseId);

    const movements: MovementInput[] = items.map((it) => ({
      productId: it.productId,
      warehouseId: receipt.warehouseId,
      type: "purchase_void_out",
      quantity: D(it.quantity).neg(),
      unitCostUsd: it.unitCostFinalUsd,
      referenceType: "purchase_receipt",
      referenceId: receipt.id,
      userId: actor.id,
      notes: reason,
      allowNegative: true,
    }));
    const results = await applyMovements(tx, movements);

    for (const pid of productIds) {
      const p = prodById.get(pid)!;
      const mine = items.filter((i) => i.productId === pid);
      const qty = mine.reduce((acc, i) => acc.plus(D(i.quantity)), D(0));
      const value = mine.reduce((acc, i) => acc.plus(D(i.quantity).mul(D(i.unitCostFinalUsd))), D(0));
      const costFinal = qty.isZero() ? D(0) : value.div(qty);
      const qtyNow = stockNow.get(pid)?.quantity ?? D(0);

      // Previous purchase cost, if any, becomes the "last cost" again.
      const [previous] = await tx
        .select({ unitCostUsd: inventoryMovements.unitCostUsd })
        .from(inventoryMovements)
        .where(and(eq(inventoryMovements.productId, pid), eq(inventoryMovements.type, "purchase_in"), lt(inventoryMovements.id, ownMin.get(pid) ?? 0)))
        .orderBy(desc(inventoryMovements.id))
        .limit(1);
      const fallback = previous?.unitCostUsd ?? p.costLastUsd ?? p.costAvgUsd;
      const newAvg = averageAfterVoid(p.costAvgUsd, qtyNow, costFinal, qty, fallback);
      await tx
        .update(products)
        .set({ costAvgUsd: toMoneyDb(newAvg), costLastUsd: previous ? toMoneyDb(previous.unitCostUsd) : p.costLastUsd })
        .where(eq(products.id, pid));
    }

    const [updated] = await tx
      .update(purchaseReceipts)
      .set({ status: "voided", voidedBy: actor.id, voidedAt: new Date(), voidReason: reason })
      .where(eq(purchaseReceipts.id, id))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      action: "purchase_receipt.void",
      entityType: "purchase_receipt",
      entityId: id,
      before: receipt,
      after: { ...updated, movements: results.map((r) => r.movementId) },
    });
  });
}
