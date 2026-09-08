import { z } from "zod";
import { parseLocalizedNumber } from "@/lib/format";
import { D } from "@/lib/money";

/** Accepts "1.234,56" and "1234.56"; empty means 0. */
export const amountString = z
  .string()
  .trim()
  .refine((v) => v === "" || parseLocalizedNumber(v) !== null, "Escribe un monto válido")
  .refine((v) => v === "" || D(parseLocalizedNumber(v) ?? 0).gte(0), "El monto no puede ser negativo");

export const positiveAmountString = z
  .string()
  .trim()
  .refine((v) => parseLocalizedNumber(v) !== null, "Escribe un monto válido")
  .refine((v) => D(parseLocalizedNumber(v) ?? 0).gt(0), "El monto debe ser mayor que cero");

/** Normalized numeric string ("1234.56") from user input; "" becomes "0". */
export function toAmount(input: string): string {
  return parseLocalizedNumber(input) ?? "0";
}

export const openSessionSchema = z.object({
  openings: z.array(z.object({ currencyCode: z.string().min(3), amount: amountString })).min(1),
  notes: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
});
export type OpenSessionForm = z.input<typeof openSessionSchema>;

export const movementSchema = z.object({
  type: z.enum(["in", "out"]),
  currencyCode: z.string().min(3, "Elige la moneda"),
  amount: positiveAmountString,
  reason: z.string().trim().min(3, "Escribe el motivo").max(200, "Máximo 200 caracteres"),
  /** Admin that authorizes a withdrawal made by a seller. */
  adminId: z.string().optional(),
  pin: z.string().optional(),
});
export type MovementForm = z.input<typeof movementSchema>;

export const closeSessionSchema = z.object({
  counts: z
    .array(
      z.object({
        currencyCode: z.string().min(3),
        counted: z.string().refine((v) => parseLocalizedNumber(v) !== null, "Escribe el efectivo contado"),
        justification: z.string().trim().max(500).optional(),
      }),
    )
    .min(1),
  denominations: z.record(z.string(), z.record(z.string(), z.number().int().nonnegative())).optional(),
  reconciled: z.record(z.string(), z.boolean()).optional(),
  closingNotes: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
});
export type CloseSessionForm = z.input<typeof closeSessionSchema>;
