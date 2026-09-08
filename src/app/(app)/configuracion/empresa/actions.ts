"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { companyFormSchema, saveCompany } from "@/modules/settings/application/company";

export async function saveCompanyAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const data = parseInput(companyFormSchema, input);
    const saved = await saveCompany(data, user.id);
    revalidatePath("/", "layout");
    return { name: saved.name, logoPath: saved.logoPath };
  });
}
