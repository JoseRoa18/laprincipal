import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { customers, priceLists } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { getProductsForSale, type ProductForSale } from "@/modules/catalog/infrastructure/product-lookup";
import { computeTotals, type GlobalDiscount, type LineInput, type SaleTotals } from "../domain/pricing";
import type { CartLineInput } from "./schemas";

export type CustomerRow = typeof customers.$inferSelect;

/**
 * Price list for a sale: the list assigned to the customer, else TECH for
 * technicians, else the default (PUBLIC) list.
 */
export async function resolveCustomerAndPriceList(
  dbx: DbOrTx,
  customerId: string | null | undefined,
): Promise<{ customer: CustomerRow | null; priceListId: string }> {
  const lists = await dbx
    .select({ id: priceLists.id, code: priceLists.code, isDefault: priceLists.isDefault })
    .from(priceLists)
    .where(eq(priceLists.isActive, true));
  const def = lists.find((l) => l.isDefault) ?? lists[0];
  if (!def) throw new AppError("INTERNAL", "No hay listas de precios configuradas. Ejecuta la semilla de datos.");
  if (!customerId) return { customer: null, priceListId: def.id };

  const [customer] = await dbx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer || customer.deletedAt) throw notFound("El cliente");
  const tech = lists.find((l) => l.code === "TECH");
  const priceListId =
    customer.priceListId && lists.some((l) => l.id === customer.priceListId)
      ? customer.priceListId
      : customer.customerType === "technician" && tech
        ? tech.id
        : def.id;
  return { customer, priceListId };
}

export interface PricedLine extends LineInput {
  product: ProductForSale;
}

export interface PricedCart {
  products: Map<string, ProductForSale>;
  lines: PricedLine[];
  totals: SaleTotals;
}

/**
 * Re-price cart lines with server data: list prices (or trusted overrides such
 * as the prices of an accepted quote), tax rates and discounts, then compute
 * the totals. Prices sent by the client are never used.
 */
export async function priceLines(
  dbx: DbOrTx,
  lines: CartLineInput[],
  opts: {
    priceListId: string | null;
    warehouseId: string;
    globalDiscount?: GlobalDiscount | null;
    /** productId → unit price in USD (e.g. from a quote). */
    priceOverrides?: Map<string, string>;
  },
): Promise<PricedCart> {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const rows = await getProductsForSale(ids, { priceListId: opts.priceListId, warehouseId: opts.warehouseId, dbx });
  const products = new Map(rows.map((p) => [p.id, p]));

  const priced: PricedLine[] = lines.map((l, i) => {
    const product = products.get(l.productId);
    if (!product) throw notFound("El producto");
    if (!product.isActive) throw new AppError("VALIDATION", `"${product.name}" está inactivo y no se puede vender.`);
    const price = opts.priceOverrides?.get(l.productId) ?? product.priceUsd;
    if (price === null || price === undefined) {
      throw new AppError("VALIDATION", `"${product.name}" no tiene precio en la lista. Asígnale un precio antes de venderlo.`, {
        productId: product.id,
      });
    }
    return {
      key: String(i),
      quantity: l.quantity,
      unitPriceUsd: price,
      taxRate: product.taxRate,
      discountType: l.discountType,
      discountValue: l.discountValue,
      product,
    };
  });

  const totals = computeTotals(priced, opts.globalDiscount ?? null);
  return { products, lines: priced, totals };
}

/**
 * Per-line discount to persist when a cart is saved (held sale, quote): when a
 * global discount exists, the prorated share is baked into an amount discount
 * so the saved lines reproduce the same totals without a global discount.
 */
export function persistedDiscount(
  line: { discountType: "pct" | "amount"; discountValue: { toString(): string } },
  computedDiscountUsd: { toString(): string },
  hasGlobalDiscount: boolean,
): { discountType: "pct" | "amount"; discountValue: string } {
  if (hasGlobalDiscount) return { discountType: "amount", discountValue: computedDiscountUsd.toString() };
  return { discountType: line.discountType, discountValue: line.discountValue.toString() };
}
