import { z } from "zod";
import type { documentTypeEnum, paymentKindEnum, reasonKindEnum } from "@/db/schema/enums";
import { parseLocalizedNumber } from "@/lib/format";
import { D, toDb } from "@/lib/money";

/**
 * Zod schemas, labels and small pure helpers shared by the configuration
 * screens (client forms) and their server actions.
 * This file must stay free of server-only imports (db, env, next/headers).
 */

export type ReasonKind = (typeof reasonKindEnum.enumValues)[number];
export type DocumentType = (typeof documentTypeEnum.enumValues)[number];
export type PaymentKind = (typeof paymentKindEnum.enumValues)[number];

const numberInput = z.union([z.string(), z.number()]);

/**
 * Percent typed by the user ("16", "16,5" or 16.5), validated between 0 and
 * 100 with at most 2 decimals, normalized to a plain numeric string ("16.5").
 */
export function percentString(label: string) {
  return numberInput.transform((value, ctx) => {
    const raw = typeof value === "number" ? (Number.isFinite(value) ? String(value) : null) : parseLocalizedNumber(value);
    if (raw === null) {
      ctx.addIssue({ code: "custom", message: `${label}: escribe un porcentaje válido.` });
      return z.NEVER;
    }
    const n = D(raw);
    if (n.lt(0) || n.gt(100)) {
      ctx.addIssue({ code: "custom", message: `${label} debe estar entre 0 y 100.` });
      return z.NEVER;
    }
    if (n.decimalPlaces() > 2) {
      ctx.addIssue({ code: "custom", message: `${label}: máximo 2 decimales.` });
      return z.NEVER;
    }
    return n.toFixed();
  });
}

/** Integer typed by the user (string from an input or a number), within [min, max]. */
export function integerInput(label: string, min: number, max: number) {
  return numberInput.transform((value, ctx) => {
    const text = typeof value === "number" ? String(value) : value.trim();
    if (!/^-?\d+$/.test(text)) {
      ctx.addIssue({ code: "custom", message: `${label}: escribe un número entero.` });
      return z.NEVER;
    }
    const n = Number(text);
    if (!Number.isSafeInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: `${label} debe estar entre ${min} y ${max}.` });
      return z.NEVER;
    }
    return n;
  });
}

/** "0.1600" (db fraction) -> "16" (percent for the UI). */
export function fractionToPercent(fraction: string): string {
  return D(fraction).mul(100).toFixed();
}

/** "16.5" (percent from the UI) -> "0.1650" (db fraction, scale 4). */
export function percentToFraction(percent: string): string {
  return toDb(D(percent).div(100), 4);
}

// --- Taxes -----------------------------------------------------------------

export const taxInputSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre").max(60, "Máximo 60 caracteres"),
  ratePct: percentString("La tasa"),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type TaxInput = z.input<typeof taxInputSchema>;
export type TaxData = z.output<typeof taxInputSchema>;

// --- Units -----------------------------------------------------------------

export const UNIT_DECIMALS = [
  { value: 0, label: "0 (piezas enteras)" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
] as const;

export const unitInputSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre").max(50, "Máximo 50 caracteres"),
  symbol: z.string().trim().min(1, "Escribe el símbolo").max(10, "Máximo 10 caracteres"),
  decimals: integerInput("Los decimales", 0, 3),
});
export type UnitInput = z.input<typeof unitInputSchema>;
export type UnitData = z.output<typeof unitInputSchema>;

// --- Adjustment reasons ----------------------------------------------------

export const REASON_KINDS = [
  { value: "increase", label: "Entrada" },
  { value: "decrease", label: "Salida" },
  { value: "both", label: "Entrada y salida" },
] as const satisfies readonly { value: ReasonKind; label: string }[];

export const REASON_KIND_LABEL: Record<ReasonKind, string> = {
  increase: "Entrada",
  decrease: "Salida",
  both: "Entrada y salida",
};

export const reasonInputSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre").max(60, "Máximo 60 caracteres"),
  kind: z.enum(["increase", "decrease", "both"], "Elige el tipo"),
  sortOrder: integerInput("El orden", 0, 9999),
  isActive: z.boolean().default(true),
});
export type ReasonInput = z.input<typeof reasonInputSchema>;
export type ReasonData = z.output<typeof reasonInputSchema>;

// --- Document series -------------------------------------------------------

/** Display order of the series screen. */
export const DOCUMENT_TYPES: readonly DocumentType[] = ["sale", "quote", "return", "purchase_receipt", "adjustment", "count", "cash_session"];

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  sale: "Ventas",
  quote: "Cotizaciones",
  return: "Devoluciones",
  purchase_receipt: "Entradas por compra",
  adjustment: "Ajustes",
  count: "Conteos",
  cash_session: "Sesiones de caja",
};

export const SERIES_PADDINGS = [3, 4, 5, 6, 7, 8] as const;

