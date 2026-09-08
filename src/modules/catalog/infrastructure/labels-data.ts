import { and, desc, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { priceListItems, productBarcodes, products } from "@/db/schema";
import type { BarcodeType } from "../domain/barcodes";
import { getPriceListIds } from "./catalog-options";

export interface LabelData {
  productId: string;
  name: string;
  partNumber: string | null;
  sku: string;
  barcode: string | null;
  barcodeType: BarcodeType | null;
  priceUsd: string | null;
}

/** Name, part number, primary barcode and public price for each product id (order preserved). */
export async function getLabelData(ids: string[], dbx: DbOrTx = db): Promise<LabelData[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const lists = await getPriceListIds(dbx);
  const rows = await dbx
    .select({ id: products.id, name: products.name, partNumber: products.partNumber, sku: products.sku })
    .from(products)
    .where(inArray(products.id, unique));
  const codes = await dbx
    .select({ productId: productBarcodes.productId, code: productBarcodes.code, type: productBarcodes.type, isPrimary: productBarcodes.isPrimary })
    .from(productBarcodes)
    .where(inArray(productBarcodes.productId, unique))
    .orderBy(desc(productBarcodes.isPrimary));
  const prices = await dbx
    .select({ productId: priceListItems.productId, priceUsd: priceListItems.priceUsd })
    .from(priceListItems)
    .where(and(inArray(priceListItems.productId, unique), eq(priceListItems.priceListId, lists.publicId)));

  const byId = new Map(rows.map((r) => [r.id, r]));
  return unique
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => {
      const code = codes.find((c) => c.productId === r.id);
      return {
        productId: r.id,
        name: r.name,
        partNumber: r.partNumber,
        sku: r.sku,
        barcode: code?.code ?? null,
        barcodeType: code?.type ?? null,
        priceUsd: prices.find((p) => p.productId === r.id)?.priceUsd ?? null,
      };
    });
}
