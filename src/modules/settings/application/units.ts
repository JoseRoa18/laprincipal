import { count, eq } from "drizzle-orm";
import { db, type Db, type DbOrTx } from "@/db/client";
import { products, units } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/modules/core/application/audit";
import { isUniqueViolation } from "@/modules/core/application/db-errors";
import { unitInputSchema, type UnitData, type UnitInput } from "../domain/catalog-forms";

export { unitInputSchema };
export type { UnitData, UnitInput };

export type UnitRow = typeof units.$inferSelect;

const DUPLICATE_NAME = "Ya existe una unidad con ese nombre.";

/** Postgres `foreign_key_violation` (SQLSTATE 23503), looking through Drizzle's wrapped causes. */
function isForeignKeyViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    if ((current as { code?: unknown }).code === "23503") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function findUnit(dbx: DbOrTx, id: string): Promise<UnitRow> {
  const [row] = await dbx.select().from(units).where(eq(units.id, id)).limit(1);
  if (!row) throw new AppError("NOT_FOUND", "La unidad no existe.");
  return row;
}

/** Products (active or archived) that still reference the unit. */
export async function countUnitProducts(id: string, dbx: DbOrTx = db): Promise<number> {
  const [row] = await dbx.select({ total: count() }).from(products).where(eq(products.unitId, id));
  return row?.total ?? 0;
}

export async function createUnit(input: UnitData, userId: string, dbx: Db = db): Promise<UnitRow> {
  return dbx.transaction(async (tx) => {
    let row: UnitRow;
    try {
      [row] = await tx.insert(units).values({ name: input.name, symbol: input.symbol, decimals: input.decimals }).returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError("CONFLICT", DUPLICATE_NAME, { fields: { name: DUPLICATE_NAME } });
      throw err;
    }
    await writeAudit(tx, { userId, action: "unit.create", entityType: "unit", entityId: row.id, after: row });
    return row;
  });
}

export async function updateUnit(id: string, input: UnitData, userId: string, dbx: Db = db): Promise<UnitRow> {
  return dbx.transaction(async (tx) => {
    const before = await findUnit(tx, id);
    let row: UnitRow;
    try {
      [row] = await tx
        .update(units)
        .set({ name: input.name, symbol: input.symbol, decimals: input.decimals })
        .where(eq(units.id, id))
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError("CONFLICT", DUPLICATE_NAME, { fields: { name: DUPLICATE_NAME } });
      throw err;
    }
    await writeAudit(tx, { userId, action: "unit.update", entityType: "unit", entityId: id, before, after: row });
    return row;
  });
}

/** Units have no active flag: delete is allowed only while no product references the unit. */
export async function deleteUnit(id: string, userId: string, dbx: Db = db): Promise<void> {
  return dbx.transaction(async (tx) => {
    const before = await findUnit(tx, id);
    const total = await countUnitProducts(id, tx);
    if (total > 0) {
      throw new AppError("CONFLICT", `La unidad está en uso por ${total} ${total === 1 ? "producto" : "productos"} y no se puede eliminar.`);
    }
    try {
      await tx.delete(units).where(eq(units.id, id));
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new AppError("CONFLICT", "La unidad está en uso y no se puede eliminar.");
      throw err;
    }
    await writeAudit(tx, { userId, action: "unit.delete", entityType: "unit", entityId: id, before });
  });
}
