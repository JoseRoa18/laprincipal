"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import {
  PAYMENT_METHOD_FLAGS,
  createPaymentMethod,
  paymentMethodCreateSchema,
  paymentMethodUpdateSchema,
  setPaymentMethodFlag,
  updatePaymentMethod,
} from "@/modules/settings/application/payment-methods";

const PATH = "/configuracion/metodos-de-pago";
const idSchema = z.uuid("Método de pago inválido");
const flagSchema = z.enum(PAYMENT_METHOD_FLAGS, "Opción inválida");

export async function createPaymentMethodAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const data = parseInput(paymentMethodCreateSchema, input);
    const row = await createPaymentMethod(data, user.id);
    revalidatePath(PATH);
    return { id: row.id };
  });
}

export async function updatePaymentMethodAction(id: string, input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const methodId = parseInput(idSchema, id);
    const data = parseInput(paymentMethodUpdateSchema, input);
    const row = await updatePaymentMethod(methodId, data, user.id);
    revalidatePath(PATH);
    return { id: row.id };
  });
}

/** Inline switches: flip one flag and return the resulting flags (drawer off also turns change off). */
export async function setPaymentMethodFlagAction(id: string, flag: string, value: boolean) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const methodId = parseInput(idSchema, id);
    const row = await setPaymentMethodFlag(methodId, parseInput(flagSchema, flag), parseInput(z.boolean(), value), user.id);
    revalidatePath(PATH);
    return {
      id: row.id,
      isActive: row.isActive,
      requiresReference: row.requiresReference,
      countsInDrawer: row.countsInDrawer,
      allowsChange: row.allowsChange,
    };
  });
}
