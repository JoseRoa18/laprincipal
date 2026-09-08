import { and, eq, ne } from "drizzle-orm";
import { db, type Db, type DbOrTx } from "@/db/client";
import { taxes } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/modules/core/application/audit";
import { percentToFraction, taxInputSchema, type TaxData, type TaxInput } from "../domain/catalog-forms";

export { taxInputSchema };
export type { TaxData, TaxInput };

export type TaxRow = typeof taxes.$inferSelect;

const DEFAULT_MUST_BE_ACTIVE = "El impuesto predeterminado debe estar activo.";
const PICK_ANOTHER_DEFAULT = "Marca otro impuesto como predeterminado antes de quitarle este.";
const CANNOT_DEACTIVATE_DEFAULT = "No puedes desactivar el impuesto predeterminado. Marca otro como predeterminado primero.";

async function findTax(dbx: DbOrTx, id: string): Promise<TaxRow> {
  const [row] = await dbx.select().from(taxes).where(eq(taxes.id, id)).limit(1);
  if (!row) throw new AppError("NOT_FOUND", "El impuesto no existe.");
  return row;
}

/** Create a tax. Marking it as default unsets the previous default in the same transaction. */
export async function createTax(input: TaxData, userId: string, dbx: Db = db): Promise<TaxRow> {
  if (input.isDefault && !input.isActive) {
    throw new AppError("VALIDATION", DEFAULT_MUST_BE_ACTIVE, { fields: { isActive: DEFAULT_MUST_BE_ACTIVE } });
  }
  return dbx.transaction(async (tx) => {
    if (input.isDefault) await tx.update(taxes).set({ isDefault: false }).where(eq(taxes.isDefault, true));
    const [row] = await tx
      .insert(taxes)
      .values({ name: input.name, rate: percentToFraction(input.ratePct), isDefault: input.isDefault, isActive: input.isActive })
      .returning();
    await writeAudit(tx, { userId, action: "tax.create", entityType: "tax", entityId: row.id, after: row });
    return row;
  });
}

/** Update name, rate and flags. The current default can only lose the flag by choosing another default. */
export async function updateTax(id: string, input: TaxData, userId: string, dbx: Db = db): Promise<TaxRow> {
  if (input.isDefault && !input.isActive) {
    throw new AppError("VALIDATION", DEFAULT_MUST_BE_ACTIVE, { fields: { isActive: DEFAULT_MUST_BE_ACTIVE } });
  }
  return dbx.transaction(async (tx) => {
    const before = await findTax(tx, id);
    if (before.isDefault && !input.isDefault) {
      throw new AppError("VALIDATION", PICK_ANOTHER_DEFAULT, { fields: { isDefault: PICK_ANOTHER_DEFAULT } });
    }
    if (input.isDefault) {
      await tx.update(taxes).set({ isDefault: false }).where(and(eq(taxes.isDefault, true), ne(taxes.id, id)));
    }
    const [row] = await tx
      .update(taxes)
      .set({ name: input.name, rate: percentToFraction(input.ratePct), isDefault: input.isDefault, isActive: input.isActive })
      .where(eq(taxes.id, id))
      .returning();
    await writeAudit(tx, { userId, action: "tax.update", entityType: "tax", entityId: id, before, after: row });
    return row;
  });
}

/** Activate or deactivate a tax. The default tax cannot be deactivated. */
export async function setTaxActive(id: string, isActive: boolean, userId: string, dbx: Db = db): Promise<TaxRow> {
  return dbx.transaction(async (tx) => {
    const before = await findTax(tx, id);
    if (!isActive && before.isDefault) throw new AppError("VALIDATION", CANNOT_DEACTIVATE_DEFAULT);
    if (before.isActive === isActive) return before;
    const [row] = await tx.update(taxes).set({ isActive }).where(eq(taxes.id, id)).returning();
    await writeAudit(tx, {
      userId,
      action: "tax.update",
      entityType: "tax",
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive: row.isActive },
    });
    return row;
  });
}

/** Make a tax the only default one (must be active). */
export async function setDefaultTax(id: string, userId: string, dbx: Db = db): Promise<TaxRow> {
  return dbx.transaction(async (tx) => {
    const before = await findTax(tx, id);
    if (!before.isActive) throw new AppError("VALIDATION", "Activa el impuesto antes de marcarlo como predeterminado.");
    if (before.isDefault) return before;
    const previous = await tx
      .update(taxes)
      .set({ isDefault: false })
      .where(and(eq(taxes.isDefault, true), ne(taxes.id, id)))
      .returning({ id: taxes.id });
    const [row] = await tx.update(taxes).set({ isDefault: true }).where(eq(taxes.id, id)).returning();
    for (const p of previous) {
      await writeAudit(tx, { userId, action: "tax.update", entityType: "tax", entityId: p.id, before: { isDefault: true }, after: { isDefault: false } });
    }
    await writeAudit(tx, { userId, action: "tax.update", entityType: "tax", entityId: id, before: { isDefault: false }, after: { isDefault: true } });
    return row;
  });
}
