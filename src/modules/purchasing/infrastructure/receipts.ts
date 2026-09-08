import { and, asc, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { products, purchaseReceiptItems, purchaseReceipts, suppliers, units, users } from "@/db/schema";
import { businessDate } from "@/lib/format";
import type { ReceiptStatus } from "./labels";

export interface ReceiptListRow {
  id: string;
  number: string | null;
  status: ReceiptStatus;
  receiptDate: string;
  supplierId: string;
  supplierName: string;
  supplierDocument: string | null;
  currencyCode: string;
  exchangeRate: string;
  totalUsd: string;
  itemCount: number;
  createdAt: Date;
}

export async function listReceipts(
  opts: { status?: ReceiptStatus | ""; supplierId?: string; page?: number; pageSize?: number; dbx?: DbOrTx } = {},
): Promise<{ rows: ReceiptListRow[]; total: number }> {
  const dbx = opts.dbx ?? db;
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? 25);
  const conds: (SQL | undefined)[] = [];
  if (opts.status) conds.push(eq(purchaseReceipts.status, opts.status));
  if (opts.supplierId) conds.push(eq(purchaseReceipts.supplierId, opts.supplierId));
  const where = conds.length ? and(...conds) : undefined;

  const rows = await dbx
    .select({
      id: purchaseReceipts.id,
      number: purchaseReceipts.number,
      status: purchaseReceipts.status,
      receiptDate: purchaseReceipts.receiptDate,
      supplierId: purchaseReceipts.supplierId,
      supplierName: suppliers.name,
      supplierDocument: purchaseReceipts.supplierDocument,
      currencyCode: purchaseReceipts.currencyCode,
      exchangeRate: purchaseReceipts.exchangeRate,
      totalUsd: purchaseReceipts.totalUsd,
      itemCount: sql<number>`(select count(*)::int from ${purchaseReceiptItems} i where i.receipt_id = ${purchaseReceipts.id})`,
      createdAt: purchaseReceipts.createdAt,
    })
    .from(purchaseReceipts)
    .innerJoin(suppliers, eq(suppliers.id, purchaseReceipts.supplierId))
    .where(where)
    .orderBy(desc(purchaseReceipts.receiptDate), desc(purchaseReceipts.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [agg] = await dbx.select({ count: sql<number>`count(*)::int` }).from(purchaseReceipts).where(where);
  return { rows, total: agg?.count ?? 0 };
}

export interface ReceiptItemRow {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  partNumber: string | null;
  unitSymbol: string;
  unitDecimals: number;
  quantity: string;
  unitCostAmount: string;
  unitCostUsd: string;
  extraCostShareUsd: string;
  unitCostFinalUsd: string;
  lineTotalUsd: string;
}

export interface ReceiptDetail {
  id: string;
  number: string | null;
  status: ReceiptStatus;
  supplierId: string;
  supplierName: string;
  supplierCurrency: string;
  supplierDocument: string | null;
  receiptDate: string;
  currencyCode: string;
  exchangeRate: string;
  subtotalUsd: string;
  extraCostsUsd: string;
  totalUsd: string;
  notes: string | null;
  createdAt: Date;
  createdByName: string;
  appliedAt: Date | null;
  voidedAt: Date | null;
  voidedByName: string | null;
  voidReason: string | null;
  items: ReceiptItemRow[];
}

export async function getReceipt(id: string, dbx: DbOrTx = db): Promise<ReceiptDetail | null> {
  const creator = alias(users, "creator");
  const voider = alias(users, "voider");
  const [row] = await dbx
    .select({
      id: purchaseReceipts.id,
      number: purchaseReceipts.number,
      status: purchaseReceipts.status,
      supplierId: purchaseReceipts.supplierId,
      supplierName: suppliers.name,
      supplierCurrency: suppliers.currencyCode,
      supplierDocument: purchaseReceipts.supplierDocument,
      receiptDate: purchaseReceipts.receiptDate,
      currencyCode: purchaseReceipts.currencyCode,
      exchangeRate: purchaseReceipts.exchangeRate,
      subtotalUsd: purchaseReceipts.subtotalUsd,
      extraCostsUsd: purchaseReceipts.extraCostsUsd,
      totalUsd: purchaseReceipts.totalUsd,
      notes: purchaseReceipts.notes,
      createdAt: purchaseReceipts.createdAt,
      createdByName: creator.name,
      appliedAt: purchaseReceipts.appliedAt,
      voidedAt: purchaseReceipts.voidedAt,
      voidedByName: voider.name,
      voidReason: purchaseReceipts.voidReason,
    })
    .from(purchaseReceipts)
    .innerJoin(suppliers, eq(suppliers.id, purchaseReceipts.supplierId))
    .innerJoin(creator, eq(creator.id, purchaseReceipts.createdBy))
    .leftJoin(voider, eq(voider.id, purchaseReceipts.voidedBy))
    .where(eq(purchaseReceipts.id, id))
    .limit(1);
  if (!row) return null;

  const items = await dbx
    .select({
      id: purchaseReceiptItems.id,
      productId: purchaseReceiptItems.productId,
      productName: products.name,
      sku: products.sku,
      partNumber: products.partNumber,
      unitSymbol: units.symbol,
      unitDecimals: units.decimals,
      quantity: purchaseReceiptItems.quantity,
      unitCostAmount: purchaseReceiptItems.unitCostAmount,
      unitCostUsd: purchaseReceiptItems.unitCostUsd,
      extraCostShareUsd: purchaseReceiptItems.extraCostShareUsd,
      unitCostFinalUsd: purchaseReceiptItems.unitCostFinalUsd,
      lineTotalUsd: purchaseReceiptItems.lineTotalUsd,
    })
    .from(purchaseReceiptItems)
    .innerJoin(products, eq(products.id, purchaseReceiptItems.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .where(eq(purchaseReceiptItems.receiptId, id))
    .orderBy(asc(purchaseReceiptItems.id));

  return { ...row, items };
}

/** Quick numbers for the purchasing index. */
export async function getPurchasingSummary(dbx: DbOrTx = db): Promise<{ receiptsThisMonth: number; totalThisMonthUsd: string; drafts: number }> {
  const monthStart = `${businessDate().slice(0, 7)}-01`;
  const [month] = await dbx
    .select({ count: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${purchaseReceipts.totalUsd}), 0)` })
    .from(purchaseReceipts)
    .where(and(eq(purchaseReceipts.status, "applied"), gte(purchaseReceipts.receiptDate, monthStart)));
  const [drafts] = await dbx.select({ count: sql<number>`count(*)::int` }).from(purchaseReceipts).where(eq(purchaseReceipts.status, "draft"));
  return { receiptsThisMonth: month?.count ?? 0, totalThisMonthUsd: month?.total ?? "0", drafts: drafts?.count ?? 0 };
}
