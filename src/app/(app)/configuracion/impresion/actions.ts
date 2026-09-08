"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { printingFormSchema, savePrinting } from "@/modules/settings/application/preferences";

export async function savePrintingAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const data = parseInput(printingFormSchema, input);
    const saved = await savePrinting(data, user.id);
    revalidatePath("/configuracion/impresion");
    return saved;
  });
}
