import { and, asc, count, eq, sql, type SQL } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/db/client";
import { brands, categories, priceListItems, productBarcodes, productCompatibilities, productEquivalences, products, stockSettings } from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  detectBarcodeType,
  generateInternalBarcode,
  INTERNAL_BARCODE_PREFIX,
  INTERNAL_SEQUENCE_DIGITS,
  isValidBarcodeText,
  normalizeBarcode,
  type BarcodeType,
} from "../domain/barcodes";
import { buildSearchText } from "../domain/search-text";
import { formatSku, SKU_PREFIX } from "../domain/sku";

export interface ActorUser {
  id: string;
}

/** Serializes SKU and internal barcode generation across concurrent transactions. */
export async function lockCatalogSequences(tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('product_sku'))`);
}

async function scalar(dbx: DbOrTx, query: SQL): Promise<unknown> {
  const res = await dbx.execute(query);
  const rows = (Array.isArray(res) ? res : ((res as unknown as { rows?: unknown[] }).rows ?? [])) as Array<Record<string, unknown>>;
  const first = rows[0];
  if (!first) return null;
  return Object.values(first)[0] ?? null;
}

/** Next LP-000001 style SKU. Call inside a transaction holding `lockCatalogSequences`. */
export async function nextSku(dbx: DbOrTx): Promise<string> {
  const pattern = `^${SKU_PREFIX}[0-9]+$`;
  // Positions are inlined: a bound parameter would make Postgres pick substring(text FROM pattern).
  const start = sql.raw(String(SKU_PREFIX.length + 1));
  const max = await scalar(dbx, sql`select max(substring(${products.sku} from ${start})::bigint) as max from ${products} where ${products.sku} ~ ${pattern}`);
  return formatSku(Number(max ?? 0) + 1);
}

/** Next internal EAN-13 (20 + sequence + check digit). Call inside a transaction holding `lockCatalogSequences`. */
export async function nextInternalBarcode(dbx: DbOrTx): Promise<string> {
  const pattern = `^${INTERNAL_BARCODE_PREFIX}[0-9]{${INTERNAL_SEQUENCE_DIGITS + 1}}$`;
  const start = sql.raw(String(INTERNAL_BARCODE_PREFIX.length + 1));
  const length = sql.raw(String(INTERNAL_SEQUENCE_DIGITS));
  const max = await scalar(
    dbx,
    sql`select max(substring(${productBarcodes.code} from ${start} for ${length})::bigint) as max from ${productBarcodes} where ${productBarcodes.type} = 'INTERNAL' and ${productBarcodes.code} ~ ${pattern}`,
  );
  return generateInternalBarcode(Number(max ?? 0) + 1);
}

export interface BarcodeRow {
  id: string;
  code: string;
  type: BarcodeType;
  isPrimary: boolean;
  /** True when the code was already registered on this product. */
  existed: boolean;
}

/** Register a manufacturer barcode on a product. Codes are unique across the catalog. */
export async function registerBarcode(tx: Tx, productId: string, rawCode: string, opts: { isPrimary?: boolean } = {}): Promise<BarcodeRow> {
  const code = normalizeBarcode(rawCode);
  if (!isValidBarcodeText(code)) {
    throw new AppError("VALIDATION", "El código de barras solo puede tener letras y números, sin espacios (3 a 48 caracteres).", {
      fields: { barcode: "Código inválido" },
    });
  }
  const [existing] = await tx
    .select({ id: productBarcodes.id, productId: productBarcodes.productId, type: productBarcodes.type, isPrimary: productBarcodes.isPrimary, name: products.name })
    .from(productBarcodes)
    .innerJoin(products, eq(products.id, productBarcodes.productId))
    .where(eq(productBarcodes.code, code));
  if (existing) {
    if (existing.productId === productId) return { id: existing.id, code, type: existing.type, isPrimary: existing.isPrimary, existed: true };
    throw new AppError("CONFLICT", `El código ${code} ya pertenece a "${existing.name}".`, { fields: { barcode: "Ya registrado en otro producto" } });
  }
  const [{ total }] = await tx.select({ total: count() }).from(productBarcodes).where(eq(productBarcodes.productId, productId));
  const isPrimary = opts.isPrimary ?? Number(total) === 0;
  if (isPrimary) await tx.update(productBarcodes).set({ isPrimary: false }).where(eq(productBarcodes.productId, productId));
  const [row] = await tx.insert(productBarcodes).values({ productId, code, type: detectBarcodeType(code), isPrimary }).returning();
  return { id: row.id, code: row.code, type: row.type, isPrimary: row.isPrimary, existed: false };
}

/** Create an internal barcode for a product (one per product). */
export async function registerInternalBarcode(tx: Tx, productId: string, opts: { isPrimary?: boolean } = {}): Promise<BarcodeRow> {
  const [already] = await tx
    .select({ id: productBarcodes.id, code: productBarcodes.code, isPrimary: productBarcodes.isPrimary })
    .from(productBarcodes)
    .where(and(eq(productBarcodes.productId, productId), eq(productBarcodes.type, "INTERNAL")));
  if (already) return { id: already.id, code: already.code, type: "INTERNAL", isPrimary: already.isPrimary, existed: true };
  await lockCatalogSequences(tx);
  const code = await nextInternalBarcode(tx);
  const [{ total }] = await tx.select({ total: count() }).from(productBarcodes).where(eq(productBarcodes.productId, productId));
  const isPrimary = opts.isPrimary ?? Number(total) === 0;
  if (isPrimary) await tx.update(productBarcodes).set({ isPrimary: false }).where(eq(productBarcodes.productId, productId));
  const [row] = await tx.insert(productBarcodes).values({ productId, code, type: "INTERNAL", isPrimary }).returning();
  return { id: row.id, code: row.code, type: "INTERNAL", isPrimary: row.isPrimary, existed: false };
}

/** Recompute products.search_text from the current name, codes, brand, category, equivalences and compatibilities. */
export async function rebuildSearchText(dbx: DbOrTx, productId: string): Promise<string> {
  const [p] = await dbx
    .select({ name: products.name, sku: products.sku, partNumber: products.partNumber, brandName: brands.name, categoryName: categories.name })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(products.id, productId));
  if (!p) return "";
  const eqs = await dbx.select({ code: productEquivalences.code }).from(productEquivalences).where(eq(productEquivalences.productId, productId));
  const compat = await dbx
    .select({ applianceType: productCompatibilities.applianceType, brand: productCompatibilities.brand, model: productCompatibilities.model })
    .from(productCompatibilities)
    .where(eq(productCompatibilities.productId, productId));
  const codes = await dbx.select({ code: productBarcodes.code }).from(productBarcodes).where(eq(productBarcodes.productId, productId));
  const text = buildSearchText({
    name: p.name,
    sku: p.sku,
    partNumber: p.partNumber,
    brandName: p.brandName,
    categoryName: p.categoryName,
    equivalenceCodes: eqs.map((e) => e.code),
    compatibilities: compat,
    barcodes: codes.map((c) => c.code),
  });
  await dbx.update(products).set({ searchText: text }).where(eq(products.id, productId));
  return text;
}

/** Product row plus relations, used for audit before/after snapshots. */
export async function loadProductSnapshot(dbx: DbOrTx, id: string) {
  const [p] = await dbx.select().from(products).where(eq(products.id, id));
  if (!p) return null;
  const equivalences = await dbx
    .select({ code: productEquivalences.code, brand: productEquivalences.brand })
    .from(productEquivalences)
    .where(eq(productEquivalences.productId, id))
    .orderBy(asc(productEquivalences.code));
  const compatibilities = await dbx
    .select({ applianceType: productCompatibilities.applianceType, brand: productCompatibilities.brand, model: productCompatibilities.model })
    .from(productCompatibilities)
    .where(eq(productCompatibilities.productId, id));
  const barcodes = await dbx
    .select({ code: productBarcodes.code, type: productBarcodes.type, isPrimary: productBarcodes.isPrimary })
    .from(productBarcodes)
    .where(eq(productBarcodes.productId, id));
  const prices = await dbx
    .select({ priceListId: priceListItems.priceListId, priceUsd: priceListItems.priceUsd })
    .from(priceListItems)
    .where(eq(priceListItems.productId, id));
  const settings = await dbx
    .select({ warehouseId: stockSettings.warehouseId, minStock: stockSettings.minStock, maxStock: stockSettings.maxStock, mode: stockSettings.mode })
    .from(stockSettings)
    .where(eq(stockSettings.productId, id));
  return { ...p, equivalences, compatibilities, barcodes, prices, settings };
}

export type ProductSnapshot = NonNullable<Awaited<ReturnType<typeof loadProductSnapshot>>>;
