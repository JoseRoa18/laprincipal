"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { createCustomer, searchCustomers, setCustomerActive, updateCustomer } from "@/modules/customers/application/customers";
import type { CustomerInput } from "@/modules/customers/domain/schema";

const idSchema = z.string().uuid("Cliente inválido");

export async function createCustomerAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "seller");
    const row = await createCustomer(input as CustomerInput, user.id);
    revalidatePath("/clientes");
    return { id: row.id };
  });
}

export async function updateCustomerAction(id: string, input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "seller");
    const customerId = parseInput(idSchema, id);
    const row = await updateCustomer(customerId, input as CustomerInput, user.id);
    revalidatePath("/clientes");
    revalidatePath(`/clientes/${customerId}`);
    return { id: row.id };
  });
}

export async function setCustomerActiveAction(id: string, isActive: boolean) {
  return runAction(async () => {
    const user = await assertRole("admin", "seller");
    const customerId = parseInput(idSchema, id);
    const row = await setCustomerActive(customerId, parseInput(z.boolean(), isActive), user.id);
    revalidatePath("/clientes");
    revalidatePath(`/clientes/${customerId}`);
    return { id: row.id, isActive: row.isActive };
  });
}

/** Quick lookup for autocomplete fields (POS, quotes). */
export async function searchCustomersAction(q: string) {
  return runAction(async () => {
    await assertRole("admin", "seller");
    return searchCustomers(parseInput(z.string().max(100), q), 10);
  });
}
