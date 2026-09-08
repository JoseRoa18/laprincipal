import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { currencies, productSuppliers, suppliers } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { writeAudit } from "@/modules/core/application/audit";
import { inTransaction } from "@/modules/inventory/application/transaction";
import type { SupplierInput } from "./schemas";

export interface Actor {
  id: string;
}

async function assertCurrency(dbx: DbOrTx, code: string) {
  const [c] = await dbx.select({ code: currencies.code }).from(currencies).where(and(eq(currencies.code, code), eq(currencies.isActive, true))).limit(1);
  if (!c) throw new AppError("VALIDATION", "La moneda no existe.", { fields: { currencyCode: "Elige una moneda válida." } });
}

function toRow(input: SupplierInput) {
  return {
    name: input.name,
    taxId: input.taxId || null,
    contactName: input.contactName || null,
    phone: input.phone || null,
    email: input.email || null,
    address: input.address || null,
    currencyCode: input.currencyCode,
    leadTimeDays: input.leadTimeDays,
    paymentTerms: input.paymentTerms || null,
    notes: input.notes || null,
    isActive: input.isActive,
  };
}

export async function createSupplier(input: SupplierInput, actor: Actor, dbx: DbOrTx = db) {
  await assertCurrency(dbx, input.currencyCode);
  return inTransaction(dbx, async (tx) => {
    const [row] = await tx.insert(suppliers).values(toRow(input)).returning();
    await writeAudit(tx, { userId: actor.id, action: "supplier.create", entityType: "supplier", entityId: row.id, after: row });
    return row;
  });
}

export async function updateSupplier(id: string, input: SupplierInput, actor: Actor, dbx: DbOrTx = db) {
  await assertCurrency(dbx, input.currencyCode);
  return inTransaction(dbx, async (tx) => {
    const [before] = await tx.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
    if (!before || before.deletedAt) throw notFound("El proveedor");
    const [row] = await tx.update(suppliers).set(toRow(input)).where(eq(suppliers.id, id)).returning();
    await writeAudit(tx, { userId: actor.id, action: "supplier.update", entityType: "supplier", entityId: id, before, after: row });
    return row;
  });
}

/** Mark (or unmark) a supplier as the preferred one for a product. Only one preferred supplier per product. */
export async function setPreferredSupplier(productId: string, supplierId: string, preferred: boolean, actor: Actor, dbx: DbOrTx = db) {
  return inTransaction(dbx, async (tx) => {
    const [link] = await tx
      .select()
      .from(productSuppliers)
      .where(and(eq(productSuppliers.productId, productId), eq(productSuppliers.supplierId, supplierId)))
      .limit(1);
    if (!link) throw notFound("La relación producto-proveedor");
    if (preferred) {
      await tx.update(productSuppliers).set({ isPreferred: false }).where(eq(productSuppliers.productId, productId));
    }
    await tx
      .update(productSuppliers)
      .set({ isPreferred: preferred })
      .where(and(eq(productSuppliers.productId, productId), eq(productSuppliers.supplierId, supplierId)));
    await writeAudit(tx, {
      userId: actor.id,
      action: "product_supplier.preferred",
      entityType: "product",
      entityId: productId,
      before: link,
      after: { ...link, isPreferred: preferred },
    });
  });
}
