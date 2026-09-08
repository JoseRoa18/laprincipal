"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { addCountItem, applyCount, cancelCount, createCount, recordCountItem } from "@/modules/inventory/application/counts";
import { countAddItemSchema, countCreateSchema, countItemSchema } from "@/modules/inventory/application/schemas";

export async function createCountAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const data = parseInput(countCreateSchema, input);
    const result = await createCount(data, user);
    revalidatePath("/inventario/conteos");
    return result;
  });
}

export async function recordCountItemAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const data = parseInput(countItemSchema, input);
    const item = await recordCountItem(data, user);
    return { itemId: item.id, countedQty: item.countedQty, difference: item.difference };
  });
}

export async function addCountItemAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const data = parseInput(countAddItemSchema, input);
    const item = await addCountItem(data, user);
    revalidatePath(`/inventario/conteos/${data.countId}`);
    return { itemId: item.id, productId: item.productId, expectedQty: item.expectedQty };
  });
}

export async function applyCountAction(id: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const result = await applyCount(id, user);
    revalidatePath("/inventario");
    revalidatePath("/inventario/movimientos");
    revalidatePath("/inventario/alertas");
    revalidatePath("/inventario/conteos");
    revalidatePath(`/inventario/conteos/${id}`);
    revalidatePath("/compras/que-comprar");
    revalidatePath("/productos");
    return result;
  });
}

export async function cancelCountAction(id: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    await cancelCount(id, user);
    revalidatePath("/inventario/conteos");
    revalidatePath(`/inventario/conteos/${id}`);
    return { id };
  });
}
