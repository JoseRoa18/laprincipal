"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { syncBcvRate } from "@/modules/currency/application/bcv-sync";
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

/** "Actualizar desde el BCV": queries the BCV now and saves the Bs rate under its value date. */
export async function syncBcvRateAction() {
  return runAction(async () => {
    const user = await assertRole("admin");
    const result = await syncBcvRate({ userId: user.id });
    revalidatePath("/", "layout");
    return result;
  });
}
