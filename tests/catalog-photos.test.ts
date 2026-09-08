import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { addProductImage, deleteProductImage, PHOTO_BUCKET } from "@/modules/catalog/application/images";
import { AI_DISABLED_MESSAGE, applyAiImage, enhanceProductImageWithAi, revertAiImage } from "@/modules/catalog/application/photo-ai";
import { createProduct } from "@/modules/catalog/application/products";
import { isAiImagePath } from "@/modules/catalog/domain/photo-paths";
import type { ProductInput } from "@/modules/catalog/domain/product-schema";
import { getDefaultLocation } from "@/modules/core/application/context";
import { createTestDb, uid, type TestDb } from "./db";

const SKIP = Boolean(process.env.SKIP_DB_TESTS);

interface Base {
  unitId: string;
  taxId: string;
  userId: string;
}

async function ensureBaseData(db: TestDb): Promise<Base> {
  await db.insert(s.branches).values({ name: "Principal", code: "MAIN" }).onConflictDoNothing();
  const [branch] = await db.select().from(s.branches).where(eq(s.branches.code, "MAIN"));
  await db.insert(s.warehouses).values({ branchId: branch.id, name: "Almacén principal", code: "MAIN" }).onConflictDoNothing();
  await getDefaultLocation(db);
  await db.insert(s.units).values({ name: "Unidad", symbol: "u", decimals: 0 }).onConflictDoNothing();
  const [unit] = await db.select().from(s.units).where(eq(s.units.name, "Unidad"));
  let [tax] = await db.select().from(s.taxes).where(eq(s.taxes.name, "IVA 16 %"));
  if (!tax) [tax] = await db.insert(s.taxes).values({ name: "IVA 16 %", rate: "0.1600", isDefault: true }).returning();
  await db
    .insert(s.priceLists)
    .values([
      { code: "PUBLIC", name: "Público", isDefault: true },
      { code: "TECH", name: "Técnico", isDefault: false },
    ])
    .onConflictDoNothing();
  const [user] = await db
    .insert(s.users)
    .values({ name: "Prueba fotos", email: `${uid("photos")}@test.local`, passwordHash: "x", role: "admin" })
    .returning();
  return { unitId: unit.id, taxId: tax.id, userId: user.id };
}

function productInput(base: Base): ProductInput {
  return {
    name: `Foto prueba ${uid("p")}`,
    sku: null,
    partNumber: uid("PH").toUpperCase(),
    description: null,
    categoryId: null,
    brandId: null,
    newBrandName: null,
    unitId: base.unitId,
    taxId: base.taxId,
    warrantyDays: 0,
    locationCode: null,
    isActive: true,
    publicPriceUsd: "10.00",
    techPriceUsd: null,
    costUsd: "5.00",
    initialStock: null,
    minStock: "0",
    maxStock: "0",
    barcode: null,
    generateInternalBarcode: false,
    equivalences: [],
    compatibilities: [],
  };
}

// The storage layer does not inspect the bytes: any buffer works as a fake image.
const file = (label: string, contentType: string) => ({ data: Buffer.from(`fake ${label} ${Date.now()}`), contentType });
const jpeg = () => file("original", "image/jpeg");
const webp = (label: string) => file(label, "image/webp");

