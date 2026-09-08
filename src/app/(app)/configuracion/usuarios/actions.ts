"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import {
  createUser,
  createUserSchema,
  resetPasswordSchema,
  resetUserPassword,
  resetUserPin,
  setPinSchema,
  updateUser,
  updateUserSchema,
} from "@/modules/settings/application/users";

const idSchema = z.string().uuid("Usuario inválido");
const USERS_PATH = "/configuracion/usuarios";

export async function createUserAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const data = parseInput(createUserSchema, input);
    const row = await createUser(data, user.id);
    revalidatePath(USERS_PATH);
    return { id: row.id };
  });
}

export async function updateUserAction(id: string, input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const userId = parseInput(idSchema, id);
    const data = parseInput(updateUserSchema, input);
    const row = await updateUser(userId, data, user.id);
    revalidatePath(USERS_PATH);
    return { id: row.id };
  });
}

export async function resetUserPasswordAction(id: string, input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const userId = parseInput(idSchema, id);
    const data = parseInput(resetPasswordSchema, input);
    await resetUserPassword(userId, data.password, user.id);
    revalidatePath(USERS_PATH);
    return { id: userId };
  });
}

export async function resetUserPinAction(id: string, input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const userId = parseInput(idSchema, id);
    const data = parseInput(setPinSchema, input);
    await resetUserPin(userId, data.pin, user.id);
    revalidatePath(USERS_PATH);
    return { id: userId };
  });
}
