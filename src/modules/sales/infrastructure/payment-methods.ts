import { eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { paymentMethods } from "@/db/schema";

export interface PosPaymentMethod {
  id: string;
  code: string;
  name: string;
  kind: "cash" | "mobile_payment" | "card_terminal" | "transfer" | "crypto";
  currencyCode: string;
  requiresReference: boolean;
  allowsChange: boolean;
  countsInDrawer: boolean;
}

export async function listActivePaymentMethods(dbx: DbOrTx = db): Promise<PosPaymentMethod[]> {
  const rows = await dbx
    .select({
      id: paymentMethods.id,
      code: paymentMethods.code,
      name: paymentMethods.name,
      kind: paymentMethods.kind,
      currencyCode: paymentMethods.currencyCode,
      requiresReference: paymentMethods.requiresReference,
      allowsChange: paymentMethods.allowsChange,
      countsInDrawer: paymentMethods.countsInDrawer,
    })
    .from(paymentMethods)
    .where(eq(paymentMethods.isActive, true))
    .orderBy(paymentMethods.sortOrder, paymentMethods.name);
  return rows;
}
