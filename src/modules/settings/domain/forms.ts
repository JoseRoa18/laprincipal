import { z } from "zod";
import { parseLocalizedNumber } from "@/lib/format";
import { D } from "@/lib/money";

/**
 * Zod schemas shared by the client forms and the server actions of
 * Configuración. Pure module: no database or storage imports, so client
 * components can import it safely.
 */

// --- Empresa -----------------------------------------------------------------

export const companyFormSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre de la empresa").max(120),
  taxId: z.string().trim().max(20, "Máximo 20 caracteres"),
  address: z.string().trim().max(300),
  phone: z.string().trim().max(40),
  email: z
    .string()
    .trim()
    .max(150)
    .refine((v) => v === "" || z.email().safeParse(v).success, "Correo inválido"),
  /** Resized image as a data URL (image/webp or image/png), or omitted to keep the current logo. */
  logoDataUrl: z.string().max(4_000_000).optional(),
  removeLogo: z.boolean().optional(),
});
export type CompanyFormInput = z.input<typeof companyFormSchema>;

// --- Tasas -------------------------------------------------------------------

const rateString = z
  .string()
  .trim()
  .refine((v) => v === "" || (parseLocalizedNumber(v) !== null && D(parseLocalizedNumber(v) ?? 0).gt(0)), "Escribe una tasa mayor que cero");

export const setRatesSchema = z
  .object({
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
    rates: z.record(z.string(), rateString),
  })
  .refine((d) => Object.values(d.rates).some((v) => v.trim() !== ""), { path: ["rates"], message: "Escribe al menos una tasa" });
export type SetRatesInput = z.input<typeof setRatesSchema>;

// --- Políticas e impresión ---------------------------------------------------

const pctNumber = (label: string) => z.number({ error: `${label}: escribe un número` }).min(0, `${label}: mínimo 0`).max(100, `${label}: máximo 100`);

export const policiesFormSchema = z.object({
  allowNegativeStock: z.boolean(),
  maxDiscountPctByRole: z.object({
    admin: pctNumber("Descuento administrador"),
    seller: pctNumber("Descuento vendedor"),
    warehouse: pctNumber("Descuento almacén"),
  }),
  voidWindowHours: z.number({ error: "Escribe las horas" }).int("Horas enteras").min(0).max(720, "Máximo 720 horas"),
  quoteValidityDays: z.number({ error: "Escribe los días" }).int("Días enteros").min(1, "Mínimo 1 día").max(365, "Máximo 365 días"),
  techPriceMarkdownPct: pctNumber("Descuento técnico"),
  defaultMarginPct: z.number({ error: "Escribe el margen" }).min(0, "Mínimo 0").max(99, "Máximo 99"),
  requireRatesToSell: z.boolean(),
  requireOpenCashSession: z.boolean(),
});
export type PoliciesFormInput = z.input<typeof policiesFormSchema>;

export const printingFormSchema = z.object({
  ticketWidthMm: z.union([z.literal(58), z.literal(80)]),
  footer: z.string().trim().max(300, "Máximo 300 caracteres"),
  showBsOnTicket: z.boolean(),
  showCopOnTicket: z.boolean(),
});
export type PrintingFormInput = z.input<typeof printingFormSchema>;
