import { z } from "zod";
import { docNumberError, isCompanyDoc, normalizeDocNumber } from "./document";
import { formatPhone, phoneError, splitPhone } from "./phone";

export { DOC_TYPES, formatDoc, isCompanyDoc, normalizeDocNumber } from "./document";

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

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`).default("");

/** Words that stay lower case inside a name ("María de los Ángeles"). */
const PARTICLES = new Set(["de", "del", "la", "las", "los", "y"]);

/** "juan  pérez de la cruz" → "Juan Pérez de la Cruz": receipts look tidy however it was typed. */
export function tidyPersonName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => {
      const lower = word.toLocaleLowerCase("es");
      if (i > 0 && PARTICLES.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("es") + lower.slice(1);
    })
    .join(" ");
}

/**
 * Customer as typed in the form (POS and Clientes). Every customer is
 * identified: cédula/RIF and phone are required. V, E and P are people
 * (first and last name); J and G are companies (razón social). The address
 * is optional: estado → municipio → parroquia from the official list, plus
 * free text.
 */
export const customerInputSchema = z
  .object({
    docType: z.enum(["V", "E", "J", "G", "P"], { error: "Elige el tipo de documento" }).default("V"),
    docNumber: text(20),
    firstName: text(80),
    lastName: text(80),
    companyName: text(150),
    phonePrefix: text(4),
    phoneNumber: text(20),
    email: z
      .string()
      .trim()
      .max(150)
      .optional()
      .nullable()
      .transform((v) => (v ? v.toLowerCase() : null))
      .refine((v) => v === null || z.email().safeParse(v).success, "Correo inválido"),
    state: optionalText(60),
    municipality: optionalText(80),
    parish: optionalText(80),
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
  .superRefine((d, ctx) => {
    const docError = docNumberError(d.docType, d.docNumber);
    if (docError) ctx.addIssue({ code: "custom", path: ["docNumber"], message: docError });
    if (isCompanyDoc(d.docType)) {
      if (d.companyName.length < 2) ctx.addIssue({ code: "custom", path: ["companyName"], message: "Escribe la razón social" });
    } else {
      if (d.firstName.length < 2) ctx.addIssue({ code: "custom", path: ["firstName"], message: "Escribe el nombre" });
      if (d.lastName.length < 2) ctx.addIssue({ code: "custom", path: ["lastName"], message: "Escribe el apellido" });
    }
    const phone = phoneError(d.phonePrefix, d.phoneNumber);
    if (phone) ctx.addIssue({ code: "custom", path: [d.phonePrefix && phone.startsWith("El número") ? "phoneNumber" : "phonePrefix"], message: phone });
    if (d.municipality && !d.state) ctx.addIssue({ code: "custom", path: ["state"], message: "Elige el estado" });
    if (d.parish && !d.municipality) ctx.addIssue({ code: "custom", path: ["municipality"], message: "Elige el municipio" });
  })
  .transform((d) => {
    const company = isCompanyDoc(d.docType);
    const firstName = company ? null : tidyPersonName(d.firstName);
    const lastName = company ? null : tidyPersonName(d.lastName);
    return {
      kind: (company ? "company" : "person") as "company" | "person",
      docType: d.docType,
      docNumber: normalizeDocNumber(d.docNumber, d.docType),
      name: company ? d.companyName.replace(/\s+/g, " ") : `${firstName} ${lastName}`,
      firstName,
      lastName,
      phone: formatPhone(d.phonePrefix, d.phoneNumber),
      email: d.email,
      state: d.state,
      municipality: d.state ? d.municipality : null,
      parish: d.state && d.municipality ? d.parish : null,
      address: d.address,
      customerType: d.customerType,
      priceListId: d.priceListId,
      notes: d.notes,
      isActive: d.isActive,
    };
  });

export type CustomerInput = z.input<typeof customerInputSchema>;
export type CustomerData = z.output<typeof customerInputSchema>;

/** Form values for editing a saved customer. Old records without a document start as V; old single names are split. */
export function toCustomerInput(c: {
  docType: string;
  docNumber: string | null;
  name: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  state: string | null;
  municipality: string | null;
  parish: string | null;
  address: string | null;
  customerType: "public" | "technician";
  priceListId: string | null;
  notes: string | null;
  isActive: boolean;
}): CustomerInput {
  const docType = (["V", "E", "J", "G", "P"].includes(c.docType) ? c.docType : "V") as "V" | "E" | "J" | "G" | "P";
  const company = isCompanyDoc(docType);
  const [first, ...rest] = c.name.trim().split(/\s+/);
  const phone = splitPhone(c.phone);
  return {
    docType,
    docNumber: c.docType === "NONE" ? "" : (c.docNumber ?? ""),
    firstName: company ? "" : (c.firstName ?? first ?? ""),
    lastName: company ? "" : (c.lastName ?? rest.join(" ")),
    companyName: company ? c.name : "",
    phonePrefix: phone.prefix,
    phoneNumber: phone.number,
    email: c.email ?? "",
    state: c.state ?? "",
    municipality: c.municipality ?? "",
    parish: c.parish ?? "",
    address: c.address ?? "",
    customerType: c.customerType,
    priceListId: c.priceListId ?? "",
    notes: c.notes ?? "",
    isActive: c.isActive,
  };
}

/** Same normalization the database uses (lower-case, no accents). */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "Sector Los Pinos, calle 3 · Parroquia, Municipio, Estado"; empty when nothing was given. */
export function formatAddress(c: { address: string | null; parish: string | null; municipality: string | null; state: string | null }): string {
  const place = [c.parish, c.municipality, c.state].filter(Boolean).join(", ");
  return [c.address, place].filter(Boolean).join(" · ");
}
