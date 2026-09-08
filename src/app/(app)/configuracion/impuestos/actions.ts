"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { createTax, setDefaultTax, setTaxActive, taxInputSchema, updateTax } from "@/modules/settings/application/taxes";

const PATH = "/configuracion/impuestos";
const idSchema = z.uuid("Impuesto inválido");

export async function createTaxAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const data = parseInput(taxInputSchema, input);
    const row = await createTax(data, user.id);
    revalidatePath(PATH);
    return { id: row.id };
  });
}

export async function updateTaxAction(id: string, input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const taxId = parseInput(idSchema, id);
    const data = parseInput(taxInputSchema, input);
    const row = await updateTax(taxId, data, user.id);
    revalidatePath(PATH);
    return { id: row.id };
  });
}

export async function setTaxActiveAction(id: string, isActive: boolean) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const taxId = parseInput(idSchema, id);
    const row = await setTaxActive(taxId, parseInput(z.boolean(), isActive), user.id);
    revalidatePath(PATH);
    return { id: row.id, isActive: row.isActive };
  });
}

export async function setDefaultTaxAction(id: string) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const taxId = parseInput(idSchema, id);
    const row = await setDefaultTax(taxId, user.id);
    revalidatePath(PATH);
    return { id: row.id, isDefault: row.isDefault };
  });
}
