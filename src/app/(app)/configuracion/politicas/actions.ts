"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { policiesFormSchema, savePolicies } from "@/modules/settings/application/preferences";

export async function savePoliciesAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const data = parseInput(policiesFormSchema, input);
    const saved = await savePolicies(data, user.id);
    revalidatePath("/configuracion/politicas");
    return saved;
  });
}
