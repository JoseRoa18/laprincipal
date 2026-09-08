"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action";
import { ALL_ROLES, assertRole } from "@/lib/auth-guards";
import { changeOwnPassword, changeOwnPasswordSchema, changeOwnPin, setPinSchema } from "@/modules/settings/application/users";

const ACCOUNT_PATH = "/configuracion/mi-cuenta";

/** Any signed-in user changes their own password after proving the current one. */
export async function changeOwnPasswordAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole(...ALL_ROLES);
    const data = parseInput(changeOwnPasswordSchema, input);
    await changeOwnPassword(user.id, data.currentPassword, data.password);
    return { id: user.id };
  });
}

/** Any signed-in user sets or replaces their own counter PIN. */
export async function changeOwnPinAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole(...ALL_ROLES);
    const data = parseInput(setPinSchema, input);
    await changeOwnPin(user.id, data.pin);
    revalidatePath(ACCOUNT_PATH);
    revalidatePath("/configuracion/usuarios");
    return { id: user.id };
  });
}
