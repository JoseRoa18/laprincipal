import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import { and, count, desc, eq, exists, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import {
  adjustmentReasons,
  customers,
  paymentMethods,
  products,
  quotes,
  saleItems,
  salePayments,
  saleReturnItems,
  saleReturns,
  sales,
  units,
  users,
} from "@/db/schema";
import { DEFAULT_TZ } from "@/lib/format";
import { getProductsForSale } from "@/modules/catalog/infrastructure/product-lookup";
import type { CartLineData, CartPayload } from "../application/schemas";
import { getCartCustomer } from "./customers-lookup";

export type SaleStatus = (typeof sales.$inferSelect)["status"];
export { SALE_STATUS_LABEL } from "../application/labels";

/** Start of a business day (yyyy-MM-dd) as an instant. */
export function businessDayStart(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new TZDate(y, m - 1, d, 0, 0, 0, DEFAULT_TZ);
}

export interface SalesFilter {
  from: string;
  to: string;
  status?: SaleStatus | "all";
  sellerId?: string | null;
  paymentMethodId?: string | null;
  customerId?: string | null;
  page: number;
  pageSize: number;
}

export interface SaleListRow {
  id: string;
  number: string | null;
  saleDate: Date;
  customerName: string | null;
  sellerName: string;
  totalUsd: string;
  rateVes: string;
  status: SaleStatus;
  paymentMethods: string[];
}

export async function listSales(f: SalesFilter, dbx: DbOrTx = db): Promise<{ rows: SaleListRow[]; total: number; sumUsd: string }> {
  const start = businessDayStart(f.from);
  const end = addDays(businessDayStart(f.to), 1);
  const where = and(
    ne(sales.status, "held"),
    gte(sales.saleDate, start),
    lt(sales.saleDate, end),
    f.status && f.status !== "all" ? eq(sales.status, f.status) : undefined,
    f.sellerId ? eq(sales.sellerId, f.sellerId) : undefined,
    f.customerId ? eq(sales.customerId, f.customerId) : undefined,
    f.paymentMethodId
      ? exists(
          dbx
            .select({ one: sql`1` })
            .from(salePayments)
            .where(and(eq(salePayments.saleId, sales.id), eq(salePayments.paymentMethodId, f.paymentMethodId))),
        )
      : undefined,
  );

  const [{ total, sumUsd }] = await dbx
    .select({
      total: count(),
      sumUsd: sql<string>`coalesce(sum(case when ${sales.status} in ('completed', 'partially_refunded') then ${sales.totalUsd} else 0 end), 0)::text`,
    })
    .from(sales)
    .where(where);
  const rows = await dbx
    .select({
      id: sales.id,
      number: sales.number,
      saleDate: sales.saleDate,
      customerName: customers.name,
      sellerName: users.name,
      totalUsd: sales.totalUsd,
      rateVes: sales.rateVes,
      status: sales.status,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .innerJoin(users, eq(users.id, sales.sellerId))
    .where(where)
    .orderBy(desc(sales.saleDate))
    .limit(f.pageSize)
    .offset((f.page - 1) * f.pageSize);

  const ids = rows.map((r) => r.id);
  const methods = ids.length
    ? await dbx
        .select({ saleId: salePayments.saleId, name: paymentMethods.name })
        .from(salePayments)
        .innerJoin(paymentMethods, eq(paymentMethods.id, salePayments.paymentMethodId))
        .where(inArray(salePayments.saleId, ids))
    : [];
  const byId = new Map<string, string[]>();
  for (const m of methods) {
    const list = byId.get(m.saleId) ?? [];
    if (!list.includes(m.name)) list.push(m.name);
    byId.set(m.saleId, list);
  }
  return { rows: rows.map((r) => ({ ...r, paymentMethods: byId.get(r.id) ?? [] })), total, sumUsd };
}

export interface SaleDetail {
  id: string;
  number: string | null;
  status: SaleStatus;
  saleDate: Date;
  notes: string | null;
  holdLabel: string | null;
  customer: { id: string; name: string; docType: string; docNumber: string | null; phone: string | null } | null;
  seller: { id: string; name: string };
  createdBy: { id: string; name: string };
  voidedBy: { id: string; name: string } | null;
  voidReason: string | null;
  voidedAt: Date | null;
  subtotalUsd: string;
  discountUsd: string;
  taxUsd: string;
  totalUsd: string;
  paidUsd: string;
  changeUsd: string;
  changeCurrencyCode: string | null;
  changeAmount: string;
  rateVes: string;
  rateCop: string;
  cashSessionId: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  items: SaleDetailItem[];
  payments: SaleDetailPayment[];
  returns: SaleDetailReturn[];
}

export interface SaleDetailItem {
  id: string;
  productId: string;
  sku: string;
  partNumber: string | null;
  description: string;
  quantity: string;
  unitPriceUsd: string;
  unitCostUsd: string;
  discountType: "pct" | "amount";
  discountValue: string;
  discountUsd: string;
  taxRate: string;
  taxUsd: string;
  lineTotalUsd: string;
  returnedQty: string;
  unitDecimals: number;
  unitSymbol: string;
}

export interface SaleDetailPayment {
  id: string;
  methodName: string;
  methodCode: string;
  currencyCode: string;
  amount: string;
  exchangeRate: string;
  amountUsd: string;
  reference: string | null;
}

export interface SaleDetailReturn {
  id: string;
  number: string | null;
  createdAt: Date;
  totalUsd: string;
  refundCurrencyCode: string | null;
  refundAmount: string;
  refundMethodName: string | null;
  restock: boolean;
  reasonName: string | null;
  reasonText: string | null;
  createdByName: string;
  items: { description: string; quantity: string; lineTotalUsd: string }[];
}

export async function getSaleDetail(id: string, dbx: DbOrTx = db): Promise<SaleDetail | null> {
  const seller = alias(users, "seller");
  const creator = alias(users, "creator");
  const voider = alias(users, "voider");
  const [row] = await dbx
    .select({
      sale: sales,
      customer: { id: customers.id, name: customers.name, docType: customers.docType, docNumber: customers.docNumber, phone: customers.phone },
      seller: { id: seller.id, name: seller.name },
      creator: { id: creator.id, name: creator.name },
      voider: { id: voider.id, name: voider.name },
      quoteNumber: quotes.number,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .innerJoin(seller, eq(seller.id, sales.sellerId))
    .innerJoin(creator, eq(creator.id, sales.createdBy))
    .leftJoin(voider, eq(voider.id, sales.voidedBy))
    .leftJoin(quotes, eq(quotes.id, sales.quoteId))
    .where(eq(sales.id, id))
    .limit(1);
  if (!row) return null;

  const items = await dbx
    .select({
      id: saleItems.id,
      productId: saleItems.productId,
      sku: products.sku,
      partNumber: products.partNumber,
      description: saleItems.description,
      quantity: saleItems.quantity,
      unitPriceUsd: saleItems.unitPriceUsd,
      unitCostUsd: saleItems.unitCostUsd,
      discountType: saleItems.discountType,
      discountValue: saleItems.discountValue,
      discountUsd: saleItems.discountUsd,
      taxRate: saleItems.taxRate,
      taxUsd: saleItems.taxUsd,
      lineTotalUsd: saleItems.lineTotalUsd,
      returnedQty: saleItems.returnedQty,
      unitDecimals: units.decimals,
      unitSymbol: units.symbol,
    })
    .from(saleItems)
    .innerJoin(products, eq(products.id, saleItems.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .where(eq(saleItems.saleId, id))
    .orderBy(saleItems.id);

  const payments = await dbx
    .select({
      id: salePayments.id,
      methodName: paymentMethods.name,
      methodCode: paymentMethods.code,
      currencyCode: salePayments.currencyCode,
      amount: salePayments.amount,
      exchangeRate: salePayments.exchangeRate,
      amountUsd: salePayments.amountUsd,
      reference: salePayments.reference,
    })
    .from(salePayments)
    .innerJoin(paymentMethods, eq(paymentMethods.id, salePayments.paymentMethodId))
    .where(eq(salePayments.saleId, id))
    .orderBy(salePayments.createdAt);

  const returnRows = await dbx
    .select({
      id: saleReturns.id,
      number: saleReturns.number,
      createdAt: saleReturns.createdAt,
      totalUsd: saleReturns.totalUsd,
      refundCurrencyCode: saleReturns.refundCurrencyCode,
      refundAmount: saleReturns.refundAmount,
      refundMethodName: paymentMethods.name,
      restock: saleReturns.restock,
      reasonName: adjustmentReasons.name,
      reasonText: saleReturns.reasonText,
      createdByName: users.name,
    })
    .from(saleReturns)
    .leftJoin(paymentMethods, eq(paymentMethods.id, saleReturns.refundMethodId))
    .leftJoin(adjustmentReasons, eq(adjustmentReasons.id, saleReturns.reasonId))
    .innerJoin(users, eq(users.id, saleReturns.createdBy))
    .where(eq(saleReturns.saleId, id))
    .orderBy(saleReturns.createdAt);
  const returnItems = returnRows.length
    ? await dbx
        .select({
          returnId: saleReturnItems.returnId,
          description: saleItems.description,
          quantity: saleReturnItems.quantity,
          lineTotalUsd: saleReturnItems.lineTotalUsd,
        })
        .from(saleReturnItems)
        .innerJoin(saleItems, eq(saleItems.id, saleReturnItems.saleItemId))
        .where(
          inArray(
            saleReturnItems.returnId,
            returnRows.map((r) => r.id),
          ),
        )
    : [];

  const s = row.sale;
  return {
    id: s.id,
    number: s.number,
    status: s.status,
    saleDate: s.saleDate,
    notes: s.notes,
    holdLabel: s.holdLabel,
    customer: row.customer?.id ? { ...row.customer, id: row.customer.id, name: row.customer.name ?? "" } : null,
    seller: row.seller,
    createdBy: row.creator,
    voidedBy: row.voider?.id ? { id: row.voider.id, name: row.voider.name ?? "" } : null,
    voidReason: s.voidReason,
    voidedAt: s.voidedAt,
    subtotalUsd: s.subtotalUsd,
    discountUsd: s.discountUsd,
    taxUsd: s.taxUsd,
    totalUsd: s.totalUsd,
    paidUsd: s.paidUsd,
    changeUsd: s.changeUsd,
    changeCurrencyCode: s.changeCurrencyCode,
    changeAmount: s.changeAmount,
    rateVes: s.rateVes,
    rateCop: s.rateCop,
    cashSessionId: s.cashSessionId,
    quoteId: s.quoteId,
    quoteNumber: row.quoteNumber,
    items,
    payments,
    returns: returnRows.map((r) => ({ ...r, items: returnItems.filter((i) => i.returnId === r.id) })),
  };
}

export interface HeldSaleRow {
  id: string;
  label: string;
  sellerName: string;
  customerName: string | null;
  totalUsd: string;
  lineCount: number;
  createdAt: Date;
}

export async function listHeldSales(dbx: DbOrTx = db): Promise<HeldSaleRow[]> {
  const rows = await dbx
    .select({
      id: sales.id,
      label: sales.holdLabel,
      sellerName: users.name,
      customerName: customers.name,
      totalUsd: sales.totalUsd,
      createdAt: sales.createdAt,
      lineCount: sql<number>`(select count(*)::int from ${saleItems} where ${saleItems.saleId} = ${sales.id})`,
    })
    .from(sales)
    .innerJoin(users, eq(users.id, sales.sellerId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(eq(sales.status, "held"))
    .orderBy(desc(sales.createdAt));
  return rows.map((r) => ({ ...r, label: r.label ?? "Sin etiqueta" }));
}

/** Lines of a held sale with fresh product data, ready for the cart. */
export async function getHeldSaleCart(id: string, warehouseId: string, dbx: DbOrTx = db): Promise<CartPayload | null> {
  const [sale] = await dbx.select().from(sales).where(and(eq(sales.id, id), eq(sales.status, "held"))).limit(1);
  if (!sale) return null;
  const items = await dbx.select().from(saleItems).where(eq(saleItems.saleId, id)).orderBy(saleItems.id);
  const lines = await toCartLines(items, sale.priceListId, warehouseId, false, dbx);
  const customer = sale.customerId ? await getCartCustomer(sale.customerId, dbx) : null;
  return { lines, customer, notes: sale.notes, heldSaleId: sale.id, holdLabel: sale.holdLabel };
}

interface SavedLine {
  productId: string;
  quantity: string;
  unitPriceUsd: string;
  discountType: "pct" | "amount";
  discountValue: string;
}

/** Shared by held sales and quotes: merge saved lines with current product data. */
export async function toCartLines(
  items: SavedLine[],
  priceListId: string,
  warehouseId: string,
  keepSavedPrice: boolean,
  dbx: DbOrTx = db,
): Promise<CartLineData[]> {
  const ids = [...new Set(items.map((i) => i.productId))];
  const productsForSale = await getProductsForSale(ids, { priceListId, warehouseId, dbx });
  const byId = new Map(productsForSale.map((p) => [p.id, p]));
  const lines: CartLineData[] = [];
  for (const item of items) {
    const p = byId.get(item.productId);
    if (!p) continue;
    lines.push({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      partNumber: p.partNumber,
      unitSymbol: p.unitSymbol,
      unitDecimals: p.unitDecimals,
      taxRate: p.taxRate,
      quantity: item.quantity,
      unitPriceUsd: keepSavedPrice ? item.unitPriceUsd : (p.priceUsd ?? item.unitPriceUsd),
      discountType: item.discountType,
      discountValue: item.discountValue,
      stockAvailable: p.stockAvailable,
      thumbUrl: p.thumbUrl,
    });
  }
  return lines;
}

export async function listSellers(dbx: DbOrTx = db): Promise<{ id: string; name: string }[]> {
  return dbx
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.isActive, true), inArray(users.role, ["admin", "seller"])))
    .orderBy(users.name);
}

export async function listReturnReasons(dbx: DbOrTx = db): Promise<{ id: string; name: string }[]> {
  return dbx
    .select({ id: adjustmentReasons.id, name: adjustmentReasons.name })
    .from(adjustmentReasons)
    .where(and(eq(adjustmentReasons.isActive, true), inArray(adjustmentReasons.kind, ["increase", "both"])))
    .orderBy(adjustmentReasons.sortOrder, adjustmentReasons.name);
}
