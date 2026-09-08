import ExcelJS from "exceljs";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { AppError } from "@/lib/errors";
import { D } from "@/lib/money";
import { generateInternalBarcodeFor } from "@/modules/catalog/application/barcodes";
import { applyImport, undoImport, validateImportFile } from "@/modules/catalog/application/import";
import { createProduct, deleteProduct, updateProduct } from "@/modules/catalog/application/products";
import { isValidEan13 } from "@/modules/catalog/domain/barcodes";
import type { ProductInput } from "@/modules/catalog/domain/product-schema";
import { searchProducts } from "@/modules/catalog/infrastructure/product-lookup";
import { getDefaultLocation } from "@/modules/core/application/context";
import { createTestDb, uid, type TestDb } from "./db";

const SKIP = Boolean(process.env.SKIP_DB_TESTS);

interface Base {
  warehouseId: string;
  unitId: string;
  taxId: string;
  categoryId: string;
  userId: string;
  publicListId: string;
  techListId: string;
}

async function ensureBaseData(db: TestDb): Promise<Base> {
  await db.insert(s.branches).values({ name: "Principal", code: "MAIN" }).onConflictDoNothing();
  const [branch] = await db.select().from(s.branches).where(eq(s.branches.code, "MAIN"));
  await db.insert(s.warehouses).values({ branchId: branch.id, name: "Almacén principal", code: "MAIN" }).onConflictDoNothing();
  // The application picks the first active warehouse; use the same one for assertions.
  const warehouse = { id: (await getDefaultLocation(db)).warehouseId };
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
  const lists = await db.select().from(s.priceLists);
  await db.insert(s.adjustmentReasons).values({ name: "Inventario inicial", kind: "increase", sortOrder: 1 }).onConflictDoNothing();
  const [user] = await db
    .insert(s.users)
    .values({ name: "Prueba catálogo", email: `${uid("catalog")}@test.local`, passwordHash: "x", role: "admin" })
    .returning();
  const [category] = await db.insert(s.categories).values({ name: uid("Compresores"), slug: uid("compresores") }).returning();
  return {
    warehouseId: warehouse.id,
    unitId: unit.id,
    taxId: tax.id,
    categoryId: category.id,
    userId: user.id,
    publicListId: lists.find((l) => l.code === "PUBLIC")!.id,
    techListId: lists.find((l) => l.code === "TECH")!.id,
  };
}

function productInput(base: Base, overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: `Compresor prueba ${uid("p")}`,
    sku: null,
    partNumber: uid("EMB").toUpperCase(),
    description: null,
    categoryId: base.categoryId,
    brandId: null,
    newBrandName: null,
    unitId: base.unitId,
    taxId: base.taxId,
    warrantyDays: 90,
    locationCode: "P1-E1",
    isActive: true,
    publicPriceUsd: "25.00",
    techPriceUsd: null,
    costUsd: "10.00",
    initialStock: null,
    minStock: "1",
    maxStock: "10",
    barcode: null,
    generateInternalBarcode: false,
    equivalences: [],
    compatibilities: [],
    ...overrides,
  };
}

