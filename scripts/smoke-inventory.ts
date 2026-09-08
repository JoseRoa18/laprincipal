import "./load-env";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "../src/db/schema";
import { createSession } from "./lib/session";

/**
 * Smoke test for the inventory and purchasing screens against the running dev
 * server. Creates a throw-away product and supplier (no stock movements, so
 * they can be deleted afterwards), visits every route and cleans up.
 *
 *   pnpm exec tsx scripts/smoke-inventory.ts [baseUrl]
 */
const BASE = process.argv[2] ?? process.env.APP_URL ?? "http://localhost:3000";
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
  const db = drizzle(client, { schema: s });

  const [unit] = await db.select().from(s.units).where(eq(s.units.name, "Unidad")).limit(1);
  const [tax] = await db.select().from(s.taxes).where(eq(s.taxes.isDefault, true)).limit(1);
  const [warehouse] = await db.select().from(s.warehouses).where(eq(s.warehouses.isActive, true)).limit(1);
  if (!unit || !tax || !warehouse) throw new Error("Falta la semilla (unidad, impuesto o almacén). Ejecuta pnpm db:seed.");

  const sku = `SMK-${uid()}`.toUpperCase();
  const [product] = await db
    .insert(s.products)
    .values({ sku, name: `Producto de humo ${sku}`, unitId: unit.id, taxId: tax.id, costAvgUsd: "1.5", searchText: `producto de humo ${sku.toLowerCase()}` })
    .returning({ id: s.products.id });
  const [supplier] = await db.insert(s.suppliers).values({ name: `Proveedor de humo ${uid()}`, currencyCode: "USD", leadTimeDays: 3 }).returning({ id: s.suppliers.id });
  // Settings only (no kardex rows) so the product shows up as "Comprar ya" and can still be deleted.
  await db.insert(s.stockSettings).values({ productId: product.id, warehouseId: warehouse.id, minStock: "5", maxStock: "20", reorderQty: "10" });
  await db.insert(s.productSuppliers).values({ productId: product.id, supplierId: supplier.id, isPreferred: true, lastCostUsd: "1.25" });

  try {
    const session = await createSession({ base: BASE });
    const checks: Array<[string, string?]> = [
      ["/inventario", "Existencias"],
      [`/inventario?q=${encodeURIComponent(sku)}`, sku],
      ["/inventario?status=buy_now", "Existencias"],
      ["/inventario/movimientos", "Kardex"],
      [`/inventario/movimientos?product=${product.id}`, "Kardex"],
      ["/inventario/ajustes", "Ajustes de inventario"],
      ["/inventario/ajustes/nuevo", "Nuevo ajuste"],
      ["/inventario/conteos", "Conteos físicos"],
      ["/inventario/conteos/nuevo", "Nuevo conteo"],
      ["/inventario/alertas", "Alertas"],
      ["/compras", "Compras"],
      ["/compras/proveedores", "Proveedores"],
      ["/compras/proveedores/nuevo", "Nuevo proveedor"],
      [`/compras/proveedores/${supplier.id}`, "Productos que surte"],
      [`/compras/proveedores/${supplier.id}/editar`, "Editar"],
      ["/compras/entradas", "Entradas por compra"],
      ["/compras/entradas/nueva", "Nueva entrada"],
      [`/compras/entradas/nueva?supplier=${supplier.id}&items=${encodeURIComponent(JSON.stringify([{ p: product.id, q: 4 }]))}`, sku],
      ["/compras/que-comprar", "Qué comprar"],
    ];
    for (const [path, text] of checks) await session.expectOk(path, text);

    // Excel export (route handler).
    const res = await session.post("/api/purchasing/suggestions", JSON.stringify({ supplierId: supplier.id, items: [{ productId: product.id, quantity: 4 }] }));
    const xlsxOk = res.status === 200 && (res.headers.get("content-type") ?? "").includes("spreadsheetml");
    if (!xlsxOk) session.failures++;
    console.log(`${xlsxOk ? "PASS" : "FAIL"}  ${String(res.status).padEnd(4)} POST /api/purchasing/suggestions`);

    // Unknown ids must render "not found" (the status may still be 200 because the
    // loading.tsx shell is streamed before the page throws notFound()).
    for (const path of ["/inventario/ajustes/00000000-0000-0000-0000-000000000000", "/compras/entradas/00000000-0000-0000-0000-000000000000"]) {
      const r = await session.get(path);
      const html = await r.text();
      const ok = r.status === 404 || (r.status === 200 && html.includes('name="next-error" content="not-found"') && !html.includes("Application error"));
      if (!ok) session.failures++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${String(r.status).padEnd(4)} ${path} (not found)`);
    }

    console.log(session.failures === 0 ? "\nSmoke test passed" : `\n${session.failures} check(s) failed`);
    process.exitCode = session.failures === 0 ? 0 : 1;
  } finally {
    await db.delete(s.productSuppliers).where(and(eq(s.productSuppliers.productId, product.id), eq(s.productSuppliers.supplierId, supplier.id)));
    await db.delete(s.stockSettings).where(eq(s.stockSettings.productId, product.id));
    await db.delete(s.stockLevels).where(eq(s.stockLevels.productId, product.id));
    await db.delete(s.products).where(inArray(s.products.id, [product.id]));
    await db.delete(s.suppliers).where(eq(s.suppliers.id, supplier.id));
    await client.end({ timeout: 2 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
