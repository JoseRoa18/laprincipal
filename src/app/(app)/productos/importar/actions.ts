"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { AppError } from "@/lib/errors";
import { applyImport, undoImport, validateImportFile } from "@/modules/catalog/application/import";

const idSchema = z.uuid("Identificador inválido");
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

function revalidate() {
  revalidatePath("/productos", "layout");
  revalidatePath("/inventario", "layout");
}

/** FormData field "file": the .xlsx built from the template. */
export async function validateImportAction(formData: FormData) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", "Elige el archivo Excel (.xlsx) que quieres importar.");
    if (!/\.xlsx$/i.test(file.name)) throw new AppError("VALIDATION", "El archivo debe ser un Excel .xlsx. Descarga la plantilla y guárdala en ese formato.");
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError("VALIDATION", "El archivo es demasiado grande (máximo 12 MB).");
    const buffer = Buffer.from(await file.arrayBuffer());
    return validateImportFile(buffer, file.name, user);
  });
}

export async function applyImportAction(jobId: string) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const result = await applyImport(parseInput(idSchema, jobId), user);
    revalidate();
    return result;
  });
}

export async function undoImportAction(jobId: string) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const result = await undoImport(parseInput(idSchema, jobId), user);
    revalidate();
    return result;
  });
}
