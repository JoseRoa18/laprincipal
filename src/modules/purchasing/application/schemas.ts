import { z } from "zod";
import { moneyString, numberString, qtyString } from "@/modules/inventory/application/schemas";

const optionalText = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`).optional();

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(200),
  taxId: optionalText(30),
  contactName: optionalText(120),
  phone: optionalText(40),
  email: z.union([z.literal(""), z.email("Correo inválido.")]).optional(),
  address: optionalText(300),
  currencyCode: z.string().trim().length(3, "Elige una moneda."),
  leadTimeDays: z.coerce.number().int("Debe ser un número entero.").min(0, "No puede ser negativo.").max(365, "Máximo 365 días."),
  paymentTerms: optionalText(200),
  notes: optionalText(1000),
  isActive: z.boolean().default(true),
});
export type SupplierInput = z.output<typeof supplierSchema>;
export type SupplierFormValues = z.input<typeof supplierSchema>;

export const preferredSupplierSchema = z.object({
  productId: z.uuid(),
  supplierId: z.uuid(),
  preferred: z.boolean(),
});

export const receiptLineSchema = z.object({
  productId: z.uuid("Producto inválido."),
  quantity: qtyString("Cantidad"),
  /** In the receipt currency. */
  unitCostAmount: moneyString("Costo unitario", { allowZero: true }),
});

export const receiptSchema = z.object({
  id: z.uuid().optional(),
  supplierId: z.uuid("Elige un proveedor."),
  supplierDocument: optionalText(80),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  currencyCode: z.string().trim().length(3, "Elige una moneda."),
  exchangeRate: numberString("Tasa", { decimals: 6 }),
  extraCostsUsd: moneyString("Gastos adicionales", { allowZero: true }),
  notes: optionalText(1000),
  lines: z.array(receiptLineSchema).min(1, "Agrega al menos un producto."),
});
export type ReceiptInput = z.output<typeof receiptSchema>;

export const voidReceiptSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(3, "Escribe el motivo de la anulación.").max(300),
});
