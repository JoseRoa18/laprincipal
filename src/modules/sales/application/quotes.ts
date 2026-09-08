import type Decimal from "decimal.js";
import { and, eq, inArray, lt } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { quoteItems, quotes, type UserRole } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { businessDate, formatQty } from "@/lib/format";
import { D, toMoneyDb, toQtyDb, toRateDb } from "@/lib/money";
import { writeAudit } from "@/modules/core/application/audit";
import { getDefaultLocation } from "@/modules/core/application/context";
import { nextDocumentNumber } from "@/modules/core/application/numbering";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { adjustReserved, lockStock } from "@/modules/inventory/application/stock";
import { getSetting } from "@/modules/settings/infrastructure/settings";
import { persistedDiscount, priceLines, resolveCustomerAndPriceList } from "./cart-pricing";
import type { CreateQuoteInput } from "./schemas";

export interface QuoteContext {
  userId: string;
  sellerId: string;
  role: UserRole;
  warehouseId?: string;
  branchId?: string;
}

export function defaultQuoteValidUntil(validityDays: number, from = new Date()): string {
  return businessDate(new Date(from.getTime() + Math.max(0, validityDays) * 86_400_000));
}

export async function createQuote(dbx: Db, input: CreateQuoteInput, ctx: QuoteContext): Promise<{ quoteId: string; number: string }> {
  const policies = await getSetting("policies", dbx);
  const location =
    ctx.warehouseId && ctx.branchId ? { warehouseId: ctx.warehouseId, branchId: ctx.branchId } : await getDefaultLocation(dbx);
  const snapshot = await getRatesSnapshot(businessDate(), dbx);
  const { customer, priceListId } = await resolveCustomerAndPriceList(dbx, input.customerId);
  const today = businessDate();
  const validUntil = input.validUntil ?? defaultQuoteValidUntil(policies.quoteValidityDays);
  if (validUntil < today) throw new AppError("VALIDATION", "La fecha de vigencia no puede ser anterior a hoy.");

  const cart = await priceLines(dbx, input.lines, {
    priceListId,
    warehouseId: location.warehouseId,
    globalDiscount: input.globalDiscount ?? null,
  });
  const hasGlobal = Boolean(input.globalDiscount && Number(input.globalDiscount.value) > 0);

  return dbx.transaction(async (tx) => {
    if (input.reserveStock) {
      const productIds = [...new Set(cart.lines.map((l) => l.product.id))];
      const stock = await lockStock(tx, productIds, location.warehouseId);
      const qtyByProduct = new Map<string, Decimal>();
      for (const l of cart.lines) qtyByProduct.set(l.product.id, (qtyByProduct.get(l.product.id) ?? D(0)).plus(D(l.quantity)));
      for (const [productId, qty] of qtyByProduct) {
        const row = stock.get(productId);
        const available = row ? row.quantity.minus(row.reservedQty) : D(0);
        if (qty.gt(available)) {
          const product = cart.products.get(productId)!;
          throw new AppError(
            "INSUFFICIENT_STOCK",
            `No hay existencia disponible para reservar "${product.name}". Disponible: ${formatQty(available, 3)}.`,
            { productId, productName: product.name, available: available.toString(), requested: qty.toString() },
          );
        }
      }
      for (const [productId, qty] of qtyByProduct) await adjustReserved(tx, productId, location.warehouseId, qty);
    }

    const number = await nextDocumentNumber(tx, "quote");
    const [quote] = await tx
      .insert(quotes)
      .values({
        number,
        customerId: customer?.id ?? null,
        sellerId: ctx.sellerId,
        priceListId,
        status: "open",
        validUntil,
        subtotalUsd: toMoneyDb(cart.totals.subtotalUsd),
        discountUsd: toMoneyDb(cart.totals.discountUsd),
        taxUsd: toMoneyDb(cart.totals.taxUsd),
        totalUsd: toMoneyDb(cart.totals.totalUsd),
        rateVes: toRateDb(snapshot.rateSet.VES ?? 0),
        rateCop: toRateDb(snapshot.rateSet.COP ?? 0),
        reservesStock: input.reserveStock,
        notes: input.notes ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: quotes.id });

    await tx.insert(quoteItems).values(
      cart.totals.lines.map((l, i) => {
        const product = cart.lines[i].product;
        const discount = persistedDiscount(l, l.discountUsd, hasGlobal);
        return {
          quoteId: quote.id,
          productId: product.id,
          description: product.name,
          quantity: toQtyDb(l.quantity),
          unitPriceUsd: toMoneyDb(l.unitPriceUsd),
          discountType: discount.discountType,
          discountValue: toMoneyDb(discount.discountValue),
          taxRate: l.taxRate.toFixed(4),
          taxUsd: toMoneyDb(l.taxUsd),
          lineTotalUsd: toMoneyDb(l.lineTotalUsd),
          sortOrder: String(i).padStart(3, "0"),
        };
      }),
    );

    await writeAudit(tx, {
      userId: ctx.userId,
      action: "quote.create",
      entityType: "quote",
      entityId: quote.id,
      after: { number, totalUsd: cart.totals.totalUsd.toFixed(2), validUntil, reserveStock: input.reserveStock, lines: cart.lines.length },
    });
    return { quoteId: quote.id, number };
  });
}

