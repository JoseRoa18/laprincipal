"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { createUnit, deleteUnit, unitInputSchema, updateUnit } from "@/modules/settings/application/units";

const PATH = "/configuracion/unidades";
const idSchema = z.uuid("Unidad inválida");

export async function createUnitAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const data = parseInput(unitInputSchema, input);
    const row = await createUnit(data, user.id);
    revalidatePath(PATH);
    return { id: row.id };
  });
}

export async function updateUnitAction(id: string, input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const unitId = parseInput(idSchema, id);
    const data = parseInput(unitInputSchema, input);
    const row = await updateUnit(unitId, data, user.id);
    revalidatePath(PATH);
    return { id: row.id };
  });
}

export async function deleteUnitAction(id: string) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const unitId = parseInput(idSchema, id);
    await deleteUnit(unitId, user.id);
    revalidatePath(PATH);
    return { id: unitId };
  });
}
