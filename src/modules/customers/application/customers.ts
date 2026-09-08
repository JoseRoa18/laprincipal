import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, type Db, type DbOrTx } from "@/db/client";
import { customers, priceLists } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/modules/core/application/audit";
import { isUniqueViolation } from "@/modules/core/application/db-errors";
import { customerInputSchema, normalizeText, type CustomerData, type CustomerInput } from "../domain/schema";

export type CustomerRow = typeof customers.$inferSelect;

function parse(input: CustomerInput): CustomerData {
  const result = customerInputSchema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  throw new AppError("VALIDATION", Object.values(fields)[0] ?? "Datos inválidos.", { fields });
}

/** Technicians get the TECH list unless another one was chosen explicitly. */
async function resolvePriceList(dbx: DbOrTx, data: CustomerData): Promise<string | null> {
  if (data.priceListId) {
    const [list] = await dbx.select({ id: priceLists.id }).from(priceLists).where(eq(priceLists.id, data.priceListId)).limit(1);
    if (!list) throw new AppError("VALIDATION", "La lista de precios no existe.");
    return list.id;
  }
  const code = data.customerType === "technician" ? "TECH" : "PUBLIC";
  const [list] = await dbx.select({ id: priceLists.id }).from(priceLists).where(eq(priceLists.code, code)).limit(1);
  return list?.id ?? null;
}

const DUPLICATE_MESSAGE = "Ya existe un cliente con ese documento.";

/**
 * Create a customer. Plain function (no "use server") so the POS quick-add
 * and the customers screen share it.
 */
export async function createCustomer(input: CustomerInput, userId?: string | null, dbx: Db = db): Promise<CustomerRow> {
  const data = parse(input);
  return dbx.transaction(async (tx) => {
    const priceListId = await resolvePriceList(tx, data);
    let row: CustomerRow;
    try {
      [row] = await tx
        .insert(customers)
        .values({
          kind: data.kind,
          docType: data.docType,
          docNumber: data.docType === "NONE" ? null : data.docNumber,
          name: data.name,
          phone: data.phone,
          email: data.email,
          address: data.address,
          customerType: data.customerType,
          priceListId,
          notes: data.notes,
          isActive: data.isActive,
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError("CONFLICT", DUPLICATE_MESSAGE, { fields: { docNumber: DUPLICATE_MESSAGE } });
      throw err;
    }
    await writeAudit(tx, { userId: userId ?? null, action: "customer.create", entityType: "customer", entityId: row.id, after: row });
    return row;
  });
}

export async function updateCustomer(id: string, input: CustomerInput, userId: string, dbx: Db = db): Promise<CustomerRow> {
  const data = parse(input);
  return dbx.transaction(async (tx) => {
    const [before] = await tx.select().from(customers).where(and(eq(customers.id, id), isNull(customers.deletedAt))).limit(1);
    if (!before) throw new AppError("NOT_FOUND", "El cliente no existe.");
    const priceListId = await resolvePriceList(tx, data);
    let row: CustomerRow;
    try {
      [row] = await tx
        .update(customers)
        .set({
          kind: data.kind,
          docType: data.docType,
          docNumber: data.docType === "NONE" ? null : data.docNumber,
          name: data.name,
          phone: data.phone,
          email: data.email,
          address: data.address,
          customerType: data.customerType,
          priceListId,
          notes: data.notes,
          isActive: data.isActive,
        })
        .where(eq(customers.id, id))
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError("CONFLICT", DUPLICATE_MESSAGE, { fields: { docNumber: DUPLICATE_MESSAGE } });
      throw err;
    }
    await writeAudit(tx, { userId, action: "customer.update", entityType: "customer", entityId: id, before, after: row });
    return row;
  });
}

export async function setCustomerActive(id: string, isActive: boolean, userId: string, dbx: Db = db): Promise<CustomerRow> {
  return dbx.transaction(async (tx) => {
    const [before] = await tx.select().from(customers).where(and(eq(customers.id, id), isNull(customers.deletedAt))).limit(1);
    if (!before) throw new AppError("NOT_FOUND", "El cliente no existe.");
    const [row] = await tx.update(customers).set({ isActive }).where(eq(customers.id, id)).returning();
    await writeAudit(tx, {
      userId,
      action: "customer.update",
      entityType: "customer",
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive: row.isActive },
    });
    return row;
  });
}

export interface CustomerSearchResult {
  id: string;
  name: string;
  docType: string;
  docNumber: string | null;
  phone: string | null;
  customerType: "public" | "technician";
  priceListId: string | null;
}

/** Quick search by name, document or phone (active customers only). Shared with the POS. */
export async function searchCustomers(q: string, limit = 10, dbx: DbOrTx = db): Promise<CustomerSearchResult[]> {
  const term = q.trim();
  if (!term) return [];
  const pattern = `%${normalizeText(term)}%`;
  const rawPattern = `%${term}%`;
  return dbx
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
    .where(
      and(
        eq(customers.isActive, true),
        isNull(customers.deletedAt),
        or(
          sql`normalize_text(${customers.name}) ILIKE ${pattern}`,
          sql`${customers.docNumber} ILIKE ${rawPattern}`,
          sql`${customers.phone} ILIKE ${rawPattern}`,
        ),
      ),
    )
    .orderBy(customers.name)
    .limit(limit);
}
