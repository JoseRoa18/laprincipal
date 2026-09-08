import { and, asc, eq, isNull } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { productBarcodes, products } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { writeAudit } from "@/modules/core/application/audit";
import { rebuildSearchText, registerBarcode, registerInternalBarcode, type ActorUser, type BarcodeRow } from "./catalog-shared";

async function assertProduct(tx: Tx, productId: string) {
  const [p] = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), isNull(products.deletedAt)));
  if (!p) throw notFound("El producto");
}

/** Add a manufacturer barcode (typed or scanned). */
export async function addBarcode(productId: string, code: string, user: ActorUser): Promise<BarcodeRow> {
  return db.transaction(async (tx) => {
    await assertProduct(tx, productId);
    const row = await registerBarcode(tx, productId, code);
    if (row.existed) throw new AppError("CONFLICT", `El código ${row.code} ya está registrado en este producto.`);
    await rebuildSearchText(tx, productId);
    await writeAudit(tx, { userId: user.id, action: "barcode.add", entityType: "product", entityId: productId, after: row });
    return row;
  });
}

/** Generate the internal EAN-13 for a product that has no manufacturer code. */
export async function generateInternalBarcodeFor(productId: string, user: ActorUser): Promise<BarcodeRow> {
  return db.transaction(async (tx) => {
    await assertProduct(tx, productId);
    const row = await registerInternalBarcode(tx, productId);
    if (row.existed) throw new AppError("CONFLICT", `Este producto ya tiene el código interno ${row.code}.`);
    await rebuildSearchText(tx, productId);
    await writeAudit(tx, { userId: user.id, action: "barcode.generate", entityType: "product", entityId: productId, after: row });
    return row;
  });
}

export async function removeBarcode(productId: string, barcodeId: string, user: ActorUser): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(productBarcodes)
      .where(and(eq(productBarcodes.id, barcodeId), eq(productBarcodes.productId, productId)));
    if (!row) throw notFound("El código de barras");
    await tx.delete(productBarcodes).where(eq(productBarcodes.id, barcodeId));
    if (row.isPrimary) {
      const [next] = await tx.select({ id: productBarcodes.id }).from(productBarcodes).where(eq(productBarcodes.productId, productId)).orderBy(asc(productBarcodes.createdAt)).limit(1);
      if (next) await tx.update(productBarcodes).set({ isPrimary: true }).where(eq(productBarcodes.id, next.id));
    }
    await rebuildSearchText(tx, productId);
    await writeAudit(tx, { userId: user.id, action: "barcode.remove", entityType: "product", entityId: productId, before: row });
  });
}

export async function setPrimaryBarcode(productId: string, barcodeId: string, user: ActorUser): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: productBarcodes.id, code: productBarcodes.code })
      .from(productBarcodes)
      .where(and(eq(productBarcodes.id, barcodeId), eq(productBarcodes.productId, productId)));
    if (!row) throw notFound("El código de barras");
    await tx.update(productBarcodes).set({ isPrimary: false }).where(eq(productBarcodes.productId, productId));
    await tx.update(productBarcodes).set({ isPrimary: true }).where(eq(productBarcodes.id, barcodeId));
    await writeAudit(tx, { userId: user.id, action: "barcode.set_primary", entityType: "product", entityId: productId, after: row });
  });
}
