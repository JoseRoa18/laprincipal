import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import * as s from "@/db/schema";
import { normalizeSearch } from "@/modules/catalog/infrastructure/product-lookup";
import { createTestDb, uid } from "./db";

/**
 * Shared fixtures for the inventory and purchasing integration tests.
 *
 * Every scenario runs inside ONE transaction that is rolled back at the end:
 * the kardex and the audit log are append-only (a trigger blocks DELETE), so
 * a rollback is the only way to leave the test database exactly as it was.
 * The use cases open savepoints when given a transaction, so they behave the
 * same as in production.
 */
export interface Fixtures {
  tx: Tx;
  warehouseId: string;
  userId: string;
  unitId: string;
  taxId: string;
  categoryId: string;
  reasons: { increase: string; decrease: string; count: string };
  createProduct(input?: { name?: string; costAvgUsd?: string; locationCode?: string; categoryId?: string | null }): Promise<{ id: string; sku: string; name: string }>;
  createSupplier(input?: { name?: string; currencyCode?: string; leadTimeDays?: number }): Promise<{ id: string; name: string }>;
  setPolicies(patch: { allowNegativeStock?: boolean }): Promise<void>;
}

class Rollback extends Error {}

export async function withFixtures(fn: (f: Fixtures) => Promise<void>): Promise<void> {
  const { db, close } = createTestDb();
  try {
    await db
      .transaction(async (tx) => {
        const f = await createFixtures(tx);
        await fn(f);
        throw new Rollback("rollback");
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  } finally {
    await close();
  }
}

async function createFixtures(tx: Tx): Promise<Fixtures> {
  await tx
    .insert(s.currencies)
    .values([
      { code: "USD", name: "Dólar", symbol: "$", decimals: 2, cashRounding: "0.01", isBase: true, sortOrder: 1 },
      { code: "VES", name: "Bolívar", symbol: "Bs", decimals: 2, cashRounding: "0.01", isBase: false, sortOrder: 2 },
      { code: "COP", name: "Peso colombiano", symbol: "COP", decimals: 0, cashRounding: "100", isBase: false, sortOrder: 3 },
    ])
    .onConflictDoNothing();

  const code = uid("T").toUpperCase();
  const [branch] = await tx.insert(s.branches).values({ name: `Sucursal ${code}`, code }).returning();
  // Make sure our warehouse is the "default" one (first active) even when others exist.
  await tx.update(s.warehouses).set({ isActive: false });
  const [warehouse] = await tx.insert(s.warehouses).values({ branchId: branch.id, name: `Almacén ${code}`, code }).returning();

  const [user] = await tx
    .insert(s.users)
    .values({ name: "Prueba", email: `${uid("test")}@example.com`, passwordHash: "x", role: "admin" })
    .returning();

  await tx.insert(s.units).values({ name: "Unidad", symbol: "u", decimals: 0 }).onConflictDoNothing();
  const [unit] = await tx.select().from(s.units).where(eq(s.units.name, "Unidad")).limit(1);

  let [tax] = await tx.select().from(s.taxes).where(eq(s.taxes.name, "IVA 16 %")).limit(1);
  if (!tax) [tax] = await tx.insert(s.taxes).values({ name: "IVA 16 %", rate: "0.1600", isDefault: true }).returning();

  const [category] = await tx.insert(s.categories).values({ name: `Cat ${code}`, slug: uid("cat") }).returning();

  await tx
    .insert(s.documentSeries)
    .values([
      { documentType: "adjustment", prefix: "A-" },
      { documentType: "count", prefix: "I-" },
      { documentType: "purchase_receipt", prefix: "E-" },
    ])
    .onConflictDoNothing();

  await tx
    .insert(s.adjustmentReasons)
    .values([
      { name: "Inventario inicial", kind: "increase", sortOrder: 1 },
      { name: "Merma", kind: "decrease", sortOrder: 2 },
      { name: "Error de conteo", kind: "both", sortOrder: 4 },
    ])
    .onConflictDoNothing();
  const reasonRows = await tx.select().from(s.adjustmentReasons);
  const reason = (name: string) => reasonRows.find((r) => r.name === name)!.id;

  return {
    tx,
    warehouseId: warehouse.id,
    userId: user.id,
    unitId: unit.id,
    taxId: tax.id,
    categoryId: category.id,
    reasons: { increase: reason("Inventario inicial"), decrease: reason("Merma"), count: reason("Error de conteo") },
    async createProduct(input = {}) {
      const sku = uid("SKU").toUpperCase();
      const name = input.name ?? `Producto ${sku}`;
      const [p] = await tx
        .insert(s.products)
        .values({
          sku,
          name,
          unitId: unit.id,
          taxId: tax.id,
          categoryId: input.categoryId === undefined ? category.id : input.categoryId,
          costAvgUsd: input.costAvgUsd ?? "0",
          locationCode: input.locationCode ?? null,
          searchText: normalizeSearch(`${name} ${sku}`),
        })
        .returning({ id: s.products.id, sku: s.products.sku, name: s.products.name });
      return p;
    },
    async createSupplier(input = {}) {
      const [sup] = await tx
        .insert(s.suppliers)
        .values({ name: input.name ?? `Proveedor ${uid("P")}`, currencyCode: input.currencyCode ?? "USD", leadTimeDays: input.leadTimeDays ?? 7 })
        .returning({ id: s.suppliers.id, name: s.suppliers.name });
      return sup;
    },
    async setPolicies(patch) {
      const [row] = await tx.select().from(s.settings).where(eq(s.settings.key, "policies")).limit(1);
      const value = { ...((row?.value as Record<string, unknown>) ?? {}), ...patch };
      await tx
        .insert(s.settings)
        .values({ key: "policies", value })
        .onConflictDoUpdate({ target: s.settings.key, set: { value } });
    },
  };
}
