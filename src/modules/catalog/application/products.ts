import { and, count, eq, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  brands,
  categories,
  inventoryMovements,
  priceHistory,
  priceListItems,
  productBarcodes,
  productCompatibilities,
  productEquivalences,
  products,
  stockSettings,
  taxes,
  units,
} from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { D, toMoneyDb, toQtyDb } from "@/lib/money";
import { writeAudit } from "@/modules/core/application/audit";
import { getDefaultLocation } from "@/modules/core/application/context";
import { applyMovement, lockStock } from "@/modules/inventory/application/stock";
import { getSetting } from "@/modules/settings/infrastructure/settings";
import { suggestTechPrice } from "../domain/pricing";
import type { ProductInput } from "../domain/product-schema";
import { isValidSku } from "../domain/sku";
import { getInitialStockReasonId, getPriceListIds } from "../infrastructure/catalog-options";
import {
  loadProductSnapshot,
  lockCatalogSequences,
  nextSku,
  rebuildSearchText,
  registerBarcode,
  registerInternalBarcode,
  type ActorUser,
} from "./catalog-shared";

export interface CreateProductResult {
  id: string;
  sku: string;
  barcode: string | null;
}

async function assertReferences(tx: Tx, input: ProductInput) {
  const [unit] = await tx.select({ id: units.id }).from(units).where(eq(units.id, input.unitId));
  if (!unit) throw new AppError("VALIDATION", "La unidad elegida no existe.", { fields: { unitId: "No existe" } });
  const [tax] = await tx.select({ id: taxes.id }).from(taxes).where(eq(taxes.id, input.taxId));
  if (!tax) throw new AppError("VALIDATION", "El impuesto elegido no existe.", { fields: { taxId: "No existe" } });
  if (input.categoryId) {
    const [cat] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, input.categoryId));
    if (!cat) throw new AppError("VALIDATION", "La categoría elegida no existe.", { fields: { categoryId: "No existe" } });
  }
}

/** Existing brand id, or create the brand named in `newBrandName` (case-insensitive match first). */
async function resolveBrandId(tx: Tx, input: Pick<ProductInput, "brandId" | "newBrandName">, userId: string): Promise<string | null> {
  if (input.brandId) {
    const [b] = await tx.select({ id: brands.id }).from(brands).where(eq(brands.id, input.brandId));
    if (!b) throw new AppError("VALIDATION", "La marca elegida no existe.", { fields: { brandId: "No existe" } });
    return b.id;
  }
  const name = input.newBrandName?.trim();
  if (!name) return null;
  const [existing] = await tx
    .select({ id: brands.id, isActive: brands.isActive })
    .from(brands)
    .where(sql`lower(${brands.name}) = lower(${name})`);
  if (existing) {
    if (!existing.isActive) await tx.update(brands).set({ isActive: true }).where(eq(brands.id, existing.id));
    return existing.id;
  }
  const [created] = await tx.insert(brands).values({ name }).returning();
  await writeAudit(tx, { userId, action: "brand.create", entityType: "brand", entityId: created.id, after: created });
  return created.id;
}

/** Upsert PUBLIC and TECH prices; every change is recorded in price_history. */
async function savePrices(tx: Tx, args: { productId: string; publicPriceUsd: string; techPriceUsd: string | null; userId: string }) {
  const lists = await getPriceListIds(tx);
  const policies = await getSetting("policies", tx);
  const tech = args.techPriceUsd ?? suggestTechPrice(args.publicPriceUsd, policies.techPriceMarkdownPct).toFixed(2);
  const targets = [{ listId: lists.publicId, price: args.publicPriceUsd }, ...(lists.techId ? [{ listId: lists.techId, price: tech }] : [])];

  for (const t of targets) {
    const next = toMoneyDb(t.price);
    const [existing] = await tx
      .select({ id: priceListItems.id, priceUsd: priceListItems.priceUsd })
      .from(priceListItems)
      .where(and(eq(priceListItems.productId, args.productId), eq(priceListItems.priceListId, t.listId)));
    if (!existing) {
      await tx.insert(priceListItems).values({ productId: args.productId, priceListId: t.listId, priceUsd: next, taxIncluded: true, updatedBy: args.userId });
      await tx.insert(priceHistory).values({ productId: args.productId, priceListId: t.listId, oldPriceUsd: null, newPriceUsd: next, changedBy: args.userId });
    } else if (!D(existing.priceUsd).eq(D(next))) {
      await tx.update(priceListItems).set({ priceUsd: next, updatedBy: args.userId }).where(eq(priceListItems.id, existing.id));
      await tx.insert(priceHistory).values({ productId: args.productId, priceListId: t.listId, oldPriceUsd: existing.priceUsd, newPriceUsd: next, changedBy: args.userId });
    }
  }
}

