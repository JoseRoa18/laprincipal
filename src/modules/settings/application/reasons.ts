import { eq } from "drizzle-orm";
import { db, type Db, type DbOrTx } from "@/db/client";
import { adjustmentReasons } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/modules/core/application/audit";
import { isUniqueViolation } from "@/modules/core/application/db-errors";
import { reasonInputSchema, type ReasonData, type ReasonInput } from "../domain/catalog-forms";

export { reasonInputSchema };
export type { ReasonData, ReasonInput };

export type AdjustmentReasonRow = typeof adjustmentReasons.$inferSelect;

const DUPLICATE_NAME = "Ya existe un motivo con ese nombre.";

async function findReason(dbx: DbOrTx, id: string): Promise<AdjustmentReasonRow> {
  const [row] = await dbx.select().from(adjustmentReasons).where(eq(adjustmentReasons.id, id)).limit(1);
  if (!row) throw new AppError("NOT_FOUND", "El motivo no existe.");
  return row;
}

export async function createReason(input: ReasonData, userId: string, dbx: Db = db): Promise<AdjustmentReasonRow> {
  return dbx.transaction(async (tx) => {
    let row: AdjustmentReasonRow;
    try {
      [row] = await tx
        .insert(adjustmentReasons)
        .values({ name: input.name, kind: input.kind, sortOrder: input.sortOrder, isActive: input.isActive })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError("CONFLICT", DUPLICATE_NAME, { fields: { name: DUPLICATE_NAME } });
      throw err;
    }
    await writeAudit(tx, { userId, action: "adjustment_reason.create", entityType: "adjustment_reason", entityId: row.id, after: row });
    return row;
  });
}

export async function updateReason(id: string, input: ReasonData, userId: string, dbx: Db = db): Promise<AdjustmentReasonRow> {
  return dbx.transaction(async (tx) => {
    const before = await findReason(tx, id);
    let row: AdjustmentReasonRow;
    try {
      [row] = await tx
        .update(adjustmentReasons)
        .set({ name: input.name, kind: input.kind, sortOrder: input.sortOrder, isActive: input.isActive })
        .where(eq(adjustmentReasons.id, id))
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError("CONFLICT", DUPLICATE_NAME, { fields: { name: DUPLICATE_NAME } });
      throw err;
    }
    await writeAudit(tx, { userId, action: "adjustment_reason.update", entityType: "adjustment_reason", entityId: id, before, after: row });
    return row;
  });
}

/** "Delete" is deactivating: movements keep referencing the reason. */
export async function setReasonActive(id: string, isActive: boolean, userId: string, dbx: Db = db): Promise<AdjustmentReasonRow> {
  return dbx.transaction(async (tx) => {
    const before = await findReason(tx, id);
    if (before.isActive === isActive) return before;
    const [row] = await tx.update(adjustmentReasons).set({ isActive }).where(eq(adjustmentReasons.id, id)).returning();
    await writeAudit(tx, {
      userId,
      action: "adjustment_reason.update",
      entityType: "adjustment_reason",
      entityId: id,
      before: { isActive: before.isActive },
      after: { isActive: row.isActive },
    });
    return row;
  });
}
