import { z } from "zod";

export const CUSTOMER_KINDS = [
  { value: "person", label: "Persona" },
  { value: "company", label: "Empresa" },
] as const;

export const DOC_TYPES = [
  { value: "NONE", label: "Sin documento" },
  { value: "V", label: "V - Cédula venezolana" },
  { value: "E", label: "E - Cédula extranjera" },
  { value: "J", label: "J - RIF jurídico" },
  { value: "G", label: "G - RIF gubernamental" },
  { value: "P", label: "P - Pasaporte" },
] as const;

export const CUSTOMER_TYPES = [
  { value: "public", label: "Público" },
  { value: "technician", label: "Técnico" },
] as const;

export const CUSTOMER_TYPE_LABEL: Record<"public" | "technician", string> = { public: "Público", technician: "Técnico" };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const customerInputSchema = z
  .object({
    kind: z.enum(["person", "company"]).default("person"),
    docType: z.enum(["NONE", "V", "E", "J", "G", "P"]).default("NONE"),
    docNumber: optionalText(30),
    name: z.string().trim().min(2, "Escribe el nombre").max(150, "Máximo 150 caracteres"),
    phone: optionalText(30),
    email: z
      .string()
      .trim()
      .max(150)
      .optional()
      .nullable()
      .transform((v) => (v ? v.toLowerCase() : null))
      .refine((v) => v === null || z.email().safeParse(v).success, "Correo inválido"),
    address: optionalText(300),
    customerType: z.enum(["public", "technician"]).default("public"),
    priceListId: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
    notes: optionalText(1000),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.docType !== "NONE") {
      if (!data.docNumber) {
        ctx.addIssue({ code: "custom", path: ["docNumber"], message: "Escribe el número de documento" });
      } else if (!/^[0-9A-Za-z-]+$/.test(data.docNumber)) {
        ctx.addIssue({ code: "custom", path: ["docNumber"], message: "Solo números, letras y guiones" });
      }
    }
  });

export type CustomerInput = z.input<typeof customerInputSchema>;
export type CustomerData = z.output<typeof customerInputSchema>;

/** Same normalization the database uses (lower-case, no accents). */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "V-12345678" for display. */
export function formatDoc(docType: string, docNumber: string | null): string {
  if (docType === "NONE" || !docNumber) return "";
  return `${docType}-${docNumber}`;
}
