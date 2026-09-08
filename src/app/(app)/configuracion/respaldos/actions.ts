"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { createBackup } from "@/modules/settings/application/backups";

/** "Crear respaldo ahora": full JSON dump saved to the private documents bucket. */
export async function createBackupAction() {
  return runAction(async () => {
    const user = await assertRole("admin");
    const result = await createBackup({ kind: "manual", userId: user.id });
    revalidatePath("/configuracion/respaldos");
    return result;
  });
}
