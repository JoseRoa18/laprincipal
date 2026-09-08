import { db, type Db } from "@/db/client";
import { writeAudit } from "@/modules/core/application/audit";
import { getSetting, saveSetting, type Policies, type PrintingSettings } from "../infrastructure/settings";

export { policiesFormSchema, printingFormSchema, type PoliciesFormInput, type PrintingFormInput } from "../domain/forms";

export async function savePolicies(input: Policies, userId: string, dbx: Db = db): Promise<Policies> {
  return dbx.transaction(async (tx) => {
    const before = await getSetting("policies", tx);
    const saved = await saveSetting("policies", input, userId, tx);
    await writeAudit(tx, { userId, action: "policies.update", entityType: "settings", entityId: "policies", before, after: saved });
    return saved;
  });
}

export async function savePrinting(input: PrintingSettings, userId: string, dbx: Db = db): Promise<PrintingSettings> {
  return dbx.transaction(async (tx) => {
    const before = await getSetting("printing", tx);
    const saved = await saveSetting("printing", input, userId, tx);
    await writeAudit(tx, { userId, action: "settings.update", entityType: "settings", entityId: "printing", before, after: saved });
    return saved;
  });
}
