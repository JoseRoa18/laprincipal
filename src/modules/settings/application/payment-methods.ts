import { eq } from "drizzle-orm";
import { db, type Db, type DbOrTx } from "@/db/client";
import { currencies, paymentMethods } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/modules/core/application/audit";
import { isUniqueViolation } from "@/modules/core/application/db-errors";
import {
  CHANGE_NEEDS_DRAWER,
  PAYMENT_METHOD_FLAGS,
  paymentMethodCreateSchema,
  paymentMethodUpdateSchema,
  percentToFraction,
  type PaymentMethodCreateData,
  type PaymentMethodCreateInput,
  type PaymentMethodFlag,
  type PaymentMethodUpdateData,
  type PaymentMethodUpdateInput,
} from "../domain/catalog-forms";

export { PAYMENT_METHOD_FLAGS, paymentMethodCreateSchema, paymentMethodUpdateSchema };
export type { PaymentMethodCreateData, PaymentMethodCreateInput, PaymentMethodFlag, PaymentMethodUpdateData, PaymentMethodUpdateInput };

export type PaymentMethodRow = typeof paymentMethods.$inferSelect;

const DUPLICATE_CODE = "Ya existe un método de pago con ese código.";

async function findPaymentMethod(dbx: DbOrTx, id: string): Promise<PaymentMethodRow> {
  const [row] = await dbx.select().from(paymentMethods).where(eq(paymentMethods.id, id)).limit(1);
  if (!row) throw new AppError("NOT_FOUND", "El método de pago no existe.");
  return row;
}

/** Create a payment method for an existing, active currency. Currencies are never created here. */
export async function createPaymentMethod(input: PaymentMethodCreateData, userId: string, dbx: Db = db): Promise<PaymentMethodRow> {
  return dbx.transaction(async (tx) => {
    const [currency] = await tx
      .select({ code: currencies.code, isActive: currencies.isActive })
      .from(currencies)
      .where(eq(currencies.code, input.currencyCode))
      .limit(1);
    if (!currency) throw new AppError("VALIDATION", "La moneda no existe.", { fields: { currencyCode: "La moneda no existe." } });
    if (!currency.isActive) throw new AppError("VALIDATION", "La moneda no está activa.", { fields: { currencyCode: "La moneda no está activa." } });

    let row: PaymentMethodRow;
    try {
      [row] = await tx
        .insert(paymentMethods)
        .values({
          code: input.code,
          name: input.name,
          kind: input.kind,
          currencyCode: currency.code,
          requiresReference: input.requiresReference,
          countsInDrawer: input.countsInDrawer,
          allowsChange: input.allowsChange,
          surchargePct: percentToFraction(input.surchargePct),
          sortOrder: input.sortOrder,
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError("CONFLICT", DUPLICATE_CODE, { fields: { code: DUPLICATE_CODE } });
      throw err;
    }
    await writeAudit(tx, { userId, action: "payment_method.create", entityType: "payment_method", entityId: row.id, after: row });
    return row;
  });
}

/** Update the editable fields. Code, kind and currency are fixed once created. */
export async function updatePaymentMethod(id: string, input: PaymentMethodUpdateData, userId: string, dbx: Db = db): Promise<PaymentMethodRow> {
  return dbx.transaction(async (tx) => {
    const before = await findPaymentMethod(tx, id);
    const [row] = await tx
      .update(paymentMethods)
      .set({
        name: input.name,
        isActive: input.isActive,
        requiresReference: input.requiresReference,
        countsInDrawer: input.countsInDrawer,
        allowsChange: input.allowsChange,
        surchargePct: percentToFraction(input.surchargePct),
        sortOrder: input.sortOrder,
      })
      .where(eq(paymentMethods.id, id))
      .returning();
    await writeAudit(tx, { userId, action: "payment_method.update", entityType: "payment_method", entityId: id, before, after: row });
    return row;
  });
}

/**
 * Flip one boolean flag (inline switches). Giving change requires counting in
 * the drawer, so turning the drawer off also turns change off.
 */
export async function setPaymentMethodFlag(id: string, flag: PaymentMethodFlag, value: boolean, userId: string, dbx: Db = db): Promise<PaymentMethodRow> {
  return dbx.transaction(async (tx) => {
    const before = await findPaymentMethod(tx, id);
    if (flag === "allowsChange" && value && !before.countsInDrawer) throw new AppError("VALIDATION", CHANGE_NEEDS_DRAWER);

    const patch: Partial<Pick<PaymentMethodRow, PaymentMethodFlag>> = { [flag]: value };
    if (flag === "countsInDrawer" && !value) patch.allowsChange = false;

    const [row] = await tx.update(paymentMethods).set(patch).where(eq(paymentMethods.id, id)).returning();
    const changed = (Object.keys(patch) as PaymentMethodFlag[]).filter((k) => before[k] !== row[k]);
    if (changed.length > 0) {
      await writeAudit(tx, {
        userId,
        action: "payment_method.update",
        entityType: "payment_method",
        entityId: id,
        before: Object.fromEntries(changed.map((k) => [k, before[k]])),
        after: Object.fromEntries(changed.map((k) => [k, row[k]])),
      });
    }
    return row;
  });
}
