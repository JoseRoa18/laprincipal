import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, type Db, type DbOrTx } from "@/db/client";
import { customers } from "@/db/schema";
import { normalizeSearch } from "@/modules/catalog/infrastructure/product-lookup";
import { createCustomer } from "@/modules/customers/application/customers";
import type { CartCustomer, QuickCustomerInput } from "../application/schemas";

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

export async function getCartCustomer(id: string, dbx: DbOrTx = db): Promise<CartCustomer | null> {
  const [row] = await dbx.select(selection).from(customers).where(eq(customers.id, id)).limit(1);
  if (!row) return null;
  return { id: row.id, name: row.name, phone: row.phone, customerType: row.customerType, priceListId: row.priceListId };
}

/** Quick create from the POS, delegated to the customers module (audit, TECH list, duplicates). */
export async function createQuickCustomer(input: QuickCustomerInput, userId: string, dbx: Db = db): Promise<CartCustomer> {
  const row = await createCustomer(
    {
      name: input.name,
      phone: input.phone ?? null,
      docType: input.docType,
      docNumber: input.docType === "NONE" ? null : (input.docNumber ?? null),
      customerType: input.customerType,
    },
    userId,
    dbx,
  );
  return { id: row.id, name: row.name, phone: row.phone, customerType: row.customerType, priceListId: row.priceListId };
}