export const documentSeriesInputSchema = z.object({
  prefix: z.string().trim().min(1, "Escribe el prefijo").max(10, "Máximo 10 caracteres"),
  padding: integerInput("El relleno", 3, 8),
  nextNumber: integerInput("El próximo número", 1, 2_000_000_000),
  /** Must be true when nextNumber moves forward: the skipped numbers are never used. */
  confirm: z.boolean().default(false),
});
export type DocumentSeriesInput = z.input<typeof documentSeriesInputSchema>;
export type DocumentSeriesData = z.output<typeof documentSeriesInputSchema>;

/** Same formatting as nextDocumentNumber(): "V-000123". */
export function formatDocumentNumber(prefix: string, padding: number, n: number): string {
  const digits = Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : "";
  const width = Number.isFinite(padding) ? Math.min(Math.max(Math.trunc(padding), 0), 12) : 0;
  return `${prefix}${digits.padStart(width, "0")}`;
}

// --- Payment methods -------------------------------------------------------

export const PAYMENT_KINDS = [
  { value: "cash", label: "Efectivo" },
  { value: "mobile_payment", label: "Pago móvil" },
  { value: "card_terminal", label: "Punto de venta" },
  { value: "transfer", label: "Transferencia" },
  { value: "crypto", label: "Cripto" },
] as const satisfies readonly { value: PaymentKind; label: string }[];

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  cash: "Efectivo",
  mobile_payment: "Pago móvil",
  card_terminal: "Punto de venta",
  transfer: "Transferencia",
  crypto: "Cripto",
};

export const PAYMENT_METHOD_FLAGS = ["isActive", "requiresReference", "countsInDrawer", "allowsChange"] as const;
export type PaymentMethodFlag = (typeof PAYMENT_METHOD_FLAGS)[number];

export const PAYMENT_METHOD_FLAG_LABEL: Record<PaymentMethodFlag, string> = {
  isActive: "Activo",
  requiresReference: "Requiere referencia",
  countsInDrawer: "Cuenta en caja",
  allowsChange: "Permite dar cambio",
};

const paymentMethodFields = {
  name: z.string().trim().min(1, "Escribe el nombre").max(60, "Máximo 60 caracteres"),
  requiresReference: z.boolean().default(false),
  countsInDrawer: z.boolean().default(false),
  allowsChange: z.boolean().default(false),
  surchargePct: percentString("El recargo").default("0"),
  sortOrder: integerInput("El orden", 0, 9999).default(0),
};

export const CHANGE_NEEDS_DRAWER = "Solo los métodos que cuentan en caja pueden dar cambio.";

function checkChangeRule(data: { countsInDrawer: boolean; allowsChange: boolean }, ctx: z.RefinementCtx) {
  if (data.allowsChange && !data.countsInDrawer) {
    ctx.addIssue({ code: "custom", path: ["allowsChange"], message: CHANGE_NEEDS_DRAWER });
  }
}

export const paymentMethodCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(2, "Mínimo 2 caracteres")
      .max(30, "Máximo 30 caracteres")
      .regex(/^[A-Z0-9_]+$/, "Solo letras, números y guion bajo (sin espacios)"),
    kind: z.enum(["cash", "mobile_payment", "card_terminal", "transfer", "crypto"], "Elige el tipo"),
    currencyCode: z.string().trim().toUpperCase().min(1, "Elige la moneda").max(3, "Moneda inválida"),
    ...paymentMethodFields,
  })
  .superRefine(checkChangeRule);
export type PaymentMethodCreateInput = z.input<typeof paymentMethodCreateSchema>;
export type PaymentMethodCreateData = z.output<typeof paymentMethodCreateSchema>;

export const paymentMethodUpdateSchema = z
  .object({
    ...paymentMethodFields,
    isActive: z.boolean().default(true),
  })
  .superRefine(checkChangeRule);
export type PaymentMethodUpdateInput = z.input<typeof paymentMethodUpdateSchema>;
export type PaymentMethodUpdateData = z.output<typeof paymentMethodUpdateSchema>;

// --- Read models (rows the pages pass to the client tables) ----------------

export interface TaxListRow {
  id: string;
  name: string;
  /** Fraction as stored ("0.1600"). */
  rate: string;
  /** Percent for the UI ("16"). */
  ratePct: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface UnitListRow {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  /** Products (including archived ones) that reference the unit. */
  productCount: number;
}

export interface AdjustmentReasonListRow {
  id: string;
  name: string;
  kind: ReasonKind;
  isActive: boolean;
  sortOrder: number;
}

export interface DocumentSeriesListRow {
  id: string;
  documentType: DocumentType;
  label: string;
  prefix: string;
  nextNumber: number;
  padding: number;
  /** What the next document will be numbered, e.g. "V-000123". */
  example: string;
}

export interface PaymentMethodListRow {
  id: string;
  code: string;
  name: string;
  kind: PaymentKind;
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;
  requiresReference: boolean;
  countsInDrawer: boolean;
  allowsChange: boolean;
  /** Fraction as stored ("0.0300"). */
  surchargePct: string;
  /** Percent for the UI ("3"). */
  surchargePctDisplay: string;
  isActive: boolean;
  sortOrder: number;
}
