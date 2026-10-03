"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { AppError } from "@/lib/errors";
import { findProductByCode } from "@/modules/catalog/infrastructure/product-lookup";
import { getDefaultLocation } from "@/modules/core/application/context";
import { addCountItem, applyCount, cancelCount, createCount, recordCountItem, revealCount } from "@/modules/inventory/application/counts";
import { countAddItemSchema, countCreateSchema, countItemSchema } from "@/modules/inventory/application/schemas";
import { getCountItem } from "@/modules/inventory/infrastructure/counts";

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
    return { itemId: item.id, countedQty: item.countedQty, difference: item.expectedHidden ? null : item.difference };
  });
}

export async function addCountItemAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    const data = parseInput(countAddItemSchema, input);
    const added = await addCountItem(data, user);
    revalidatePath(`/inventario/conteos/${data.countId}`);
    const item = await getCountItem(data.countId, added.id);
    if (!item) throw new AppError("NOT_FOUND", "El producto del conteo no existe.");
    return item;
  });
}

/**
 * Barcode, SKU or part number typed or scanned on the count screen. Returns
 * only the product identity: no stock or cost, so a blind count stays blind.
 */
export async function findCountProductAction(code: string) {
  return runAction(async () => {
    await assertRole("admin", "warehouse");
    const { warehouseId } = await getDefaultLocation();
    const product = await findProductByCode(code, { warehouseId });
    return product ? { id: product.id, name: product.name } : null;
  });
}

export async function revealCountAction(id: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "warehouse");
    await revealCount(id, user);
    revalidatePath(`/inventario/conteos/${id}`);
    return { id };
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
