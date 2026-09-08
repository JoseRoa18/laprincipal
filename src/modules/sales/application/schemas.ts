import Decimal from "decimal.js";
import { z } from "zod";
import type { ProductForSale } from "@/modules/catalog/infrastructure/product-lookup";

/**
 * Zod schemas and plain types shared by the POS client and the server actions.
 * This file must stay free of server-only imports (db, env).
 */

function numeric(opts: { positive?: boolean; nonNegative?: boolean; message?: string } = {}) {
  return z.union([z.string(), z.number()]).transform((value, ctx) => {
    const raw = typeof value === "number" ? String(value) : value.trim();
    let d: Decimal;
    try {
      d = new Decimal(raw === "" ? "0" : raw);
    } catch {
      ctx.addIssue({ code: "custom", message: opts.message ?? "Número inválido." });
      return z.NEVER;
    }
    if (!d.isFinite()) {
      ctx.addIssue({ code: "custom", message: opts.message ?? "Número inválido." });
      return z.NEVER;
    }
    if (opts.positive && d.lte(0)) {
      ctx.addIssue({ code: "custom", message: opts.message ?? "Debe ser mayor que cero." });
      return z.NEVER;
    }
    if (opts.nonNegative && d.lt(0)) {
      ctx.addIssue({ code: "custom", message: opts.message ?? "No puede ser negativo." });
      return z.NEVER;
    }
    return d.toString();
  });
}

export const discountTypeSchema = z.enum(["pct", "amount"]);

export const cartLineSchema = z.object({
  productId: z.uuid("Producto inválido."),
  quantity: numeric({ positive: true, message: "La cantidad debe ser mayor que cero." }),
  discountType: discountTypeSchema.default("pct"),
  discountValue: numeric({ nonNegative: true, message: "El descuento no puede ser negativo." }).default("0"),
});
export type CartLineInput = z.infer<typeof cartLineSchema>;

export const globalDiscountSchema = z
  .object({ type: discountTypeSchema, value: numeric({ nonNegative: true }) })
  .nullable()
  .optional();

export const paymentInputSchema = z.object({
  paymentMethodId: z.uuid("Método de pago inválido."),
  amount: numeric({ positive: true, message: "El monto del pago debe ser mayor que cero." }),
  reference: z.string().trim().max(120, "La referencia es muy larga.").nullable().optional(),
});

export const completeSaleSchema = z.object({
  lines: z.array(cartLineSchema).min(1, "Agrega al menos un producto."),
  customerId: z.uuid().nullable().optional(),
  globalDiscount: globalDiscountSchema,
  payments: z.array(paymentInputSchema).default([]),
  changeCurrencyCode: z.string().trim().max(3).nullable().optional(),
  supervisorToken: z.string().nullable().optional(),
  heldSaleId: z.uuid().nullable().optional(),
  quoteId: z.uuid().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  /** Admin override when the policy allows negative stock. */
  allowNegativeStock: z.boolean().optional(),
});
export type CompleteSaleInput = z.infer<typeof completeSaleSchema>;

export const holdSaleSchema = z.object({
  label: z.string().trim().min(1, "Escribe una etiqueta para reconocer la venta.").max(80),
  lines: z.array(cartLineSchema).min(1, "Agrega al menos un producto."),
  customerId: z.uuid().nullable().optional(),
  globalDiscount: globalDiscountSchema,
  notes: z.string().trim().max(500).nullable().optional(),
  /** When re-holding a resumed sale, the previous held row is replaced. */
  heldSaleId: z.uuid().nullable().optional(),
});
export type HoldSaleInput = z.infer<typeof holdSaleSchema>;

export const createQuoteSchema = z.object({
  lines: z.array(cartLineSchema).min(1, "Agrega al menos un producto."),
  customerId: z.uuid().nullable().optional(),
  globalDiscount: globalDiscountSchema,
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.")
    .nullable()
    .optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  reserveStock: z.boolean().default(false),
});
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export const voidSaleSchema = z.object({
  saleId: z.uuid(),
  reason: z.string().trim().min(3, "Indica el motivo de la anulación.").max(500),
});
export type VoidSaleInput = z.infer<typeof voidSaleSchema>;

export const createReturnSchema = z.object({
  saleId: z.uuid(),
  items: z
    .array(z.object({ saleItemId: z.uuid(), quantity: numeric({ positive: true, message: "La cantidad debe ser mayor que cero." }) }))
    .min(1, "Elige al menos una línea para devolver."),
  reasonId: z.uuid().nullable().optional(),
  reasonText: z.string().trim().max(500).nullable().optional(),
  restock: z.boolean().default(true),
  refundMethodId: z.uuid().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type CreateReturnInput = z.infer<typeof createReturnSchema>;

export const quickCustomerSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre del cliente.").max(120),
  phone: z.string().trim().max(30).nullable().optional(),
  docType: z.enum(["V", "E", "J", "G", "P", "NONE"]).default("NONE"),
  docNumber: z.string().trim().max(30).nullable().optional(),
  customerType: z.enum(["public", "technician"]).default("public"),
});
export type QuickCustomerInput = z.infer<typeof quickCustomerSchema>;

export const pinSchema = z.string().regex(/^\d{4,6}$/, "El PIN debe tener entre 4 y 6 dígitos.");

/** Product data the POS client receives (never the cost). */
export type PosProduct = Omit<ProductForSale, "costAvgUsd" | "taxId">;

export function toPosProduct(p: ProductForSale): PosProduct {
  const { costAvgUsd: _cost, taxId: _tax, ...rest } = p;
  void _cost;
  void _tax;
  return rest;
}

export interface CartCustomer {
  id: string;
  name: string;
  phone: string | null;
  customerType: "public" | "technician";
  priceListId: string | null;
}

export interface CartLineData {
  productId: string;
  sku: string;
  name: string;
  partNumber: string | null;
  unitSymbol: string;
  unitDecimals: number;
  taxRate: string;
  quantity: string;
  unitPriceUsd: string;
  discountType: "pct" | "amount";
  discountValue: string;
  stockAvailable: string;
  thumbUrl: string | null;
}

/** Everything needed to load a held sale or a quote into the cart. */
export interface CartPayload {
  lines: CartLineData[];
  customer: CartCustomer | null;
  notes: string | null;
  heldSaleId?: string | null;
  holdLabel?: string | null;
  quoteId?: string | null;
  quoteNumber?: string | null;
}