describe.skipIf(SKIP)("product photos: AI versions next to the cut-out", () => {
  const { db, close } = createTestDb();
  const storage = getStorage();
  let base: Base;
  const created: string[] = [];
  const actor = () => ({ id: base.userId });
  const exists = async (path: string | null | undefined) => Boolean(path && (await storage.get(PHOTO_BUCKET, path)));

  beforeAll(async () => {
    base = await ensureBaseData(db);
  });

  afterAll(async () => {
    for (const id of created) {
      const images = await db.select().from(s.productImages).where(eq(s.productImages.productId, id));
      for (const img of images) await deleteProductImage(id, img.id, actor()).catch(() => undefined);
      await db.update(s.products).set({ deletedAt: new Date(), isActive: false }).where(eq(s.products.id, id));
    }
    await close();
  });

  async function newProduct() {
    const p = await createProduct(productInput(base), actor());
    created.push(p.id);
    return p.id;
  }

  it("uploads with an AI version chosen in the form, then reverts to the cut-out and re-applies", async () => {
    const productId = await newProduct();
    const row = await addProductImage(
      { productId, original: jpeg(), processed: webp("cutout"), thumb: webp("cutout-thumb"), ai: webp("ai"), aiThumb: webp("ai-thumb"), status: "processed" },
      actor(),
    );
    expect(row.status).toBe("processed");
    expect(isAiImagePath(row.processedPath)).toBe(true);
    expect(row.thumbPath).toMatch(/-ai-[a-z0-9]+-thumb\.webp$/);
    const base = `products/${productId}/${row.id}`;
    expect(row.originalPath).toBe(`${base}-original.jpg`);
    // The cut-out and its thumbnail are stored next to the AI files.
    expect(await exists(`${base}-processed.webp`)).toBe(true);
    expect(await exists(`${base}-thumb.webp`)).toBe(true);
    expect(await exists(row.processedPath)).toBe(true);
    expect(await exists(row.thumbPath)).toBe(true);

    const reverted = await revertAiImage(row.id, actor());
    expect(reverted.processedPath).toBe(`${base}-processed.webp`);
    expect(reverted.thumbPath).toBe(`${base}-thumb.webp`);
    expect(reverted.status).toBe("processed");
    expect(await exists(row.processedPath)).toBe(false);
    expect(await exists(row.thumbPath)).toBe(false);

    const first = await applyAiImage(row.id, { ai: webp("ai-2"), aiThumb: webp("ai-2-thumb") }, actor());
    expect(isAiImagePath(first.processedPath)).toBe(true);
    expect(await exists(first.processedPath)).toBe(true);
    await new Promise((r) => setTimeout(r, 2)); // distinct stamp
    const second = await applyAiImage(row.id, { ai: webp("ai-3"), aiThumb: webp("ai-3-thumb") }, actor());
    expect(second.processedPath).not.toBe(first.processedPath);
    expect(await exists(second.processedPath)).toBe(true);
    expect(await exists(first.processedPath)).toBe(false); // regeneration removes the previous AI files
    expect(await exists(first.thumbPath)).toBe(false);
    expect(await exists(`${base}-processed.webp`)).toBe(true); // the cut-out is never touched

    const audits = await db.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, productId));
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("product.photo.ai_apply");
    expect(actions).toContain("product.photo.ai_revert");

    // Deleting the image removes every variant, including the cut-out that the row no longer points at.
    await deleteProductImage(productId, row.id, actor());
    expect(await exists(second.processedPath)).toBe(false);
    expect(await exists(`${base}-processed.webp`)).toBe(false);
    expect(await exists(`${base}-thumb.webp`)).toBe(false);
    expect(await exists(row.originalPath)).toBe(false);
  });

  it("applies and reverts on a photo that only has the original", async () => {
    const productId = await newProduct();
    const row = await addProductImage({ productId, original: jpeg(), thumb: webp("orig-thumb"), status: "original_only" }, actor());
    expect(row.status).toBe("original_only");
    expect(row.processedPath).toBeNull();

    const applied = await applyAiImage(row.id, { ai: webp("ai"), aiThumb: null }, actor());
    expect(applied.status).toBe("processed");
    expect(isAiImagePath(applied.processedPath)).toBe(true);
    expect(applied.thumbPath).toBe(row.thumbPath); // no AI thumbnail given: keeps the existing one

    const reverted = await revertAiImage(row.id, actor());
    expect(reverted.processedPath).toBeNull();
    expect(reverted.status).toBe("original_only");
    expect(reverted.thumbPath).toBe(`products/${productId}/${row.id}-thumb.webp`);
    expect(await exists(row.thumbPath)).toBe(true);
    expect(await exists(applied.processedPath)).toBe(false);
  });

  it("refuses to revert when no AI version is applied", async () => {
    const productId = await newProduct();
    const row = await addProductImage({ productId, original: jpeg(), processed: webp("cutout"), thumb: webp("thumb"), status: "processed" }, actor());
    const err = await revertAiImage(row.id, actor()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("INVALID_STATE");
  });

  it("reports the feature as disabled when GEMINI_API_KEY is not set", async () => {
    const productId = await newProduct();
    const row = await addProductImage({ productId, original: jpeg(), status: "original_only" }, actor());
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const err = await enhanceProductImageWithAi(row.id, actor()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).message).toBe(AI_DISABLED_MESSAGE);
    } finally {
      if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
    }
  });
});
