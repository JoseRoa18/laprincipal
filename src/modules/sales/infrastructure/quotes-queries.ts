import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { customers, products, quoteItems, quotes, sales, units, users } from "@/db/schema";
import { businessDate } from "@/lib/format";
import type { CartPayload } from "../application/schemas";
import { getCartCustomer } from "./customers-lookup";
import { toCartLines } from "./sales-queries";

export type QuoteStatus = (typeof quotes.$inferSelect)["status"];
export { QUOTE_STATUS_LABEL } from "../application/labels";

/** A quote past its validity date shows as expired even before the nightly sweep. */
export function effectiveQuoteStatus(status: QuoteStatus, validUntil: string, today = businessDate()): QuoteStatus {
  if ((status === "open" || status === "accepted") && validUntil < today) return "expired";
  return status;
}

export interface QuotesFilter {
  q?: string;
  status?: QuoteStatus | "all";
  page: number;
  pageSize: number;
}

export interface QuoteListRow {
  id: string;
  number: string | null;
  createdAt: Date;
  validUntil: string;
  customerName: string | null;
  sellerName: string;
  totalUsd: string;
  rateVes: string;
  status: QuoteStatus;
  reservesStock: boolean;
}

export async function listQuotes(f: QuotesFilter, dbx: DbOrTx = db): Promise<{ rows: QuoteListRow[]; total: number }> {
  const term = f.q?.trim();
  const where = and(
    f.status && f.status !== "all"
      ? f.status === "open"
        ? inArray(quotes.status, ["open", "accepted"])
        : eq(quotes.status, f.status)
      : undefined,
    term ? or(ilike(quotes.number, `%${term}%`), sql`normalize_text(${customers.name}) like ${`%${term.toLowerCase()}%`}`) : undefined,
  );
  const base = dbx.select({ total: count() }).from(quotes).leftJoin(customers, eq(customers.id, quotes.customerId)).where(where);
  const [{ total }] = await base;
  const rows = await dbx
    .select({
      id: quotes.id,
      number: quotes.number,
      createdAt: quotes.createdAt,
      validUntil: quotes.validUntil,
      customerName: customers.name,
      sellerName: users.name,
      totalUsd: quotes.totalUsd,
      rateVes: quotes.rateVes,
      status: quotes.status,
      reservesStock: quotes.reservesStock,
    })
    .from(quotes)
    .leftJoin(customers, eq(customers.id, quotes.customerId))
    .innerJoin(users, eq(users.id, quotes.sellerId))
    .where(where)
    .orderBy(desc(quotes.createdAt))
    .limit(f.pageSize)
    .offset((f.page - 1) * f.pageSize);
  const today = businessDate();
  return { rows: rows.map((r) => ({ ...r, status: effectiveQuoteStatus(r.status, r.validUntil, today) })), total };
}

export interface QuoteDetail {
  id: string;
  number: string | null;
  status: QuoteStatus;
  createdAt: Date;
  validUntil: string;
  notes: string | null;
  reservesStock: boolean;
  customer: { id: string; name: string; docType: string; docNumber: string | null; phone: string | null } | null;
  seller: { id: string; name: string };
  subtotalUsd: string;
  discountUsd: string;
  taxUsd: string;
  totalUsd: string;
  rateVes: string;
  rateCop: string;
  priceListId: string;
  convertedSale: { id: string; number: string | null } | null;
  items: {
    id: string;
    productId: string;
    sku: string;
    partNumber: string | null;
    description: string;
    quantity: string;
    unitPriceUsd: string;
    discountType: "pct" | "amount";
    discountValue: string;
    taxRate: string;
    taxUsd: string;
    lineTotalUsd: string;
    unitDecimals: number;
    unitSymbol: string;
  }[];
}

export async function getQuoteDetail(id: string, dbx: DbOrTx = db): Promise<QuoteDetail | null> {
  const [row] = await dbx
    .select({
      quote: quotes,
      customer: { id: customers.id, name: customers.name, docType: customers.docType, docNumber: customers.docNumber, phone: customers.phone },
      seller: { id: users.id, name: users.name },
    })
    .from(quotes)
    .leftJoin(customers, eq(customers.id, quotes.customerId))
    .innerJoin(users, eq(users.id, quotes.sellerId))
    .where(eq(quotes.id, id))
    .limit(1);
  if (!row) return null;
  const items = await dbx
    .select({
      id: quoteItems.id,
      productId: quoteItems.productId,
      sku: products.sku,
      partNumber: products.partNumber,
      description: quoteItems.description,
      quantity: quoteItems.quantity,
      unitPriceUsd: quoteItems.unitPriceUsd,
      discountType: quoteItems.discountType,
      discountValue: quoteItems.discountValue,
      taxRate: quoteItems.taxRate,
      taxUsd: quoteItems.taxUsd,
      lineTotalUsd: quoteItems.lineTotalUsd,
      unitDecimals: units.decimals,
      unitSymbol: units.symbol,
    })
    .from(quoteItems)
    .innerJoin(products, eq(products.id, quoteItems.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .where(eq(quoteItems.quoteId, id))
    .orderBy(quoteItems.sortOrder, quoteItems.id);
  const [sale] = await dbx.select({ id: sales.id, number: sales.number }).from(sales).where(eq(sales.quoteId, id)).limit(1);
  const q = row.quote;
  return {
    id: q.id,
    number: q.number,
    status: effectiveQuoteStatus(q.status, q.validUntil),
    createdAt: q.createdAt,
    validUntil: q.validUntil,
    notes: q.notes,
    reservesStock: q.reservesStock,
    customer: row.customer?.id ? { ...row.customer, id: row.customer.id, name: row.customer.name ?? "" } : null,
    seller: row.seller,
    subtotalUsd: q.subtotalUsd,
    discountUsd: q.discountUsd,
    taxUsd: q.taxUsd,
    totalUsd: q.totalUsd,
    rateVes: q.rateVes,
    rateCop: q.rateCop,
    priceListId: q.priceListId,
    convertedSale: sale ?? null,
    items,
  };
}

/** Lines of an open quote with the quoted prices, ready for the POS cart. */
export async function getQuoteCart(id: string, warehouseId: string, dbx: DbOrTx = db): Promise<CartPayload | null> {
  const [quote] = await dbx.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  if (!quote) return null;
  if (effectiveQuoteStatus(quote.status, quote.validUntil) !== "open" && quote.status !== "accepted") return null;
  const items = await dbx.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(quoteItems.sortOrder, quoteItems.id);
  const lines = await toCartLines(items, quote.priceListId, warehouseId, true, dbx);
  const customer = quote.customerId ? await getCartCustomer(quote.customerId, dbx) : null;
  return { lines, customer, notes: quote.notes, quoteId: quote.id, quoteNumber: quote.number };
}