/** Manual min/max. The reorder point follows the minimum while the product stays in manual mode. */
async function upsertStockSettings(tx: Tx, args: { productId: string; warehouseId: string; minStock: string; maxStock: string; userId: string }) {
  const min = toQtyDb(args.minStock);
  const max = toQtyDb(args.maxStock);
  await tx
    .insert(stockSettings)
    .values({ productId: args.productId, warehouseId: args.warehouseId, minStock: min, maxStock: max, reorderPoint: min, mode: "manual", updatedBy: args.userId })
    .onConflictDoUpdate({
      target: [stockSettings.productId, stockSettings.warehouseId],
      set: {
        minStock: min,
        maxStock: max,
        reorderPoint: sql`case when ${stockSettings.mode} = 'manual' then ${min}::numeric else ${stockSettings.reorderPoint} end`,
        updatedBy: args.userId,
        updatedAt: new Date(),
      },
    });
}

async function replaceEquivalences(tx: Tx, productId: string, list: ProductInput["equivalences"]) {
  await tx.delete(productEquivalences).where(eq(productEquivalences.productId, productId));
  const seen = new Set<string>();
  const values: Array<typeof productEquivalences.$inferInsert> = [];
  for (const e of list) {
    const code = e.code.trim();
    const key = code.toUpperCase();
    if (!code || seen.has(key)) continue;
    seen.add(key);
    values.push({ productId, code, brand: e.brand?.trim() || null });
  }
  if (values.length) await tx.insert(productEquivalences).values(values);
}

async function replaceCompatibilities(tx: Tx, productId: string, list: ProductInput["compatibilities"]) {
  await tx.delete(productCompatibilities).where(eq(productCompatibilities.productId, productId));
  const values = list
    .filter((c) => c.applianceType || c.brand || c.model)
    .map((c) => ({ productId, applianceType: c.applianceType?.trim() || null, brand: c.brand?.trim() || null, model: c.model?.trim() || null }));
  if (values.length) await tx.insert(productCompatibilities).values(values);
}

/**
 * Create a product inside an existing transaction (used by the form and by the Excel import).
 * The caller must hold `lockCatalogSequences` when the SKU or barcode is auto-generated.
 */
export async function createProductInTx(tx: Tx, input: ProductInput, user: ActorUser, warehouseId: string): Promise<CreateProductResult> {
  await assertReferences(tx, input);
  const sku = input.sku ?? (await nextSku(tx));
  if (!isValidSku(sku)) {
    throw new AppError("VALIDATION", "El SKU solo puede tener letras, números, punto, guion y guion bajo.", { fields: { sku: "SKU inválido" } });
  }
  const [dup] = await tx.select({ id: products.id }).from(products).where(eq(products.sku, sku));
  if (dup) throw new AppError("CONFLICT", `El SKU ${sku} ya existe.`, { fields: { sku: "Ya existe" } });

  const brandId = await resolveBrandId(tx, input, user.id);
  const cost = input.costUsd ? D(input.costUsd) : null;

  const [p] = await tx
    .insert(products)
    .values({
      sku,
      name: input.name,
      partNumber: input.partNumber,
      description: input.description,
      categoryId: input.categoryId,
      brandId,
      unitId: input.unitId,
      taxId: input.taxId,
      warrantyDays: input.warrantyDays,
      locationCode: input.locationCode,
      costAvgUsd: toMoneyDb(cost ?? 0),
      costLastUsd: cost ? toMoneyDb(cost) : null,
      isActive: input.isActive,
      searchText: "",
    })
    .returning({ id: products.id });

  await replaceEquivalences(tx, p.id, input.equivalences);
  await replaceCompatibilities(tx, p.id, input.compatibilities);

  let barcode: string | null = null;
  if (input.barcode) {
    barcode = (await registerBarcode(tx, p.id, input.barcode, { isPrimary: true })).code;
  } else if (input.generateInternalBarcode) {
    barcode = (await registerInternalBarcode(tx, p.id, { isPrimary: true })).code;
  }

  await savePrices(tx, { productId: p.id, publicPriceUsd: input.publicPriceUsd, techPriceUsd: input.techPriceUsd, userId: user.id });
  await upsertStockSettings(tx, { productId: p.id, warehouseId, minStock: input.minStock, maxStock: input.maxStock, userId: user.id });

  const initial = input.initialStock ? D(input.initialStock) : null;
  if (initial && initial.gt(0)) {
    const reasonId = await getInitialStockReasonId(tx);
    await applyMovement(tx, {
      productId: p.id,
      warehouseId,
      type: "initial",
      quantity: initial,
      unitCostUsd: cost ?? 0,
      reasonId,
      referenceType: "product",
      referenceId: p.id,
      userId: user.id,
      notes: "Inventario inicial",
    });
  } else {
    // Make sure the stock row exists so lists and the POS see a zero balance.
    await lockStock(tx, [p.id], warehouseId);
  }

  await rebuildSearchText(tx, p.id);
  const after = await loadProductSnapshot(tx, p.id);
  await writeAudit(tx, { userId: user.id, action: "product.create", entityType: "product", entityId: p.id, after });
  return { id: p.id, sku, barcode };
}

