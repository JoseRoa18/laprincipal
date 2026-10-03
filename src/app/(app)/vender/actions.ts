"use server";

import Decimal from "decimal.js";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { parseInput, runAction } from "@/lib/action";
import { assertRole, can } from "@/lib/auth-guards";
import { AppError } from "@/lib/errors";
import { D } from "@/lib/money";
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
    if (data.quoteId && !can(user.role, "quote")) throw new AppError("FORBIDDEN", "Solo el administrador convierte cotizaciones en venta.");
    const supervisor = data.supervisorToken ? verifySupervisorToken(data.supervisorToken) : null;
    const result = await completeSale(db, data, { userId: user.id, sellerId: seller.id, role: seller.role, supervisor });
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
    if (!can(user.role, "quote")) throw new AppError("FORBIDDEN", "Solo el administrador hace cotizaciones.");
    const data = parseInput(createQuoteSchema, input);
    const result = await createQuote(db, data, { userId: user.id, sellerId: seller.id, role: seller.role });
    revalidatePath("/cotizaciones");
    return result;
  });
}

const authorizeSchema = z.object({ pin: pinSchema, maxPct: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/) });

/** Admin PIN → short-lived approval for this user of discounts up to `maxPct` (the cart's current discount). */
export async function authorizeDiscountAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "seller");
    const { pin, maxPct } = parseInput(authorizeSchema, input);
    const admin = await authorizeSupervisor(pin, user.id);
    if (!admin) throw new AppError("FORBIDDEN", "PIN incorrecto o sin permisos de administrador.");
    const approved = Decimal.min(D(maxPct), 100).toFixed(2);
    const { token, expiresAt } = issueSupervisorToken({ adminId: admin.id, requesterId: user.id, maxPct: approved });
    await writeAudit(db, { userId: user.id, action: "discount.authorize", entityType: "user", entityId: admin.id, after: { adminName: admin.name, maxPct: approved } });
    return { token, expiresAt, adminName: admin.name, maxPct: approved };
  });
}

const switchSchema = z.object({ userId: z.uuid(), pin: pinSchema });

/** Change the acting seller on this device with the target user's PIN. */
export async function switchSellerAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "seller");
    const { userId, pin } = parseInput(switchSchema, input);
    const ok = await verifyUserPin(userId, pin, user.id);
    if (!ok) throw new AppError("FORBIDDEN", "PIN incorrecto.");
    if (userId === user.id) {
      await clearActingSeller();
      return { id: user.id, name: user.name };
    }
    const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!target || (target.role !== "admin" && target.role !== "seller")) throw new AppError("FORBIDDEN", "Ese usuario no puede vender.");
    await setActingSeller(userId, user.id, target.role);
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
