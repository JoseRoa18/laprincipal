import { and, count, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { customers, priceLists, quotes, sales, users } from "@/db/schema";
import { normalizeText } from "../domain/schema";

export interface CustomerListRow {
  id: string;
  kind: "person" | "company";
  docType: string;
  docNumber: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  customerType: "public" | "technician";
  isActive: boolean;
  priceListName: string | null;
  createdAt: Date;
}

export interface ListCustomersOptions {
  q?: string;
  type?: "public" | "technician" | "";
  includeInactive?: boolean;
  page: number;
  pageSize: number;
}

export async function listCustomers(opts: ListCustomersOptions, dbx: DbOrTx = db): Promise<{ rows: CustomerListRow[]; total: number }> {
  const conditions: SQL[] = [isNull(customers.deletedAt)];
  if (!opts.includeInactive) conditions.push(eq(customers.isActive, true));
  if (opts.type === "public" || opts.type === "technician") conditions.push(eq(customers.customerType, opts.type));
  const term = opts.q?.trim();
  if (term) {
    const pattern = `%${normalizeText(term)}%`;
    const rawPattern = `%${term}%`;
    const search = or(
      sql`normalize_text(${customers.name}) ILIKE ${pattern}`,
      sql`${customers.docNumber} ILIKE ${rawPattern}`,
      sql`${customers.phone} ILIKE ${rawPattern}`,
    );
    if (search) conditions.push(search);
  }
  const where = and(...conditions);

  const [{ total }] = await dbx.select({ total: count() }).from(customers).where(where);
  const rows = await dbx
    .select({
      id: customers.id,
      kind: customers.kind,
      docType: customers.docType,
      docNumber: customers.docNumber,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      customerType: customers.customerType,
      isActive: customers.isActive,
      priceListName: priceLists.name,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .leftJoin(priceLists, eq(priceLists.id, customers.priceListId))
    .where(where)
    .orderBy(customers.name)
    .limit(opts.pageSize)
    .offset((opts.page - 1) * opts.pageSize);

  return { rows, total };
}

export async function getCustomer(id: string, dbx: DbOrTx = db) {
  const [row] = await dbx
    .select({ customer: customers, priceListName: priceLists.name, priceListCode: priceLists.code })
    .from(customers)
    .leftJoin(priceLists, eq(priceLists.id, customers.priceListId))
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
    .limit(1);
  if (!row) return null;
  return { ...row.customer, priceListName: row.priceListName, priceListCode: row.priceListCode };
}

export interface CustomerSaleRow {
  id: string;
  number: string | null;
  saleDate: Date;
  status: string;
  totalUsd: string;
  sellerName: string;
}

export interface CustomerQuoteRow {
  id: string;
  number: string | null;
  createdAt: Date;
  status: string;
  validUntil: string;
  totalUsd: string;
}

export async function getCustomerHistory(id: string, dbx: DbOrTx = db, limit = 50) {
  const [salesRows, quoteRows, totals] = await Promise.all([
    dbx
      .select({
        id: sales.id,
        number: sales.number,
        saleDate: sales.saleDate,
        status: sales.status,
        totalUsd: sales.totalUsd,
        sellerName: users.name,
      })
      .from(sales)
      .innerJoin(users, eq(users.id, sales.sellerId))
      .where(and(eq(sales.customerId, id), sql`${sales.status} <> 'held'`))
      .orderBy(desc(sales.saleDate))
      .limit(limit),
    dbx
      .select({
        id: quotes.id,
        number: quotes.number,
        createdAt: quotes.createdAt,
        status: quotes.status,
        validUntil: quotes.validUntil,
        totalUsd: quotes.totalUsd,
      })
      .from(quotes)
      .where(eq(quotes.customerId, id))
      .orderBy(desc(quotes.createdAt))
      .limit(limit),
    dbx
      .select({
        salesCount: count(),
        totalUsd: sql<string>`coalesce(sum(${sales.totalUsd}), 0)`,
        lastSaleAt: sql<Date | null>`max(${sales.saleDate})`,
      })
      .from(sales)
      .where(and(eq(sales.customerId, id), sql`${sales.status} in ('completed', 'partially_refunded', 'refunded')`)),
  ]);
  return {
    sales: salesRows as CustomerSaleRow[],
    quotes: quoteRows as CustomerQuoteRow[],
    totals: { salesCount: totals[0]?.salesCount ?? 0, totalUsd: totals[0]?.totalUsd ?? "0", lastSaleAt: totals[0]?.lastSaleAt ?? null },
  };
}

export async function listPriceLists(dbx: DbOrTx = db) {
  return dbx
    .select({ id: priceLists.id, code: priceLists.code, name: priceLists.name, isDefault: priceLists.isDefault })
    .from(priceLists)
    .where(eq(priceLists.isActive, true))
    .orderBy(desc(priceLists.isDefault), priceLists.name);
}