export async function createProduct(input: ProductInput, user: ActorUser): Promise<CreateProductResult> {
  const location = await getDefaultLocation();
  return db.transaction(async (tx) => {
    await lockCatalogSequences(tx);
    return createProductInTx(tx, input, user, location.warehouseId);
  });
}

export async function updateProduct(id: string, input: ProductInput, user: ActorUser): Promise<{ id: string; sku: string }> {
  const location = await getDefaultLocation();
  return db.transaction(async (tx) => {
    const before = await loadProductSnapshot(tx, id);
    if (!before || before.deletedAt) throw notFound("El producto");
    await assertReferences(tx, input);

    const sku = input.sku ?? before.sku;
    if (!isValidSku(sku)) {
      throw new AppError("VALIDATION", "El SKU solo puede tener letras, números, punto, guion y guion bajo.", { fields: { sku: "SKU inválido" } });
    }
    if (sku !== before.sku) {
      const [dup] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.sku, sku), ne(products.id, id)));
      if (dup) throw new AppError("CONFLICT", `El SKU ${sku} ya existe.`, { fields: { sku: "Ya existe" } });
    }

    const brandId = await resolveBrandId(tx, input, user.id);
    const cost = input.costUsd ? D(input.costUsd) : null;
    let costAvgUsd = before.costAvgUsd;
    let costLastUsd = before.costLastUsd;
    if (cost && !D(before.costLastUsd ?? before.costAvgUsd).eq(cost)) {
      costLastUsd = toMoneyDb(cost);
      // The weighted average belongs to purchases; only seed it while no purchase has been received.
      const [{ purchases }] = await tx
        .select({ purchases: count() })
        .from(inventoryMovements)
        .where(and(eq(inventoryMovements.productId, id), eq(inventoryMovements.type, "purchase_in")));
      if (Number(purchases) === 0) costAvgUsd = toMoneyDb(cost);
    }

    await tx
      .update(products)
      .set({
        sku,
        name: input.name,
        partNumber: input.partNumber,
        description: input.description,
        categoryId: input.categoryId,
        brandId,
        unitId: input.unitId,
        taxId: input.taxId,
        warrantyDays: input.warrantyDays,
        locationCode: input.locationCode,
        isActive: input.isActive,
        costAvgUsd,
        costLastUsd,
      })
      .where(eq(products.id, id));

    await replaceEquivalences(tx, id, input.equivalences);
    await replaceCompatibilities(tx, id, input.compatibilities);
    if (input.barcode) await registerBarcode(tx, id, input.barcode);
    await savePrices(tx, { productId: id, publicPriceUsd: input.publicPriceUsd, techPriceUsd: input.techPriceUsd, userId: user.id });
    await upsertStockSettings(tx, { productId: id, warehouseId: location.warehouseId, minStock: input.minStock, maxStock: input.maxStock, userId: user.id });
    await rebuildSearchText(tx, id);

    const after = await loadProductSnapshot(tx, id);
    await writeAudit(tx, { userId: user.id, action: "product.update", entityType: "product", entityId: id, before, after });
    return { id, sku };
  });
}

export async function setProductActive(id: string, active: boolean, user: ActorUser): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ id: products.id, isActive: products.isActive, deletedAt: products.deletedAt }).from(products).where(eq(products.id, id));
    if (!before || before.deletedAt) throw notFound("El producto");
    if (before.isActive === active) return;
    await tx.update(products).set({ isActive: active }).where(eq(products.id, id));
    await writeAudit(tx, {
      userId: user.id,
      action: active ? "product.activate" : "product.deactivate",
      entityType: "product",
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive: active },
    });
  });
}

export interface DeleteProductResult {
  /** Soft-deleted (no movements). */
  deleted: boolean;
  /** Only deactivated because the kardex has movements. */
  deactivated: boolean;
  movements: number;
}

/** Soft delete when the product has no kardex movements; otherwise deactivate it. */
export async function deleteProduct(id: string, user: ActorUser): Promise<DeleteProductResult> {
  return db.transaction(async (tx) => {
    const before = await loadProductSnapshot(tx, id);
    if (!before || before.deletedAt) throw notFound("El producto");
    const [{ movements }] = await tx.select({ movements: count() }).from(inventoryMovements).where(eq(inventoryMovements.productId, id));
    const n = Number(movements);
    if (n > 0) {
      await tx.update(products).set({ isActive: false }).where(eq(products.id, id));
      await writeAudit(tx, { userId: user.id, action: "product.deactivate", entityType: "product", entityId: id, before: { isActive: before.isActive }, after: { isActive: false } });
      return { deleted: false, deactivated: true, movements: n };
    }
    await tx.update(products).set({ deletedAt: new Date(), isActive: false }).where(eq(products.id, id));
    // Free manufacturer codes for reuse; internal codes stay so the sequence never re-issues a printed label.
    await tx.delete(productBarcodes).where(and(eq(productBarcodes.productId, id), ne(productBarcodes.type, "INTERNAL")));
    await writeAudit(tx, { userId: user.id, action: "product.delete", entityType: "product", entityId: id, before });
    return { deleted: true, deactivated: false, movements: 0 };
  });
}
