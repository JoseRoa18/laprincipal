"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { parseInput, runAction } from "@/lib/action";
import { assertRole, getSessionUser } from "@/lib/auth-guards";
import type { RateSet } from "@/modules/currency/domain/conversion";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { applyReceipt, deleteReceiptDraft, saveReceiptDraft, voidReceipt } from "@/modules/purchasing/application/receipts";
import { receiptSchema, voidReceiptSchema } from "@/modules/purchasing/application/schemas";

function revalidateStock(id: string) {
  revalidatePath("/inventario");
  revalidatePath("/inventario/movimientos");
  revalidatePath("/inventario/alertas");
  revalidatePath("/compras");
  revalidatePath("/compras/entradas");
  revalidatePath(`/compras/entradas/${id}`);
  revalidatePath("/compras/proveedores");
  revalidatePath("/compras/que-comprar");
  revalidatePath("/productos");
}

/** Rates in force on a given day (used by the receipt form when the date changes). */
export async function ratesForDateAction(date: string): Promise<{ rateSet: RateSet; missing: string[] }> {
  const user = await getSessionUser();
  if (!user) return { rateSet: { USD: "1" }, missing: [] };
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  const snap = await getRatesSnapshot(valid);
  return { rateSet: snap.rateSet, missing: snap.missing };
}

export async function saveReceiptAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const data = parseInput(receiptSchema, input);
    const result = await saveReceiptDraft(data, user);
    revalidatePath("/compras/entradas");
    revalidatePath(`/compras/entradas/${result.id}`);
    revalidatePath("/compras");
    return result;
  });
}

/** Save the draft and apply it in one transaction. */
export async function saveAndApplyReceiptAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const data = parseInput(receiptSchema, input);
    const result = await db.transaction(async (tx) => {
      const saved = await saveReceiptDraft(data, user, tx);
      return applyReceipt(saved.id, user, tx);
    });
    revalidateStock(result.id);
    return result;
  });
}

export async function applyReceiptAction(id: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const result = await applyReceipt(id, user);
    revalidateStock(id);
    return result;
  });
}

export async function voidReceiptAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const data = parseInput(voidReceiptSchema, input);
    await voidReceipt(data.id, data.reason, user);
    revalidateStock(data.id);
    return { id: data.id };
  });
}

export async function deleteReceiptDraftAction(id: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    await deleteReceiptDraft(id, user);
    revalidatePath("/compras/entradas");
    revalidatePath("/compras");
    return { id };
  });
}
