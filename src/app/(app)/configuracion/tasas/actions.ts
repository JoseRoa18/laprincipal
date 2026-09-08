"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { setRates, setRatesSchema } from "@/modules/settings/application/rates";

export async function setRatesAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const data = parseInput(setRatesSchema, input);
    const saved = await setRates(data, user.id);
    // The header badge and the home page show the rate everywhere.
    revalidatePath("/", "layout");
    return saved;
  });
}
