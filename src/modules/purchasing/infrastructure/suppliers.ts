import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { productSuppliers, products, purchaseReceipts, stockLevels, suppliers, units } from "@/db/schema";
import { getDefaultLocation } from "@/modules/core/application/context";

export type SupplierRow = typeof suppliers.$inferSelect;

export async function listSuppliers(
  opts: { q?: string; includeInactive?: boolean; page?: number; pageSize?: number; dbx?: DbOrTx } = {},
): Promise<{ rows: Array<SupplierRow & { productCount: number }>; total: number }> {
  const dbx = opts.dbx ?? db;
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? 25);
  const conds: (SQL | undefined)[] = [isNull(suppliers.deletedAt)];
  if (!opts.includeInactive) conds.push(eq(suppliers.isActive, true));
  const q = opts.q?.trim();
  if (q) conds.push(or(ilike(suppliers.name, `%${q}%`), ilike(suppliers.taxId, `%${q}%`), ilike(suppliers.contactName, `%${q}%`)));
  const where = and(...conds);

  const rows = await dbx
    .select({
      supplier: suppliers,
      productCount: sql<number>`(select count(*)::int from ${productSuppliers} ps where ps.supplier_id = ${suppliers.id})`,
    })
    .from(suppliers)
    .where(where)
    .orderBy(asc(suppliers.name))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [agg] = await dbx.select({ count: sql<number>`count(*)::int` }).from(suppliers).where(where);
  return { rows: rows.map((r) => ({ ...r.supplier, productCount: r.productCount })), total: agg?.count ?? 0 };
}

export interface SupplierOption {
  id: string;
  name: string;
  currencyCode: string;
  leadTimeDays: number;
}

export async function listActiveSuppliers(dbx: DbOrTx = db): Promise<SupplierOption[]> {
  return dbx
    .select({ id: suppliers.id, name: suppliers.name, currencyCode: suppliers.currencyCode, leadTimeDays: suppliers.leadTimeDays })
    .from(suppliers)
    .where(and(isNull(suppliers.deletedAt), eq(suppliers.isActive, true)))
    .orderBy(asc(suppliers.name));
}

export async function getSupplier(id: string, dbx: DbOrTx = db): Promise<SupplierRow | null> {
  const [row] = await dbx.select().from(suppliers).where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt))).limit(1);
  return row ?? null;
}

export interface SupplierProductRow {
  productId: string;
  productName: string;
  sku: string;
  partNumber: string | null;
  unitSymbol: string;
  unitDecimals: number;
  supplierCode: string | null;
  lastCostAmount: string | null;
  lastCostCurrency: string | null;
  lastCostUsd: string | null;
  lastPurchaseAt: Date | null;
  packSize: number;
  isPreferred: boolean;
  stock: string;
  costAvgUsd: string;
}

export async function listSupplierProducts(supplierId: string, dbx: DbOrTx = db): Promise<SupplierProductRow[]> {
  const { warehouseId } = await getDefaultLocation(dbx);
  return dbx
    .select({
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      partNumber: products.partNumber,
      unitSymbol: units.symbol,
      unitDecimals: units.decimals,
      supplierCode: productSuppliers.supplierCode,
      lastCostAmount: productSuppliers.lastCostAmount,
      lastCostCurrency: productSuppliers.lastCostCurrency,
      lastCostUsd: productSuppliers.lastCostUsd,
      lastPurchaseAt: productSuppliers.lastPurchaseAt,
      packSize: productSuppliers.packSize,
      isPreferred: productSuppliers.isPreferred,
      stock: sql<string>`coalesce(${stockLevels.quantity}, 0)`,
      costAvgUsd: products.costAvgUsd,
    })
    .from(productSuppliers)
    .innerJoin(products, eq(products.id, productSuppliers.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, warehouseId)))
    .where(and(eq(productSuppliers.supplierId, supplierId), isNull(products.deletedAt)))
    .orderBy(asc(products.name));
}

export interface SupplierReceiptRow {
  id: string;
  number: string | null;
  status: "draft" | "applied" | "voided";
  receiptDate: string;
  supplierDocument: string | null;
  currencyCode: string;
  totalUsd: string;
}

export async function listSupplierReceipts(supplierId: string, limit = 10, dbx: DbOrTx = db): Promise<SupplierReceiptRow[]> {
  return dbx
    .select({
      id: purchaseReceipts.id,
      number: purchaseReceipts.number,
      status: purchaseReceipts.status,
      receiptDate: purchaseReceipts.receiptDate,
      supplierDocument: purchaseReceipts.supplierDocument,
      currencyCode: purchaseReceipts.currencyCode,
      totalUsd: purchaseReceipts.totalUsd,
    })
    .from(purchaseReceipts)
    .where(eq(purchaseReceipts.supplierId, supplierId))
    .orderBy(desc(purchaseReceipts.receiptDate), desc(purchaseReceipts.createdAt))
    .limit(limit);
}

export async function countActiveSuppliers(dbx: DbOrTx = db): Promise<number> {
  const [row] = await dbx
    .select({ count: sql<number>`count(*)::int` })
    .from(suppliers)
    .where(and(isNull(suppliers.deletedAt), eq(suppliers.isActive, true)));
  return row?.count ?? 0;
}
