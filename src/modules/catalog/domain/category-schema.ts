import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre de la categoría").max(80, "Máximo 80 caracteres"),
  parentId: z.string().nullable(),
  sortOrder: z.number().int("Debe ser un entero").min(0, "Mínimo 0").max(9999, "Máximo 9999"),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const brandSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre de la marca").max(80, "Máximo 80 caracteres"),
});
export type BrandInput = z.infer<typeof brandSchema>;

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
