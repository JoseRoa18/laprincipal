import Decimal from "decimal.js";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { productSuppliers, suppliers } from "@/db/schema";
import { D, sum } from "@/lib/money";
import { listStock, type StockRow } from "@/modules/inventory/infrastructure/stock-query";
import type { StockStatus } from "@/modules/inventory/domain/velocity";

export interface SuggestionItem {
  productId: string;
  sku: string;
  name: string;
  partNumber: string | null;
  locationCode: string | null;
  unitSymbol: string;
  unitDecimals: number;
  status: StockStatus;
  stock: string;
  available: string;
  reorderPoint: string;
  maxStock: string;
  daysOfCover: string | null;
  velocity: string | null;
  suggestedQty: string;
  /** Estimated unit cost in USD: last cost from the supplier, else the product average. */
  unitCostUsd: string;
  supplierCode: string | null;
  packSize: number;
  supplierId: string | null;
  supplierName: string | null;
}

export interface SuggestionGroup {
  supplierId: string | null;
  supplierName: string;
  currencyCode: string | null;
  leadTimeDays: number | null;
  items: SuggestionItem[];
  estimatedTotalUsd: string;
}

export const NO_SUPPLIER_LABEL = "Sin proveedor";

/** Suggested quantity: stats → manual reorder qty → fill up to max. Rounded up to the pack size. */
export function suggestedQuantity(row: Pick<StockRow, "hasStats" | "suggestedQty" | "reorderQty" | "maxStock" | "quantity">, packSize = 1): Decimal {
  let q = D(0);
  if (row.hasStats && D(row.suggestedQty).gt(0)) q = D(row.suggestedQty);
  else if (D(row.reorderQty).gt(0)) q = D(row.reorderQty);
  else q = Decimal.max(D(row.maxStock).minus(D(row.quantity)), 0);
  const pack = Math.max(packSize, 1);
  if (pack > 1 && q.gt(0)) q = q.div(pack).ceil().mul(pack);
  return q;
}

/** Products to buy (status "Comprar ya" or "Pronto") grouped by their preferred supplier. */
export async function getPurchaseSuggestions(dbx: DbOrTx = db): Promise<SuggestionGroup[]> {
  const [buyNow, soon] = await Promise.all([
    listStock({ dbx, status: "buy_now", pageSize: 1000 }),
    listStock({ dbx, status: "soon", pageSize: 1000 }),
  ]);
  const rows = [...buyNow.rows, ...soon.rows];
  if (rows.length === 0) return [];

  const productIds = rows.map((r) => r.productId);
  const links = await dbx
    .select({
      productId: productSuppliers.productId,
      supplierId: productSuppliers.supplierId,
      supplierName: suppliers.name,
      currencyCode: suppliers.currencyCode,
      leadTimeDays: suppliers.leadTimeDays,
      isPreferred: productSuppliers.isPreferred,
      supplierCode: productSuppliers.supplierCode,
      lastCostUsd: productSuppliers.lastCostUsd,
      packSize: productSuppliers.packSize,
      createdAt: productSuppliers.createdAt,
    })
    .from(productSuppliers)
    .innerJoin(suppliers, eq(suppliers.id, productSuppliers.supplierId))
    .where(and(inArray(productSuppliers.productId, productIds), isNull(suppliers.deletedAt), eq(suppliers.isActive, true)))
    .orderBy(desc(productSuppliers.isPreferred), asc(productSuppliers.createdAt));

  const linkByProduct = new Map<string, (typeof links)[number]>();
  for (const l of links) if (!linkByProduct.has(l.productId)) linkByProduct.set(l.productId, l);

  const groups = new Map<string, SuggestionGroup>();
  for (const r of rows) {
    const link = linkByProduct.get(r.productId);
    const key = link?.supplierId ?? "none";
    if (!groups.has(key)) {
      groups.set(key, {
        supplierId: link?.supplierId ?? null,
        supplierName: link?.supplierName ?? NO_SUPPLIER_LABEL,
        currencyCode: link?.currencyCode ?? null,
        leadTimeDays: link?.leadTimeDays ?? null,
        items: [],
        estimatedTotalUsd: "0",
      });
    }
    const unitCost = link?.lastCostUsd && D(link.lastCostUsd).gt(0) ? link.lastCostUsd : r.costAvgUsd;
    groups.get(key)!.items.push({
      productId: r.productId,
      sku: r.sku,
      name: r.name,
      partNumber: r.partNumber,
      locationCode: r.locationCode,
      unitSymbol: r.unitSymbol,
      unitDecimals: r.unitDecimals,
      status: r.status,
      stock: r.quantity,
      available: r.available,
      reorderPoint: r.reorderPoint,
      maxStock: r.maxStock,
      daysOfCover: r.daysOfCover,
      velocity: r.velocity,
      suggestedQty: suggestedQuantity(r, link?.packSize ?? 1).toFixed(3),
      unitCostUsd: D(unitCost).toFixed(4),
      supplierCode: link?.supplierCode ?? null,
      packSize: link?.packSize ?? 1,
      supplierId: link?.supplierId ?? null,
      supplierName: link?.supplierName ?? null,
    });
  }

  const out = [...groups.values()].map((g) => ({
    ...g,
    items: g.items.sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === "buy_now" ? -1 : 1)),
    estimatedTotalUsd: sum(g.items.map((i) => D(i.suggestedQty).mul(D(i.unitCostUsd)))).toFixed(4),
  }));
  // Named suppliers first (alphabetically), "Sin proveedor" last.
  return out.sort((a, b) => (a.supplierId === null ? 1 : b.supplierId === null ? -1 : a.supplierName.localeCompare(b.supplierName)));
}

export async function countProductsToBuy(dbx: DbOrTx = db): Promise<number> {
  const r = await listStock({ dbx, status: "buy_now", pageSize: 1 });
  return r.total;
}
