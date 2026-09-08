import "./load-env";
import { eq } from "drizzle-orm";
import { createSession } from "./lib/session";

/**
 * Smoke test for the catalog package against the running dev server:
 * logs in as the seeded admin, opens every /productos screen, creates a product
 * through the application layer and checks its detail page and the PDF/Excel/PNG endpoints.
 *
 *   pnpm exec tsx scripts/smoke-catalog.ts [baseUrl]
 */
async function main() {
  const session = await createSession({ base: process.argv[2] });
  const { db } = await import("@/db/client");
  const { users } = await import("@/db/schema");
  const { createProduct, deleteProduct } = await import("@/modules/catalog/application/products");
  const { getProductFormOptions } = await import("@/modules/catalog/infrastructure/catalog-options");

  await session.expectOk("/productos", "Productos");
  await session.expectOk("/productos/nuevo", "Nuevo producto");
  await session.expectOk("/productos/categorias", "Categorías y marcas");
  await session.expectOk("/productos/etiquetas", "Etiquetas");
  await session.expectOk("/productos/importar", "Importar productos");

  const email = (process.env.ADMIN_EMAIL ?? "admin@laprincipal2050.com").toLowerCase();
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!admin) throw new Error(`Admin user ${email} not found`);
  const options = await getProductFormOptions();
  const stamp = Date.now().toString(36);
  const created = await createProduct(
    {
      name: `Producto de humo ${stamp}`,
      sku: null,
      partNumber: `SMOKE-${stamp}`.toUpperCase(),
      description: "Creado por scripts/smoke-catalog.ts",
      categoryId: options.categories[0]?.id ?? null,
      brandId: null,
      newBrandName: null,
      unitId: options.defaultUnitId,
      taxId: options.defaultTaxId,
      warrantyDays: 0,
      locationCode: "SMOKE",
      isActive: true,
      publicPriceUsd: "12.50",
      techPriceUsd: null,
      costUsd: "8",
      initialStock: null,
      minStock: "1",
      maxStock: "5",
      barcode: null,
      generateInternalBarcode: true,
      equivalences: [{ code: `EQ-${stamp}`.toUpperCase(), brand: null }],
      compatibilities: [{ applianceType: "Nevera", brand: "Mabe", model: "RMS400" }],
    },
    { id: admin.id },
  );
  console.log(`created product ${created.sku} (${created.id}) barcode ${created.barcode}`);

  await session.expectOk(`/productos/${created.id}`, created.sku);
  await session.expectOk(`/productos/${created.id}/editar`, "Editar");
  await session.expectOk(`/productos?q=${encodeURIComponent(`SMOKE-${stamp}`)}`, created.sku);
  await session.expectOk(`/productos/etiquetas?add=${created.id}`, created.sku);

  const checks: Array<{ path: string; type: string }> = [
    { path: `/api/products/labels?items=${created.id}:3&format=a4&price=1`, type: "application/pdf" },
    { path: `/api/products/labels?items=${created.id}:1&format=roll`, type: "application/pdf" },
    { path: "/api/products/import/template", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    { path: `/api/products/export?q=${encodeURIComponent(`SMOKE-${stamp}`)}`, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    { path: `/api/products/barcode?code=${created.barcode}&type=INTERNAL`, type: "image/png" },
  ];
  for (const c of checks) {
    const res = await session.get(c.path);
    const contentType = res.headers.get("content-type") ?? "";
    const body = await res.arrayBuffer();
    const ok = res.status === 200 && contentType.startsWith(c.type) && body.byteLength > 200;
    if (!ok) session.failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${String(res.status).padEnd(4)} ${c.path}  (${contentType}, ${body.byteLength} bytes)`);
  }

  const removed = await deleteProduct(created.id, { id: admin.id });
  console.log(`cleanup: ${removed.deleted ? "soft-deleted" : "deactivated"} ${created.sku}`);

  console.log(session.failures === 0 ? "\nCatalog smoke test passed" : `\n${session.failures} check(s) failed`);
  process.exit(session.failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
