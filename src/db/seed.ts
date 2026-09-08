import "../../scripts/load-env";
import { hash } from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "./client";
import * as s from "./schema";

/**
 * Idempotent seed: base data for a single-store setup.
 *   pnpm db:seed
 */
async function main() {
  console.log("Seeding base data ...");

  // --- Organization ---
  const [branch] = await db
    .insert(s.branches)
    .values({ name: "Principal", code: "MAIN" })
    .onConflictDoUpdate({ target: s.branches.code, set: { name: "Principal" } })
    .returning();

  const [warehouse] = await db
    .insert(s.warehouses)
    .values({ branchId: branch.id, name: "Almacén principal", code: "MAIN" })
    .onConflictDoUpdate({ target: s.warehouses.code, set: { name: "Almacén principal" } })
    .returning();

  await db
    .insert(s.cashRegisters)
    .values({ branchId: branch.id, name: "Caja 1" })
    .onConflictDoNothing();

  // --- Currencies ---
  await db
    .insert(s.currencies)
    .values([
      { code: "USD", name: "Dólar", symbol: "$", decimals: 2, cashRounding: "0.01", isBase: true, sortOrder: 1 },
      { code: "VES", name: "Bolívar", symbol: "Bs", decimals: 2, cashRounding: "0.01", isBase: false, sortOrder: 2 },
      { code: "COP", name: "Peso colombiano", symbol: "COP", decimals: 0, cashRounding: "100", isBase: false, sortOrder: 3 },
    ])
    .onConflictDoNothing();

  // --- Taxes ---
  await db
    .insert(s.taxes)
    .values([
      { name: "IVA 16 %", rate: "0.1600", isDefault: true },
      { name: "Exento", rate: "0.0000", isDefault: false },
    ])
    .onConflictDoNothing();

  // --- Units ---
  await db
    .insert(s.units)
    .values([
      { name: "Unidad", symbol: "u", decimals: 0 },
      { name: "Par", symbol: "par", decimals: 0 },
      { name: "Juego", symbol: "jgo", decimals: 0 },
      { name: "Metro", symbol: "m", decimals: 2 },
      { name: "Kilogramo", symbol: "kg", decimals: 3 },
      { name: "Libra", symbol: "lb", decimals: 3 },
      { name: "Litro", symbol: "L", decimals: 2 },
    ])
    .onConflictDoNothing();

  // --- Categories (tree) ---
  const tree: Record<string, string[]> = {
    Refrigeración: [
      "Compresores",
      "Termostatos",
      "Relés y protectores",
      "Capacitores",
      "Gases refrigerantes",
      "Filtros secadores",
      "Tuberías y accesorios",
      "Motores y ventiladores",
      "Evaporadores y condensadores",
      "Gomas y empaques",
    ],
    Lavadoras: ["Bombas de agua", "Timers y tarjetas", "Correas", "Válvulas", "Motores", "Actuadores"],
    "Aires acondicionados": ["Compresores", "Capacitores", "Tarjetas", "Turbinas y aspas", "Controles remotos"],
    "Cocinas y hornos": ["Quemadores", "Perillas", "Encendedores", "Resistencias"],
    Microondas: ["Magnetrones", "Diodos", "Platos", "Fusibles"],
    Secadoras: ["Resistencias", "Correas", "Rodillos", "Termostatos"],
    "Herramientas y consumibles": [],
    Otros: [],
  };
  for (const [parentName, children] of Object.entries(tree)) {
    const parentSlug = slugify(parentName);
    const [parent] = await db
      .insert(s.categories)
      .values({ name: parentName, slug: parentSlug })
      .onConflictDoUpdate({ target: s.categories.slug, set: { name: parentName } })
      .returning();
    for (const child of children) {
      await db
        .insert(s.categories)
        .values({ name: child, slug: `${parentSlug}-${slugify(child)}`, parentId: parent.id })
        .onConflictDoNothing();
    }
  }

  // --- Adjustment reasons ---
  await db
    .insert(s.adjustmentReasons)
    .values([
      { name: "Inventario inicial", kind: "increase", sortOrder: 1 },
      { name: "Merma", kind: "decrease", sortOrder: 2 },
      { name: "Daño", kind: "decrease", sortOrder: 3 },
      { name: "Error de conteo", kind: "both", sortOrder: 4 },
      { name: "Uso interno", kind: "decrease", sortOrder: 5 },
      { name: "Garantía", kind: "both", sortOrder: 6 },
      { name: "Devolución a proveedor", kind: "decrease", sortOrder: 7 },
      { name: "Otro", kind: "both", sortOrder: 99 },
    ])
    .onConflictDoNothing();

  // --- Payment methods ---
  await db
    .insert(s.paymentMethods)
    .values([
      { code: "CASH_USD", name: "Efectivo USD", kind: "cash", currencyCode: "USD", countsInDrawer: true, allowsChange: true, sortOrder: 1 },
      { code: "CASH_COP", name: "Efectivo COP", kind: "cash", currencyCode: "COP", countsInDrawer: true, allowsChange: true, sortOrder: 2 },
      { code: "ZELLE", name: "Zelle", kind: "transfer", currencyCode: "USD", requiresReference: true, sortOrder: 3 },
      { code: "BINANCE", name: "Binance (USDT)", kind: "crypto", currencyCode: "USD", requiresReference: true, sortOrder: 4 },
      { code: "POS_VES", name: "Punto de venta", kind: "card_terminal", currencyCode: "VES", requiresReference: false, sortOrder: 5 },
      { code: "PAGO_MOVIL", name: "Pago Móvil", kind: "mobile_payment", currencyCode: "VES", requiresReference: true, sortOrder: 6 },
    ])
    .onConflictDoNothing();

  // --- Price lists ---
  await db
    .insert(s.priceLists)
    .values([
      { code: "PUBLIC", name: "Público", isDefault: true },
      { code: "TECH", name: "Técnico", isDefault: false },
    ])
    .onConflictDoNothing();

  // --- Document series ---
  await db
    .insert(s.documentSeries)
    .values([
      { documentType: "sale", prefix: "V-" },
      { documentType: "quote", prefix: "C-" },
      { documentType: "return", prefix: "D-" },
      { documentType: "purchase_receipt", prefix: "E-" },
      { documentType: "adjustment", prefix: "A-" },
      { documentType: "count", prefix: "I-" },
      { documentType: "cash_session", prefix: "J-" },
    ])
    .onConflictDoNothing();

  // --- Settings ---
  const defaults: Record<string, unknown> = {
    company: {
      name: "La Principal 2050",
      taxId: "",
      address: "",
      phone: "",
      email: "",
      logoPath: null,
    },
    policies: {
      allowNegativeStock: false,
      maxDiscountPctByRole: { admin: 100, seller: 10, warehouse: 0 },
      voidWindowHours: 24,
      quoteValidityDays: 7,
      techPriceMarkdownPct: 10,
      defaultMarginPct: 35,
      requireRatesToSell: true,
      requireOpenCashSession: true,
    },
    printing: {
      ticketWidthMm: 80,
      footer: "¡Gracias por su compra!",
      showBsOnTicket: true,
      showCopOnTicket: false,
    },
    stats: {
      windows: [30, 60, 90],
      weights: [0.5, 0.3, 0.2],
      serviceLevels: { A: 0.95, B: 0.9, C: 0.85 },
      targetCoverDays: 30,
      soonThresholdDays: 7,
      noMovementDays: 90,
      minDaysForAuto: 30,
    },
  };
  for (const [key, value] of Object.entries(defaults)) {
    await db.insert(s.settings).values({ key, value }).onConflictDoNothing();
  }

  // --- Admin user ---
  const email = (process.env.ADMIN_EMAIL ?? "admin@laprincipal2050.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "Admin2050*";
  const existing = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email));
  if (existing.length === 0) {
    await db.insert(s.users).values({
      name: "Administrador",
      email,
      passwordHash: await hash(password, 10),
      role: "admin",
      pinHash: await hash("1234", 10),
    });
    console.log(`Admin user created: ${email} (PIN 1234). Change the password after first login.`);
  } else {
    console.log(`Admin user already exists: ${email}`);
  }

  const counts = await db.execute(sql`
    select
      (select count(*) from categories) as categories,
      (select count(*) from payment_methods) as payment_methods,
      (select count(*) from document_series) as series
  `);
  console.log("Done.", counts.rows[0], { warehouse: warehouse.code });
  process.exit(0);
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