describe.skipIf(SKIP)("catalog integration", () => {
  const { db, close } = createTestDb();
  let base: Base;
  const created: string[] = [];
  const importJobIds: string[] = [];

  beforeAll(async () => {
    base = await ensureBaseData(db);
  });

  afterAll(async () => {
    // Products with kardex rows cannot be hard-deleted (append-only movements): soft-delete them.
    for (const id of created) {
      await db.update(s.products).set({ deletedAt: new Date(), isActive: false }).where(eq(s.products.id, id));
      await db.delete(s.productBarcodes).where(eq(s.productBarcodes.productId, id));
    }
    // Remove the workbooks stored by the import tests.
    const { getStorage } = await import("@/lib/storage");
    for (const jobId of importJobIds) {
      const [job] = await db.select({ filePath: s.importJobs.filePath }).from(s.importJobs).where(eq(s.importJobs.id, jobId));
      if (job?.filePath) await getStorage().delete("documents", job.filePath).catch(() => undefined);
    }
    await close();
  });

  it("creates a product with initial stock, prices in both lists and searchable codes", async () => {
    const barcode = uid("BC").toUpperCase();
    const input = productInput(base, {
      initialStock: "5",
      barcode,
      newBrandName: uid("Marca"),
      equivalences: [{ code: uid("EQ").toUpperCase(), brand: null }],
      compatibilities: [{ applianceType: "Nevera", brand: "Mabe", model: uid("RMS").toUpperCase() }],
    });
    const result = await createProduct(input, { id: base.userId });
    created.push(result.id);

    expect(result.sku).toMatch(/^LP-\d{6}$/);
    expect(result.barcode).toBe(barcode);

    const [stock] = await db.select().from(s.stockLevels).where(and(eq(s.stockLevels.productId, result.id), eq(s.stockLevels.warehouseId, base.warehouseId)));
    expect(D(stock.quantity).toFixed(3)).toBe("5.000");

    const movements = await db.select().from(s.inventoryMovements).where(eq(s.inventoryMovements.productId, result.id));
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe("initial");
    expect(D(movements[0].quantity).toFixed(3)).toBe("5.000");
    expect(D(movements[0].balanceAfter).toFixed(3)).toBe("5.000");
    expect(D(movements[0].unitCostUsd).toFixed(4)).toBe("10.0000");
    expect(movements[0].reasonId).not.toBeNull();

    const prices = await db.select().from(s.priceListItems).where(eq(s.priceListItems.productId, result.id));
    expect(D(prices.find((p) => p.priceListId === base.publicListId)!.priceUsd).toFixed(2)).toBe("25.00");
    // Tech price suggested with the default 10 % markdown.
    expect(D(prices.find((p) => p.priceListId === base.techListId)!.priceUsd).toFixed(2)).toBe("22.50");

    const history = await db.select().from(s.priceHistory).where(eq(s.priceHistory.productId, result.id));
    expect(history).toHaveLength(2);
    expect(history.every((h) => h.oldPriceUsd === null)).toBe(true);

    const [product] = await db.select().from(s.products).where(eq(s.products.id, result.id));
    expect(D(product.costAvgUsd).toFixed(2)).toBe("10.00");
    expect(D(product.costLastUsd).toFixed(2)).toBe("10.00");
    expect(product.brandId).not.toBeNull();
    expect(product.searchText).toContain(input.partNumber!.toLowerCase());
    expect(product.searchText).toContain(input.equivalences[0].code.toLowerCase());
    expect(product.searchText).toContain("nevera mabe");

    const [settings] = await db.select().from(s.stockSettings).where(eq(s.stockSettings.productId, result.id));
    expect(D(settings.minStock).toFixed(0)).toBe("1");
    expect(D(settings.maxStock).toFixed(0)).toBe("10");
    expect(D(settings.reorderPoint).toFixed(0)).toBe("1");

    // searchProducts finds it by part number, equivalence code and barcode.
    const opts = { warehouseId: base.warehouseId, dbx: db };
    const byPart = await searchProducts(input.partNumber!, opts);
    expect(byPart.map((p) => p.id)).toContain(result.id);
    const byEquivalence = await searchProducts(input.equivalences[0].code, opts);
    expect(byEquivalence.map((p) => p.id)).toContain(result.id);
    const byBarcode = await searchProducts(barcode, opts);
    expect(byBarcode[0]?.id).toBe(result.id);
    expect(byBarcode[0]?.stockAvailable).toBe("5.000");
    expect(byBarcode[0]?.priceUsd).toBe("25.0000");
  });

  it("writes price history when a price changes and keeps custom SKUs unique", async () => {
    const sku = uid("CUSTOM").toUpperCase();
    const input = productInput(base, { sku, techPriceUsd: "20.00" });
    const result = await createProduct(input, { id: base.userId });
    created.push(result.id);
    expect(result.sku).toBe(sku);

    await expect(createProduct(productInput(base, { sku }), { id: base.userId })).rejects.toMatchObject({ code: "CONFLICT" });

    await updateProduct(result.id, { ...input, publicPriceUsd: "30.00", techPriceUsd: "20.00" }, { id: base.userId });
    const history = await db
      .select()
      .from(s.priceHistory)
      .where(and(eq(s.priceHistory.productId, result.id), eq(s.priceHistory.priceListId, base.publicListId)))
      .orderBy(asc(s.priceHistory.changedAt));
    expect(history).toHaveLength(2);
    expect(D(history[1].oldPriceUsd).toFixed(2)).toBe("25.00");
    expect(D(history[1].newPriceUsd).toFixed(2)).toBe("30.00");
    expect(history[1].changedBy).toBe(base.userId);

    // Unchanged tech price: no extra history row.
    const techHistory = await db
      .select()
      .from(s.priceHistory)
      .where(and(eq(s.priceHistory.productId, result.id), eq(s.priceHistory.priceListId, base.techListId)));
    expect(techHistory).toHaveLength(1);
  });

  it("generates internal EAN-13 barcodes once per product", async () => {
    const result = await createProduct(productInput(base, { generateInternalBarcode: true }), { id: base.userId });
    created.push(result.id);
    expect(result.barcode).toMatch(/^20\d{11}$/);
    expect(isValidEan13(result.barcode!)).toBe(true);

    const other = await createProduct(productInput(base), { id: base.userId });
    created.push(other.id);
    const generated = await generateInternalBarcodeFor(other.id, { id: base.userId });
    expect(isValidEan13(generated.code)).toBe(true);
    expect(Number(generated.code.slice(2, 12))).toBe(Number(result.barcode!.slice(2, 12)) + 1);
    await expect(generateInternalBarcodeFor(other.id, { id: base.userId })).rejects.toBeInstanceOf(AppError);
  });

  it("soft-deletes products without movements and only deactivates those with kardex", async () => {
    const withStock = await createProduct(productInput(base, { initialStock: "2" }), { id: base.userId });
    created.push(withStock.id);
    const r1 = await deleteProduct(withStock.id, { id: base.userId });
    expect(r1).toMatchObject({ deleted: false, deactivated: true, movements: 1 });
    const [p1] = await db.select().from(s.products).where(eq(s.products.id, withStock.id));
    expect(p1.isActive).toBe(false);
    expect(p1.deletedAt).toBeNull();

    const noStock = await createProduct(productInput(base), { id: base.userId });
    created.push(noStock.id);
    const r2 = await deleteProduct(noStock.id, { id: base.userId });
    expect(r2).toMatchObject({ deleted: true, deactivated: false });
    const [p2] = await db.select().from(s.products).where(eq(s.products.id, noStock.id));
    expect(p2.deletedAt).not.toBeNull();
  });

  it("imports an Excel file and undoes it with compensating movements", async () => {
    const [category] = await db.select().from(s.categories).where(eq(s.categories.id, base.categoryId));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Productos");
    ws.addRow(["SKU", "Nombre*", "Número de parte", "Categoría", "Marca", "Unidad", "Precio público USD*", "Precio técnico USD", "Costo USD", "Stock inicial", "Mínimo", "Máximo", "Ubicación", "Código de barras", "Equivalencias", "Compatibilidades", "Descripción", "Garantía días"]);
    const nameA = `Importado A ${uid("imp")}`;
    const nameB = `Importado B ${uid("imp")}`;
    ws.addRow(["", nameA, uid("PN").toUpperCase(), category.name, uid("MarcaImp"), "u", "12,50", "", "8", "3", "1", "5", "p9", "", "X1, X2", "Nevera LG GT32", "", "30"]);
    ws.addRow(["", nameB, "", "", "", "", "9.99", "", "", "", "", "", "", "", "", "", "", ""]);
    ws.addRow(["", "", "", "", "", "", "abc", "", "", "", "", "", "", "", "", "", "", ""]); // invalid: no name, bad price
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const preview = await validateImportFile(buffer, "prueba.xlsx", { id: base.userId });
    importJobIds.push(preview.jobId);
    expect(preview.totalRows).toBe(3);
    expect(preview.okRows).toBe(2);
    expect(preview.errorRows).toBe(1);
    expect(preview.rows[2].errors.length).toBeGreaterThan(0);

    const applied = await applyImport(preview.jobId, { id: base.userId });
    expect(applied.created).toBe(2);
    expect(applied.skipped).toBe(1);
    const imported = await db.select().from(s.products).where(eq(s.products.name, nameA));
    expect(imported).toHaveLength(1);
    created.push(imported[0].id);
    const [importedB] = await db.select().from(s.products).where(eq(s.products.name, nameB));
    created.push(importedB.id);
    const [stock] = await db.select().from(s.stockLevels).where(and(eq(s.stockLevels.productId, imported[0].id), eq(s.stockLevels.warehouseId, base.warehouseId)));
    expect(D(stock.quantity).toFixed(0)).toBe("3");
    expect(imported[0].locationCode).toBe("P9");
    const codes = await db.select().from(s.productBarcodes).where(eq(s.productBarcodes.productId, imported[0].id));
    expect(codes).toHaveLength(1);
    expect(codes[0].type).toBe("INTERNAL");

    const undone = await undoImport(preview.jobId, { id: base.userId });
    expect(undone.undone).toBe(2);
    expect(undone.skipped).toHaveLength(0);
    const [afterA] = await db.select().from(s.products).where(eq(s.products.id, imported[0].id));
    expect(afterA.deletedAt).not.toBeNull();
    const movements = await db.select().from(s.inventoryMovements).where(eq(s.inventoryMovements.productId, imported[0].id)).orderBy(asc(s.inventoryMovements.id));
    expect(movements.map((m) => m.type)).toEqual(["initial", "adjust_out"]);
    expect(D(movements[1].balanceAfter).toFixed(0)).toBe("0");
    const [job] = await db.select().from(s.importJobs).where(eq(s.importJobs.id, preview.jobId));
    expect(job.status).toBe("undone");
  });
});
