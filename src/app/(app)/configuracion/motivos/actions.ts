"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { createReason, reasonInputSchema, setReasonActive, updateReason } from "@/modules/settings/application/reasons";

const PATH = "/configuracion/motivos";
const idSchema = z.uuid("Motivo inválido");

export async function createReasonAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const data = parseInput(reasonInputSchema, input);
    const row = await createReason(data, user.id);
    revalidatePath(PATH);
    return { id: row.id };
  });
}

export async function updateReasonAction(id: string, input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const reasonId = parseInput(idSchema, id);
    const data = parseInput(reasonInputSchema, input);
    const row = await updateReason(reasonId, data, user.id);
    revalidatePath(PATH);
    return { id: row.id };
  });
}

export async function setReasonActiveAction(id: string, isActive: boolean) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const reasonId = parseInput(idSchema, id);
    const row = await setReasonActive(reasonId, parseInput(z.boolean(), isActive), user.id);
    revalidatePath(PATH);
    return { id: row.id, isActive: row.isActive };
  });
}
