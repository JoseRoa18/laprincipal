"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { applyAdjustment, cancelAdjustment, saveAdjustmentDraft } from "@/modules/inventory/application/adjustments";
import { adjustmentSchema } from "@/modules/inventory/application/schemas";

function revalidateStock(id: string) {
  revalidatePath("/inventario");
  revalidatePath("/inventario/movimientos");
  revalidatePath("/inventario/alertas");
  revalidatePath("/inventario/ajustes");
  revalidatePath(`/inventario/ajustes/${id}`);
  revalidatePath("/compras/que-comprar");
  revalidatePath("/productos");
}

/** Save (create or update) a draft adjustment. */
export async function saveAdjustmentAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const data = parseInput(adjustmentSchema, input);
    const result = await saveAdjustmentDraft(data, user);
    revalidatePath("/inventario/ajustes");
    revalidatePath(`/inventario/ajustes/${result.id}`);
    return result;
  });
}

/** Save the draft and apply it in one transaction. */
export async function saveAndApplyAdjustmentAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const data = parseInput(adjustmentSchema, input);
    const result = await db.transaction(async (tx) => {
      const saved = await saveAdjustmentDraft(data, user, tx);
      return applyAdjustment(saved.id, user, tx);
    });
    revalidateStock(result.id);
    return result;
  });
}

export async function applyAdjustmentAction(id: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const result = await applyAdjustment(id, user);
    revalidateStock(id);
    return result;
  });
}

export async function cancelAdjustmentAction(id: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    await cancelAdjustment(id, user);
    revalidatePath("/inventario/ajustes");
    revalidatePath(`/inventario/ajustes/${id}`);
    return { id };
  });
}
