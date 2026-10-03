"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { AppError } from "@/lib/errors";
import { createReturn } from "@/modules/sales/application/return-sale";
import { userCanOpenSale } from "@/modules/sales/application/sale-access";
import { createReturnSchema, voidSaleSchema } from "@/modules/sales/application/schemas";
import { shareSaleDocument } from "@/modules/sales/application/share-document";
import { voidSale } from "@/modules/sales/application/void-sale";
import { getSaleDetail } from "@/modules/sales/infrastructure/sales-queries";

export async function voidSaleAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const data = parseInput(voidSaleSchema, input);
    const result = await voidSale(db, data, { userId: user.id, role: user.role });
    revalidatePath("/ventas");
    revalidatePath(`/ventas/${data.saleId}`);
    revalidatePath("/inventario");
    revalidatePath("/caja");
    return result;
  });
}

export async function createReturnAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const data = parseInput(createReturnSchema, input);
    const result = await createReturn(db, data, { userId: user.id, role: user.role });
    revalidatePath("/ventas");
    revalidatePath(`/ventas/${data.saleId}`);
    revalidatePath("/inventario");
    revalidatePath("/caja");
    return result;
  });
}

/** Stores the delivery note PDF and returns a WhatsApp link with a 7-day signed URL. */
export async function shareSaleWhatsAppAction(saleId: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "seller");
    const id = parseInput(z.uuid(), saleId);
    const sale = await getSaleDetail(id);
    if (!sale || !userCanOpenSale(user, sale)) throw new AppError("NOT_FOUND", "La venta no existe.");
    return shareSaleDocument(id);
  });
}
