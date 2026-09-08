import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { priceListItems, priceLists, productBarcodes, productImages, products, stockLevels, taxes, units } from "@/db/schema";
import { getStorage } from "@/lib/storage";
import { D } from "@/lib/money";
import { normalizeSearch } from "../domain/search-text";

/** Product data needed by the POS, quotes and purchases. Shared contract. */
export interface ProductForSale {
  id: string;
  sku: string;
  name: string;
  partNumber: string | null;
  unitSymbol: string;
  unitDecimals: number;
  /** 0.16 for IVA 16 % */
  taxRate: string;
  taxId: string;
  /** Price from the requested list, falling back to the default (PUBLIC) list. Null when unpriced. */
  priceUsd: string | null;
  priceListCode: string | null;
  costAvgUsd: string;
  /** Available stock = physical − reserved (as string, 3 decimals). */
  stockAvailable: string;
  stockPhysical: string;
  locationCode: string | null;
  thumbUrl: string | null;
  isActive: boolean;
}

/** Normalize text the same way `products.search_text` is built: lower-case, no accents. Lives in the domain; re-exported here for the shared contract. */
export { normalizeSearch } from "../domain/search-text";

interface LookupOptions {
  priceListId?: string | null;
  warehouseId: string;
  dbx?: DbOrTx;
}

async function resolveLists(dbx: DbOrTx, priceListId?: string | null) {
  const lists = await dbx.select({ id: priceLists.id, code: priceLists.code, isDefault: priceLists.isDefault }).from(priceLists);
  const def = lists.find((l) => l.isDefault) ?? lists[0];
  const wanted = lists.find((l) => l.id === priceListId) ?? def;
  return { wanted, def };
}

async function hydrate(dbx: DbOrTx, ids: string[], opts: LookupOptions): Promise<ProductForSale[]> {
  if (ids.length === 0) return [];
  const { wanted, def } = await resolveLists(dbx, opts.priceListId);
  const storage = getStorage();

  const rows = await dbx
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      partNumber: products.partNumber,
      locationCode: products.locationCode,
      costAvgUsd: products.costAvgUsd,
      isActive: products.isActive,
      taxId: products.taxId,
      taxRate: taxes.rate,
      unitSymbol: units.symbol,
      unitDecimals: units.decimals,
      stockQty: stockLevels.quantity,
      stockReserved: stockLevels.reservedQty,
    })
    .from(products)
    .innerJoin(taxes, eq(taxes.id, products.taxId))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, opts.warehouseId)))
    .where(inArray(products.id, ids));

  const listIds = [...new Set([wanted?.id, def?.id].filter((x): x is string => Boolean(x)))];
  const prices = listIds.length
    ? await dbx
        .select({ productId: priceListItems.productId, priceListId: priceListItems.priceListId, priceUsd: priceListItems.priceUsd })
        .from(priceListItems)
        .where(and(inArray(priceListItems.productId, ids), inArray(priceListItems.priceListId, listIds)))
    : [];

  const images = await dbx
    .select({ productId: productImages.productId, thumbPath: productImages.thumbPath, processedPath: productImages.processedPath, originalPath: productImages.originalPath })
    .from(productImages)
    .where(and(inArray(productImages.productId, ids), eq(productImages.isPrimary, true)));

  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => {
      const wantedPrice = wanted ? prices.find((p) => p.productId === r.id && p.priceListId === wanted.id) : undefined;
      const defPrice = def ? prices.find((p) => p.productId === r.id && p.priceListId === def.id) : undefined;
      const price = wantedPrice ?? defPrice;
      const img = images.find((i) => i.productId === r.id);
      const thumb = img?.thumbPath ?? img?.processedPath ?? img?.originalPath ?? null;
      const physical = D(r.stockQty ?? 0);
      const available = physical.minus(D(r.stockReserved ?? 0));
      return {
        id: r.id,
        sku: r.sku,
        name: r.name,
        partNumber: r.partNumber,
        unitSymbol: r.unitSymbol,
        unitDecimals: r.unitDecimals,
        taxRate: r.taxRate,
        taxId: r.taxId,
        priceUsd: price?.priceUsd ?? null,
        priceListCode: price ? (price.priceListId === wanted?.id ? wanted.code : (def?.code ?? null)) : null,
        costAvgUsd: r.costAvgUsd,
        stockAvailable: available.toFixed(3),
        stockPhysical: physical.toFixed(3),
        locationCode: r.locationCode,
        thumbUrl: thumb ? storage.publicUrl("product-photos", thumb) : null,
        isActive: r.isActive,
      };
    });
}

/** Exact barcode or SKU match first; otherwise trigram search on search_text. */
export async function searchProducts(q: string, opts: LookupOptions & { limit?: number; includeInactive?: boolean }): Promise<ProductForSale[]> {
  const dbx = opts.dbx ?? db;
  const limit = opts.limit ?? 20;
  const term = q.trim();
  if (!term) return [];

  const activeFilter = opts.includeInactive ? isNull(products.deletedAt) : and(isNull(products.deletedAt), eq(products.isActive, true));

  const exact = await dbx
    .select({ id: products.id })
    .from(products)
    .leftJoin(productBarcodes, eq(productBarcodes.productId, products.id))
    .where(and(activeFilter, or(eq(productBarcodes.code, term), eq(products.sku, term.toUpperCase()))))
    .limit(limit);

  let ids = [...new Set(exact.map((r) => r.id))];
  if (ids.length < limit) {
    const normalized = normalizeSearch(term);
    const fuzzy = await dbx
      .select({ id: products.id })
      .from(products)
      .where(and(activeFilter, ilike(products.searchText, `%${normalized}%`)))
      .orderBy(desc(sql`similarity(${products.searchText}, ${normalized})`), products.name)
      .limit(limit);
    for (const r of fuzzy) if (!ids.includes(r.id)) ids.push(r.id);
    ids = ids.slice(0, limit);
  }
  return hydrate(dbx, ids, opts);
}

export async function getProductsForSale(ids: string[], opts: LookupOptions): Promise<ProductForSale[]> {
  return hydrate(opts.dbx ?? db, ids, opts);
}

export async function findProductByBarcode(code: string, opts: LookupOptions): Promise<ProductForSale | null> {
  const dbx = opts.dbx ?? db;
  const [row] = await dbx
    .select({ productId: productBarcodes.productId })
    .from(productBarcodes)
    .where(eq(productBarcodes.code, code.trim()))
    .limit(1);
  if (!row) return null;
  const [p] = await hydrate(dbx, [row.productId], opts);
  return p ?? null;
}
