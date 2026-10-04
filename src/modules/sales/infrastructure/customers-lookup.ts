import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, type Db, type DbOrTx } from "@/db/client";
import { customers } from "@/db/schema";
import { normalizeSearch } from "@/modules/catalog/infrastructure/product-lookup";
import { createCustomer, findCustomerByDocument } from "@/modules/customers/application/customers";
import { formatDoc, type CustomerInput } from "@/modules/customers/domain/schema";
import type { CartCustomer } from "../application/schemas";

export interface CustomerSearchResult extends CartCustomer {
  docType: string;
  docNumber: string | null;
}

const selection = {
  id: customers.id,
  name: customers.name,
  phone: customers.phone,
  customerType: customers.customerType,
  priceListId: customers.priceListId,
  docType: customers.docType,
  docNumber: customers.docNumber,
};

/**
 * Name, document or phone search for the POS customer picker. Unlike the
 * customers module search, an empty term lists the first customers so the
 * picker is never blank.
 */
export async function searchCustomers(q: string, opts: { limit?: number; dbx?: DbOrTx } = {}): Promise<CustomerSearchResult[]> {
  const dbx = opts.dbx ?? db;
  const term = q.trim();
  const active = and(isNull(customers.deletedAt), eq(customers.isActive, true));
  if (!term) {
    return dbx.select(selection).from(customers).where(active).orderBy(customers.name).limit(opts.limit ?? 10);
  }
  const like = `%${normalizeSearch(term)}%`;
  return dbx
    .select(selection)
    .from(customers)
    .where(
      and(
        active,
        or(
          sql`normalize_text(${customers.name}) like ${like}`,
          sql`coalesce(${customers.docNumber}, '') ilike ${`%${term}%`}`,
          sql`coalesce(${customers.phone}, '') ilike ${`%${term}%`}`,
        ),
      ),
    )
    .orderBy(customers.name)
    .limit(opts.limit ?? 10);
}

function toCartCustomer(row: { id: string; name: string; docType: string; docNumber: string | null; phone: string | null; customerType: "public" | "technician"; priceListId: string | null }): CartCustomer {
  return { id: row.id, name: row.name, doc: formatDoc(row.docType, row.docNumber) || undefined, phone: row.phone, customerType: row.customerType, priceListId: row.priceListId };
}

export async function getCartCustomer(id: string, dbx: DbOrTx = db): Promise<CartCustomer | null> {
  const [row] = await dbx.select(selection).from(customers).where(eq(customers.id, id)).limit(1);
  return row ? toCartCustomer(row) : null;
}

/** The POS starts every sale by cédula/RIF: the customer with that document, if registered. */
export async function findCartCustomerByDocument(docType: string, docNumber: string, dbx: DbOrTx = db): Promise<CartCustomer | null> {
  const row = await findCustomerByDocument(docType, docNumber, dbx);
  return row ? toCartCustomer(row) : null;
}

/** New customer from the POS, delegated to the customers module (validation, audit, TECH list, duplicates). */
export async function createQuickCustomer(input: CustomerInput, userId: string, dbx: Db = db): Promise<CartCustomer> {
  return toCartCustomer(await createCustomer(input, userId, dbx));
}
