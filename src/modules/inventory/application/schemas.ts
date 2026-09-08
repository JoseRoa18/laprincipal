import Decimal from "decimal.js";
import { z } from "zod";
import { parseLocalizedNumber } from "@/lib/format";

/**
 * Zod schemas shared by server actions and client forms. Amounts and quantities
 * travel as strings ("12,5" or "12.5") and are normalized to a plain numeric
 * string so the server can wrap them with D() without float precision loss.
 */

export interface NumberStringOptions {
  /** Allow 0 (default false). */
  allowZero?: boolean;
  /** Allow negative values (default false). */
  allowNegative?: boolean;
  /** Maximum decimals accepted (default 4). */
  decimals?: number;
}

export function numberString(label: string, opts: NumberStringOptions = {}) {
  const decimals = opts.decimals ?? 4;
  return z
    .string()
    .trim()
    .transform((value, ctx) => {
      const normalized = parseLocalizedNumber(value);
      if (normalized === null) {
        ctx.addIssue({ code: "custom", message: `${label}: escribe un número válido.` });
        return z.NEVER;
      }
      const n = new Decimal(normalized);
      if (n.isNegative() && !opts.allowNegative) {
        ctx.addIssue({ code: "custom", message: `${label} no puede ser negativo.` });
        return z.NEVER;
      }
      if (n.isZero() && !opts.allowZero) {
        ctx.addIssue({ code: "custom", message: `${label} debe ser mayor que cero.` });
        return z.NEVER;
      }
      if (n.decimalPlaces() > decimals) {
        ctx.addIssue({ code: "custom", message: `${label}: máximo ${decimals} decimales.` });
        return z.NEVER;
      }
      return n.toFixed();
    });
}

export const qtyString = (label: string, opts: NumberStringOptions = {}) => numberString(label, { decimals: 3, ...opts });
export const moneyString = (label: string, opts: NumberStringOptions = {}) => numberString(label, { decimals: 4, ...opts });

const optionalText = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`).optional();

export const stockSettingsSchema = z.object({
  productId: z.uuid("Producto inválido."),
  minStock: qtyString("Mínimo", { allowZero: true }),
  maxStock: qtyString("Máximo", { allowZero: true }),
  reorderPoint: qtyString("Punto de reorden", { allowZero: true }),
  reorderQty: qtyString("Cantidad a pedir", { allowZero: true }),
  mode: z.enum(["manual", "auto"]),
});
export type StockSettingsInput = z.output<typeof stockSettingsSchema>;

export const adjustmentLineSchema = z.object({
  productId: z.uuid("Producto inválido."),
  /** Absolute quantity; the sign comes from `direction`. */
  quantity: qtyString("Cantidad"),
  direction: z.enum(["in", "out"]),
  /** Only used for increases. Defaults to the product's average cost. */
  unitCostUsd: moneyString("Costo", { allowZero: true }).optional(),
  notes: optionalText(300),
});

export const adjustmentSchema = z.object({
  id: z.uuid().optional(),
  reasonId: z.uuid("Elige un motivo."),
  notes: optionalText(1000),
  lines: z.array(adjustmentLineSchema).min(1, "Agrega al menos un producto."),
});
export type AdjustmentInput = z.output<typeof adjustmentSchema>;

export const countCreateSchema = z.object({
  categoryId: z.union([z.uuid(), z.literal("")]).optional(),
  locationPrefix: optionalText(50),
  blind: z.boolean().default(true),
  notes: optionalText(1000),
});
export type CountCreateInput = z.output<typeof countCreateSchema>;

export const countItemSchema = z.object({
  countId: z.uuid(),
  itemId: z.uuid(),
  /** Null clears the count for the item. */
  countedQty: qtyString("Cantidad contada", { allowZero: true }).nullable(),
});
export type CountItemInput = z.output<typeof countItemSchema>;

export const countAddItemSchema = z.object({
  countId: z.uuid(),
  productId: z.uuid(),
});
export type CountAddItemInput = z.output<typeof countAddItemSchema>;
