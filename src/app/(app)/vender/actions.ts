"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { AppError } from "@/lib/errors";
import { authorizeSupervisor, verifyUserPin } from "@/modules/auth/application/pin";
import { writeAudit } from "@/modules/core/application/audit";
import { clearActingSeller, getActingSeller, setActingSeller } from "@/modules/sales/application/acting-seller";
import { completeSale } from "@/modules/sales/application/complete-sale";
import { discardHeldSale, holdSale } from "@/modules/sales/application/hold-sale";
import { createQuote } from "@/modules/sales/application/quotes";
import { completeSaleSchema, createQuoteSchema, holdSaleSchema, pinSchema, quickCustomerSchema } from "@/modules/sales/application/schemas";
import { issueSupervisorToken, verifySupervisorToken } from "@/modules/sales/application/supervisor-token";
import { createQuickCustomer } from "@/modules/sales/infrastructure/customers-lookup";

async function sellerContext() {
  const user = await assertRole("admin", "seller");
  const seller = (await getActingSeller(user)) ?? { id: user.id, name: user.name, role: user.role, isActing: false };
  return { user, seller };
}

export async function completeSaleAction(input: unknown) {
  return runAction(async () => {
    const { user, seller } = await sellerContext();
    const data = parseInput(completeSaleSchema, input);
    const supervisorId = data.supervisorToken ? verifySupervisorToken(data.supervisorToken) : null;
    const result = await completeSale(db, data, { userId: user.id, sellerId: seller.id, role: seller.role, supervisorId });
    revalidatePath("/ventas");
    revalidatePath("/inicio");
    revalidatePath("/vender");
    return result;
  });
}

export async function holdSaleAction(input: unknown) {
  return runAction(async () => {
    const { user, seller } = await sellerContext();
    const data = parseInput(holdSaleSchema, input);
    return holdSale(db, data, { userId: user.id, sellerId: seller.id, role: seller.role });
  });
}

export async function discardHeldSaleAction(saleId: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "seller");
    const id = parseInput(z.uuid(), saleId);
    await discardHeldSale(db, id, { userId: user.id });
  });
}

export async function saveQuoteAction(input: unknown) {
  return runAction(async () => {
    const { user, seller } = await sellerContext();
    const data = parseInput(createQuoteSchema, input);
    const result = await createQuote(db, data, { userId: user.id, sellerId: seller.id, role: seller.role });
    revalidatePath("/cotizaciones");
    return result;
  });
}

/** Admin PIN → short-lived token that authorizes discounts above the role limit. */
export async function authorizeDiscountAction(pin: string) {
  return runAction(async () => {
    const user = await assertRole("admin", "seller");
    const value = parseInput(pinSchema, pin);
    const admin = await authorizeSupervisor(value);
    if (!admin) throw new AppError("FORBIDDEN", "PIN incorrecto o sin permisos de administrador.");
    const { token, expiresAt } = issueSupervisorToken(admin.id);
    await writeAudit(db, { userId: user.id, action: "discount.authorize", entityType: "user", entityId: admin.id, after: { adminName: admin.name } });
    return { token, expiresAt, adminName: admin.name };
  });
}

const switchSchema = z.object({ userId: z.uuid(), pin: pinSchema });

/** Change the acting seller on this device with the target user's PIN. */
export async function switchSellerAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "seller");
    const { userId, pin } = parseInput(switchSchema, input);
    const ok = await verifyUserPin(userId, pin);
    if (!ok) throw new AppError("FORBIDDEN", "PIN incorrecto.");
    if (userId === user.id) {
      await clearActingSeller();
      return { id: user.id, name: user.name };
    }
    await setActingSeller(userId);
    const seller = await getActingSeller(user);
    if (!seller || !seller.isActing) throw new AppError("FORBIDDEN", "Ese usuario no puede vender.");
    await writeAudit(db, { userId: user.id, action: "seller.switch", entityType: "user", entityId: userId, after: { sellerName: seller.name } });
    return { id: seller.id, name: seller.name };
  });
}

export async function clearActingSellerAction() {
  return runAction(async () => {
    await assertRole("admin", "seller");
    await clearActingSeller();
  });
}

export async function quickCreateCustomerAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "seller");
    const data = parseInput(quickCustomerSchema, input);
    const customer = await createQuickCustomer(data, user.id);
    revalidatePath("/clientes");
    return customer;
  });
}
