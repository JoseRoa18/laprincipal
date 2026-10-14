import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { customers, priceListItems, productBarcodes, productImages, products, stockLevels, taxes, units } from "@/db/schema";
import { getStorage } from "@/lib/storage";
import { D } from "@/lib/money";
import { getPriceListIds } from "@/modules/catalog/infrastructure/catalog-options";
import { getSetting } from "@/modules/settings/infrastructure/settings";
import { formatDoc, normalizeDocNumber } from "@/modules/customers/domain/document";
import { OFFLINE_SNAPSHOT_VERSION, type OfflineCustomer, type OfflineProduct, type OfflineSnapshot } from "../domain/offline";

/**
 * Everything the counter needs to sell without a connection: active products
 * with public and technician prices, stock, codes and search words, and the
 * customers with a document. A few queries and maps, no per-product lookups.
 */
export async function buildOfflineSnapshot(warehouseId: string, dbx: DbOrTx = db): Promise<OfflineSnapshot> {
  const lists = await getPriceListIds(dbx);
  const listIds = [lists.publicId, ...(lists.techId ? [lists.techId] : [])];

  const rows = await dbx
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      locationCode: products.locationCode,
      searchText: products.searchText,
      taxRate: taxes.rate,
      unitSymbol: units.symbol,
      unitDecimals: units.decimals,
      quantity: stockLevels.quantity,
      reserved: stockLevels.reservedQty,
    })
    .from(products)
    .innerJoin(taxes, eq(taxes.id, products.taxId))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, warehouseId)))
    .where(and(isNull(products.deletedAt), eq(products.isActive, true)));
  const ids = rows.map((r) => r.id);

  const [prices, codes, images, people] = ids.length
    ? await Promise.all([
        dbx
          .select({ productId: priceListItems.productId, listId: priceListItems.priceListId, price: priceListItems.priceUsd })
          .from(priceListItems)
          .where(inArray(priceListItems.priceListId, listIds)),
        dbx.select({ productId: productBarcodes.productId, code: productBarcodes.code }).from(productBarcodes),
        dbx
          .select({ productId: productImages.productId, thumb: productImages.thumbPath, processed: productImages.processedPath, original: productImages.originalPath })
          .from(productImages)
          .where(eq(productImages.isPrimary, true)),
        customerRows(dbx),
      ])
    : [[], [], [], await customerRows(dbx)];

  const priceOf = new Map(prices.filter((p) => D(p.price).gt(0)).map((p) => [`${p.productId}:${p.listId}`, p.price]));
  const codesOf = new Map<string, string[]>();
  for (const c of codes) codesOf.set(c.productId, [...(codesOf.get(c.productId) ?? []), c.code]);
  const storage = getStorage();
  const thumbOf = new Map(images.map((i) => [i.productId, i.thumb ?? i.processed ?? i.original]));

  const items: OfflineProduct[] = rows.map((r) => {
    const physical = D(r.quantity ?? 0);
    const thumb = thumbOf.get(r.id);
    return {
      id: r.id,
      sku: r.sku,
      name: r.name,
      unitSymbol: r.unitSymbol,
      unitDecimals: r.unitDecimals,
      taxRate: r.taxRate,
      publicPriceUsd: priceOf.get(`${r.id}:${lists.publicId}`) ?? null,
      techPriceUsd: lists.techId ? (priceOf.get(`${r.id}:${lists.techId}`) ?? null) : null,
      stockAvailable: physical.minus(D(r.reserved ?? 0)).toFixed(3),
      stockPhysical: physical.toFixed(3),
      locationCode: r.locationCode,
      thumbUrl: thumb ? storage.publicUrl("product-photos", thumb) : null,
      searchText: r.searchText,
      barcodes: codesOf.get(r.id) ?? [],
    };
  });

  const company = await getSetting("company", dbx);
  return {
    version: OFFLINE_SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    company: { name: company.name, taxId: company.taxId, address: company.address, phone: company.phone },
    publicListId: lists.publicId,
    techListId: lists.techId,
    products: items,
    customers: people,
  };
}

async function customerRows(dbx: DbOrTx): Promise<OfflineCustomer[]> {
  const rows = await dbx
    .select({
      id: customers.id,
      name: customers.name,
      docType: customers.docType,
      docNumber: customers.docNumber,
      phone: customers.phone,
      customerType: customers.customerType,
      priceListId: customers.priceListId,
    })
    .from(customers)
    .where(and(isNull(customers.deletedAt), eq(customers.isActive, true), ne(customers.docType, "NONE")));
  return rows
    .filter((c) => c.docNumber)
    .map((c) => ({
      id: c.id,
      name: c.name,
      docType: c.docType,
      docNumber: normalizeDocNumber(c.docNumber, c.docType),
      doc: formatDoc(c.docType, c.docNumber),
      phone: c.phone,
      customerType: c.customerType,
      priceListId: c.priceListId,
    }));
}
