import "./load-env";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { createSession } from "./lib/session";

/**
 * Smoke test for the product photo pipeline (server side) against the running dev server:
 *  - sharp loads in Node (optional dependency of Next) and produces the 1200×1200 WebP format,
 *  - a synthetic sample is stored through the application layer,
 *  - "Estilo catálogo con IA" reports itself as disabled without GEMINI_API_KEY (application
 *    layer and the real server action over HTTP),
 *  - applying and reverting an AI version switches the files served by /api/files.
 *
 *   pnpm exec tsx scripts/smoke-photo-ai.ts [baseUrl]
 */
async function main() {
  const session = await createSession({ base: process.argv[2] });
  const { db } = await import("@/db/client");
  const { productImages, users } = await import("@/db/schema");
  const { AppError } = await import("@/lib/errors");
  const { createProduct, deleteProduct } = await import("@/modules/catalog/application/products");
  const { getProductFormOptions } = await import("@/modules/catalog/infrastructure/catalog-options");
  const { addProductImage, deleteProductImage } = await import("@/modules/catalog/application/images");
  const { AI_DISABLED_MESSAGE, applyAiImage, enhanceProductImageWithAi, revertAiImage } = await import("@/modules/catalog/application/photo-ai");
  const { fitOnWhiteSquare, loadSharp, makeThumbBuffer, solidPng } = await import("@/modules/catalog/infrastructure/sharp-image");
  const { isAiImagePath } = await import("@/modules/catalog/domain/photo-paths");

  const check = (ok: boolean, label: string) => {
    if (!ok) session.failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    return ok;
  };

  // 1. sharp (from Next's optional dependency) and the server post-processing.
  const sharp = loadSharp();
  if (!check(sharp !== null, "sharp disponible en Node")) process.exit(1);
  const part = await solidPng(sharp!, 400, 220, "#3a3a3a");
  const sample = await sharp!(part).extend({ top: 120, bottom: 120, left: 200, right: 200, background: "#ffffff" }).png().toBuffer();
  const fitted = await fitOnWhiteSquare(sharp!, sample);
  const thumb = await makeThumbBuffer(sharp!, fitted.data);
  const meta = await sharp!(fitted.data).metadata();
  check(meta.width === 1200 && meta.height === 1200 && meta.format === "webp", `post-proceso: ${meta.width}×${meta.height} ${meta.format}, ${fitted.data.byteLength} bytes`);

  // 2. Product and photo through the application layer.
  const email = (process.env.ADMIN_EMAIL ?? "admin@laprincipal2050.com").toLowerCase();
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!admin) throw new Error(`Admin user ${email} not found`);
  const actor = { id: admin.id };
  const options = await getProductFormOptions();
  const stamp = Date.now().toString(36);
  const created = await createProduct(
    {
      name: `Foto de humo ${stamp}`,
      sku: null,
      partNumber: `SMKPH-${stamp}`.toUpperCase(),
      description: "Creado por scripts/smoke-photo-ai.ts",
      categoryId: options.categories[0]?.id ?? null,
      brandId: null,
      newBrandName: null,
      unitId: options.defaultUnitId,
      taxId: options.defaultTaxId,
      warrantyDays: 0,
      locationCode: "SMOKE",
      isActive: true,
      publicPriceUsd: "5",
      techPriceUsd: null,
      costUsd: "2",
      initialStock: null,
      minStock: "0",
      maxStock: "0",
      barcode: null,
      generateInternalBarcode: false,
      equivalences: [],
      compatibilities: [],
    },
    actor,
  );
  console.log(`created product ${created.sku} (${created.id})`);
  const image = await addProductImage(
    {
      productId: created.id,
      original: { data: sample, contentType: "image/png" },
      processed: { data: fitted.data, contentType: "image/webp" },
      thumb: { data: thumb.data, contentType: "image/webp" },
      status: "processed",
    },
    actor,
  );
  check(image.processedPath === `products/${created.id}/${image.id}-processed.webp`, "foto guardada con recorte");

  try {
    // 3. AI disabled without a key (application layer).
    delete process.env.GEMINI_API_KEY;
    const err = await enhanceProductImageWithAi(image.id, actor).catch((e: unknown) => e);
    check(err instanceof AppError && err.message === AI_DISABLED_MESSAGE, `sin GEMINI_API_KEY → "${AI_DISABLED_MESSAGE}"`);

    // 4. The real server action through the dev server (compiled by Turbopack).
    await session.expectOk(`/productos/${created.id}`, created.sku);
    const callAction = async (name: string, args: unknown[]) => {
      // Ids differ between the dev and the production manifests; an unknown id answers 404, so try each.
      for (const id of await findActionIds(name)) {
        const res = await session.get(`/productos/${created.id}`, {
          method: "POST",
          body: JSON.stringify(args),
          headers: { "next-action": id, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
        });
        if (res.status !== 404) return { status: res.status, text: await res.text() };
      }
      return null;
    };
    const enhance = await callAction("enhancePhotoWithAiAction", [image.id]);
    if (enhance) check(enhance.status === 200 && enhance.text.includes("no está configurada"), `acción enhancePhotoWithAiAction vía HTTP → mensaje de función deshabilitada (${enhance.status})`);
    else console.log("SKIP  acción enhancePhotoWithAiAction vía HTTP (id no encontrado en el manifiesto de acciones)");

    // 5. Apply an "AI" version (the sharp output stands in for Gemini) and check what is served.
    const applied = await applyAiImage(image.id, { ai: { data: fitted.data, contentType: "image/webp" }, aiThumb: { data: thumb.data, contentType: "image/webp" } }, actor);
    check(isAiImagePath(applied.processedPath), `applyAiImage → ${applied.processedPath}`);
    const served = await session.get(`/api/files/product-photos/${applied.processedPath}`);
    check(served.status === 200 && (served.headers.get("content-type") ?? "").startsWith("image/webp"), `archivo IA servido (${served.status})`);
    await session.expectOk(`/productos/${created.id}`, "Catálogo con IA");

    // 6. "Volver al recorte" through the server action; fall back to the application layer if the id is missing.
    const revert = await callAction("revertAiPhotoAction", [image.id]);
    if (revert) check(revert.status === 200 && revert.text.includes('"ok":true'), `acción revertAiPhotoAction vía HTTP (${revert.status})`);
    else await revertAiImage(image.id, actor);
    const [row] = await db.select().from(productImages).where(eq(productImages.id, image.id));
    check(row.processedPath === `products/${created.id}/${image.id}-processed.webp` && row.status === "processed", "vuelve al recorte");
    const gone = await session.get(`/api/files/product-photos/${applied.processedPath}`);
    check(gone.status === 404, `archivo IA borrado tras volver al recorte (${gone.status})`);
  } finally {
    await deleteProductImage(created.id, image.id, actor).catch(() => undefined);
    const removed = await deleteProduct(created.id, actor);
    console.log(`cleanup: ${removed.deleted ? "soft-deleted" : "deactivated"} ${created.sku}`);
  }

  console.log(session.failures === 0 ? "\nPhoto AI smoke test passed" : `\n${session.failures} check(s) failed`);
  process.exit(session.failures === 0 ? 0 : 1);
}

/**
 * Candidate server action ids from the actions manifests: the dev one (written once the page that
 * imports the action compiles) and the production build's (`pnpm build`). Their ids differ.
 */
async function findActionIds(exportedName: string): Promise<string[]> {
  const ids: string[] = [];
  for (const file of [".next/dev/server/server-reference-manifest.json", ".next/server/server-reference-manifest.json"]) {
    try {
      const raw = await readFile(file, "utf8");
      const manifest = JSON.parse(raw) as { node?: Record<string, { filename?: string; exportedName?: string }> };
      for (const [id, entry] of Object.entries(manifest.node ?? {})) {
        if (entry.exportedName === exportedName && entry.filename?.includes("productos/actions.ts") && !ids.includes(id)) ids.push(id);
      }
    } catch {
      /* manifest missing: try the next one */
    }
  }
  return ids;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
