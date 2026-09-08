import { hash } from "bcryptjs";
import * as s from "@/db/schema";
import { uid, type TestDb } from "./db";

/**
 * Base rows shared by the integration tests of this package. Idempotent for
 * the rows with fixed keys (currencies, series, price lists); everything else
 * gets a unique code so parallel test files never collide.
 */
export async function ensureBaseData(db: TestDb) {
  await db
    .insert(s.currencies)
    .values([
      { code: "USD", name: "Dólar", symbol: "$", decimals: 2, cashRounding: "0.01", isBase: true, sortOrder: 1 },
      { code: "VES", name: "Bolívar", symbol: "Bs", decimals: 2, cashRounding: "0.01", isBase: false, sortOrder: 2 },
      { code: "COP", name: "Peso colombiano", symbol: "COP", decimals: 0, cashRounding: "100", isBase: false, sortOrder: 3 },
    ])
    .onConflictDoNothing();
  await db
    .insert(s.documentSeries)
    .values([
      { documentType: "sale", prefix: "V-" },
      { documentType: "return", prefix: "D-" },
      { documentType: "cash_session", prefix: "J-" },
    ])
    .onConflictDoNothing();
  await db
    .insert(s.priceLists)
    .values([
      { code: "PUBLIC", name: "Público", isDefault: true },
      { code: "TECH", name: "Técnico", isDefault: false },
    ])
    .onConflictDoNothing();
}

export async function createTestUser(db: TestDb, role: "admin" | "seller" | "warehouse" = "admin", pin = "1234") {
  const [user] = await db
    .insert(s.users)
    .values({ name: `Test ${role}`, email: `${uid("user")}@test.local`, passwordHash: await hash("Secret123*", 4), role, pinHash: await hash(pin, 4) })
    .returning();
  return user;
}

export async function createTestStore(db: TestDb) {
  const code = uid("st").toUpperCase();
  const [branch] = await db.insert(s.branches).values({ name: `Sucursal ${code}`, code }).returning();
  const [warehouse] = await db.insert(s.warehouses).values({ branchId: branch.id, name: `Almacén ${code}`, code }).returning();
  // Inactive on purpose: `getDefaultCashRegister()` picks the first ACTIVE register, and other test files
  // (dashboard "cash.open") must never see a session that this file opens on its own register.
  const [register] = await db.insert(s.cashRegisters).values({ branchId: branch.id, name: `Caja ${code}`, isActive: false }).returning();
  return { branch, warehouse, register };
}

export async function createTestPaymentMethods(db: TestDb) {
  const tag = uid("pm").toUpperCase();
  const rows = await db
    .insert(s.paymentMethods)
    .values([
      { code: `CASH_USD_${tag}`, name: "Efectivo USD", kind: "cash", currencyCode: "USD", countsInDrawer: true, allowsChange: true, sortOrder: 1 },
      { code: `CASH_COP_${tag}`, name: "Efectivo COP", kind: "cash", currencyCode: "COP", countsInDrawer: true, allowsChange: true, sortOrder: 2 },
      { code: `ZELLE_${tag}`, name: "Zelle", kind: "transfer", currencyCode: "USD", requiresReference: true, sortOrder: 3 },
      { code: `PAGO_MOVIL_${tag}`, name: "Pago Móvil", kind: "mobile_payment", currencyCode: "VES", requiresReference: true, sortOrder: 4 },
    ])
    .returning();
  const byKey = (k: string) => rows.find((r) => r.code.startsWith(k))!;
  return { rows, cashUsd: byKey("CASH_USD"), cashCop: byKey("CASH_COP"), zelle: byKey("ZELLE"), pagoMovil: byKey("PAGO_MOVIL") };
}
