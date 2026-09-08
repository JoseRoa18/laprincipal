import type { z } from "zod";
import { db, type Db } from "@/db/client";
import { AppError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { writeAudit } from "@/modules/core/application/audit";
import type { companyFormSchema } from "../domain/forms";
import { companySchema, getSetting, saveSetting, type CompanySettings } from "../infrastructure/settings";

export { companyFormSchema, type CompanyFormInput } from "../domain/forms";

const LOGO_PATHS = { "image/webp": "company/logo.webp", "image/png": "company/logo.png" } as const;

export async function saveCompany(input: z.output<typeof companyFormSchema>, userId: string, dbx: Db = db): Promise<CompanySettings> {
  const before = await getSetting("company", dbx);
  let logoPath = before.logoPath;

  if (input.removeLogo && logoPath) {
    await getStorage().delete("product-photos", logoPath).catch(() => undefined);
    logoPath = null;
  }

  if (input.logoDataUrl) {
    const match = /^data:(image\/webp|image\/png);base64,([A-Za-z0-9+/=]+)$/.exec(input.logoDataUrl);
    if (!match) throw new AppError("VALIDATION", "El logo debe ser una imagen WebP o PNG.", { fields: { logoDataUrl: "Formato no válido" } });
    const mime = match[1] as keyof typeof LOGO_PATHS;
    const data = Buffer.from(match[2], "base64");
    if (data.byteLength > 2_000_000) throw new AppError("VALIDATION", "El logo es demasiado grande (máximo 2 MB).");
    const path = LOGO_PATHS[mime];
    await getStorage().put({ bucket: "product-photos", path, data, contentType: mime });
    if (logoPath && logoPath !== path) await getStorage().delete("product-photos", logoPath).catch(() => undefined);
    logoPath = path;
  }

  const value = companySchema.parse({ name: input.name, taxId: input.taxId, address: input.address, phone: input.phone, email: input.email, logoPath });
  return dbx.transaction(async (tx) => {
    const saved = await saveSetting("company", value, userId, tx);
    await writeAudit(tx, { userId, action: "settings.update", entityType: "settings", entityId: "company", before, after: saved });
    return saved;
  });
}