async function releaseReservations(tx: Tx, quoteId: string, warehouseId: string) {
  const items = await tx.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId));
  for (const item of items) await adjustReserved(tx, item.productId, warehouseId, D(item.quantity).neg());
}

export async function cancelQuote(dbx: Db, quoteId: string, ctx: { userId: string; warehouseId?: string }): Promise<void> {
  const location = ctx.warehouseId ? { warehouseId: ctx.warehouseId } : await getDefaultLocation(dbx);
  await dbx.transaction(async (tx) => {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1).for("update");
    if (!quote) throw notFound("La cotización");
    if (quote.status !== "open" && quote.status !== "accepted") {
      throw new AppError("INVALID_STATE", "Solo se pueden cancelar cotizaciones abiertas.");
    }
    if (quote.reservesStock) await releaseReservations(tx, quote.id, location.warehouseId);
    await tx.update(quotes).set({ status: "cancelled" }).where(eq(quotes.id, quote.id));
    await writeAudit(tx, {
      userId: ctx.userId,
      action: "quote.cancel",
      entityType: "quote",
      entityId: quote.id,
      before: { status: quote.status },
      after: { status: "cancelled" },
    });
  });
}

/** Mark overdue open quotes as expired and release their reservations. */
export async function expireOverdueQuotes(dbx: Db, opts: { warehouseId?: string } = {}): Promise<number> {
  const today = businessDate();
  const overdue = await dbx
    .select({ id: quotes.id, reservesStock: quotes.reservesStock })
    .from(quotes)
    .where(and(inArray(quotes.status, ["open", "accepted"]), lt(quotes.validUntil, today)));
  if (overdue.length === 0) return 0;
  const location = opts.warehouseId ? { warehouseId: opts.warehouseId } : await getDefaultLocation(dbx);
  let count = 0;
  for (const q of overdue) {
    await dbx.transaction(async (tx) => {
      const [fresh] = await tx.select({ status: quotes.status }).from(quotes).where(eq(quotes.id, q.id)).limit(1).for("update");
      if (!fresh || (fresh.status !== "open" && fresh.status !== "accepted")) return;
      if (q.reservesStock) await releaseReservations(tx, q.id, location.warehouseId);
      await tx.update(quotes).set({ status: "expired" }).where(eq(quotes.id, q.id));
      await writeAudit(tx, { userId: null, action: "quote.expire", entityType: "quote", entityId: q.id, after: { status: "expired" } });
      count++;
    });
  }
  return count;
}
