import Decimal from "decimal.js";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cashSessions, paymentMethods, quoteItems, quotes, saleItems, salePayments, sales, type UserRole } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { businessDate, formatQty } from "@/lib/format";
import { D, toMoneyDb, toQtyDb, toRateDb } from "@/lib/money";
import { getOpenCashSession } from "@/modules/cash/application/session";
import { writeAudit } from "@/modules/core/application/audit";
import { isUniqueViolation } from "@/modules/core/application/db-errors";
import { getDefaultLocation } from "@/modules/core/application/context";
import { nextDocumentNumber } from "@/modules/core/application/numbering";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { adjustReserved, applyMovements, lockStock, type MovementInput } from "@/modules/inventory/application/stock";
import { getSetting } from "@/modules/settings/infrastructure/settings";
import { computePaymentState, type PaymentInput } from "../domain/payments";
import { exceedsDiscountLimit } from "../domain/pricing";
import { priceLines, resolveCustomerAndPriceList } from "./cart-pricing";
import type { CompleteSaleInput } from "./schemas";
import type { SupervisorApproval } from "./supervisor-token";

export interface SaleContext {
  /** Logged-in user (created_by). */
  userId: string;
  /** Acting seller (seller_id); its role governs the discount limit. */
  sellerId: string;
  role: UserRole;
  /** Admin approval by PIN, when the discount exceeds the role limit. */
  supervisor?: SupervisorApproval | null;
  /** Overrides for tests; defaults to the configured location and register. */
  warehouseId?: string;
  branchId?: string;
  cashRegisterId?: string;
}

export interface CompleteSaleResult {
  saleId: string;
  number: string;
  totalUsd: string;
  changeUsd: string;
  changeCurrencyCode: string | null;
  changeAmount: string;
}

/**
 * Complete a counter sale. Everything is recomputed on the server: prices come
 * from the price list (or the accepted quote), totals from computeTotals,
 * payments from computePaymentState with today's rates. Runs in one
 * transaction that locks stock, assigns the number and writes kardex rows.
 */
export async function completeSale(dbx: Db, input: CompleteSaleInput, ctx: SaleContext): Promise<CompleteSaleResult> {
  // Same checkout sent twice (lost response, retry after reconnecting): return the sale already made.
  if (input.clientRequestId) {
    const existing = await findSaleByRequestId(dbx, input.clientRequestId);
    if (existing) return existing;
  }
  try {
    return await completeNewSale(dbx, input, ctx);
  } catch (err) {
    if (input.clientRequestId && isUniqueViolation(err)) {
      const existing = await findSaleByRequestId(dbx, input.clientRequestId);
      if (existing) return existing;
    }
    throw err;
  }
}

async function findSaleByRequestId(dbx: Db, clientRequestId: string): Promise<CompleteSaleResult | null> {
  const [row] = await dbx
    .select({
      id: sales.id,
      number: sales.number,
      totalUsd: sales.totalUsd,
      changeUsd: sales.changeUsd,
      changeCurrencyCode: sales.changeCurrencyCode,
      changeAmount: sales.changeAmount,
    })
    .from(sales)
    .where(eq(sales.clientRequestId, clientRequestId))
    .limit(1);
  if (!row) return null;
  return {
    saleId: row.id,
    number: row.number ?? "",
    totalUsd: D(row.totalUsd).toFixed(2),
    changeUsd: D(row.changeUsd).toFixed(2),
    changeCurrencyCode: row.changeCurrencyCode,
    changeAmount: D(row.changeAmount).toString(),
  };
}

async function completeNewSale(dbx: Db, input: CompleteSaleInput, ctx: SaleContext): Promise<CompleteSaleResult> {
  const policies = await getSetting("policies", dbx);
  const location =
    ctx.warehouseId && ctx.branchId ? { warehouseId: ctx.warehouseId, branchId: ctx.branchId } : await getDefaultLocation(dbx);

  const snapshot = await getRatesSnapshot(businessDate(), dbx);
  if (snapshot.missing.length > 0 && policies.requireRatesToSell) {
    throw new AppError("RATES_REQUIRED", `Falta la tasa del día para ${snapshot.missing.join(" y ")}. Cárgala en Configuración → Tasas.`, {
      missing: snapshot.missing,
    });
  }

  const session = await getOpenCashSession(dbx, ctx.cashRegisterId);
  if (!session && policies.requireOpenCashSession) {
    throw new AppError("CASH_SESSION_REQUIRED", "La caja está cerrada. Ábrela antes de cobrar.");
  }

  const methods = await dbx.select().from(paymentMethods).where(eq(paymentMethods.isActive, true));
  const methodById = new Map(methods.map((m) => [m.id, m]));
  const paymentInputs: PaymentInput[] = input.payments.map((p, i) => {
    const method = methodById.get(p.paymentMethodId);
    if (!method) throw new AppError("VALIDATION", "Uno de los métodos de pago no está disponible.");
    if (method.requiresReference && !p.reference) {
      throw new AppError("VALIDATION", `Indica la referencia del pago por ${method.name}.`);
    }
    return { key: String(i), paymentMethodId: method.id, currencyCode: method.currencyCode, amount: p.amount, reference: p.reference ?? null };
  });
  const cashCurrencies = snapshot.currencies.filter((c) => methods.some((m) => m.allowsChange && m.currencyCode === c.code));

  // The screen computed the amounts with the rates it loaded; if a rate changed since
  // (BCV update, admin correction), ask to review instead of charging something else.
  if (input.clientRates) {
    const used = new Set([...paymentInputs.map((p) => p.currencyCode), input.changeCurrencyCode ?? "USD"]);
    for (const code of used) {
      const current = snapshot.rateSet[code];
      const seen = input.clientRates[code];
      if (code === "USD" || !current || !seen) continue;
      if (!D(seen).eq(D(current))) {
        throw new AppError("CONFLICT", `La tasa de ${code} cambió mientras cobrabas: ahora 1 $ = ${D(current).toFixed(2)}. Revisa los montos y cobra de nuevo.`, {
          reason: "rates_changed",
        });
      }
    }
  }

  const { customer, priceListId } = await resolveCustomerAndPriceList(dbx, input.customerId);
  const maxPct = D(policies.maxDiscountPctByRole[ctx.role] ?? 0);
  const allowNegative = policies.allowNegativeStock && ctx.role === "admin" && input.allowNegativeStock === true;

  return dbx.transaction(async (tx) => {
    const productIds = [...new Set(input.lines.map((l) => l.productId))];
    await lockStock(tx, productIds, location.warehouseId);

    // Quote conversion: honour the quoted prices and release its reservations.
    const priceOverrides = new Map<string, string>();
    let quote: typeof quotes.$inferSelect | null = null;
    if (input.quoteId) {
      const [q] = await tx.select().from(quotes).where(eq(quotes.id, input.quoteId)).limit(1).for("update");
      if (!q) throw notFound("La cotización");
      if (q.status !== "open" && q.status !== "accepted") {
        throw new AppError("INVALID_STATE", "La cotización ya fue convertida, cancelada o venció.");
      }
      quote = q;
      const items = await tx.select().from(quoteItems).where(eq(quoteItems.quoteId, q.id));
      for (const item of items) {
        priceOverrides.set(item.productId, item.unitPriceUsd);
        if (q.reservesStock) await adjustReserved(tx, item.productId, location.warehouseId, D(item.quantity).neg());
      }
    }

    const cart = await priceLines(tx, input.lines, {
      priceListId: quote ? quote.priceListId : priceListId,
      warehouseId: location.warehouseId,
      globalDiscount: input.globalDiscount ?? null,
      priceOverrides,
    });
    const { totals } = cart;
    if (input.expectedTotalUsd && !D(input.expectedTotalUsd).eq(totals.totalUsd)) {
      throw new AppError("CONFLICT", `Los precios cambiaron: el total ahora es $ ${totals.totalUsd.toFixed(2)}. Revisa el carrito y cobra de nuevo.`, {
        reason: "prices_changed",
      });
    }

    // Discount limit by role, checked per line and for the whole sale. An admin
    // approval only covers the user who asked for it and up to the approved %.
    const exceeds = exceedsDiscountLimit(totals, maxPct);
    const approval = ctx.supervisor ?? null;
    const approved = Boolean(exceeds && approval && approval.requesterId === ctx.userId && !exceedsDiscountLimit(totals, approval.maxPct));
    if (exceeds && !approved) {
      throw new AppError(
        "FORBIDDEN",
        approval
          ? `El descuento es mayor que el autorizado (${D(approval.maxPct).toFixed(0)} %). Pide la autorización de nuevo.`
          : `El descuento supera el máximo permitido para tu rol (${maxPct.toFixed(0)} %). Pide la autorización de un administrador.`,
        { reason: "discount_limit", maxPct: maxPct.toString() },
      );
    }
    const supervisorId = approved ? approval!.adminId : null;

    // Available stock = physical − reserved (fresh after releasing the quote).
    const qtyByProduct = new Map<string, Decimal>();
    for (const l of cart.lines) qtyByProduct.set(l.product.id, (qtyByProduct.get(l.product.id) ?? D(0)).plus(D(l.quantity)));
    if (!allowNegative) {
      const stock = await lockStock(tx, productIds, location.warehouseId);
      for (const [productId, qty] of qtyByProduct) {
        const row = stock.get(productId);
        const available = row ? row.quantity.minus(row.reservedQty) : D(0);
        if (qty.gt(available)) {
          const product = cart.products.get(productId)!;
          throw new AppError("INSUFFICIENT_STOCK", `No hay existencia suficiente de "${product.name}". Disponible: ${formatQty(available, 3)}.`, {
            productId,
            productName: product.name,
            available: available.toString(),
            requested: qty.toString(),
          });
        }
      }
    }

    // Payments must cover the total (half-cent tolerance inside computePaymentState).
    let payState;
    try {
      payState = computePaymentState(totals.totalUsd, paymentInputs, snapshot.rateSet, cashCurrencies);
    } catch (err) {
      throw new AppError("RATES_REQUIRED", err instanceof Error ? err.message : "Falta una tasa de cambio.");
    }
    if (!payState.isPaid) {
      throw new AppError("VALIDATION", `Faltan $ ${payState.remainingUsd.toFixed(2)} por pagar.`, { remainingUsd: payState.remainingUsd.toString() });
    }
    // A scanned barcode typed into an amount field must not become a "payment".
    if (payState.changeUsd.gt(Decimal.max(totals.totalUsd, 100))) {
      throw new AppError("VALIDATION", `El vuelto ($ ${payState.changeUsd.toFixed(2)}) es demasiado alto. Revisa los montos de pago.`);
    }
    let changeCurrencyCode: string | null = null;
    let changeAmount = D(0);
    if (payState.changeUsd.gt(0)) {
      const wanted = input.changeCurrencyCode ?? "USD";
      const option = payState.changeOptions.find((o) => o.currency.code === wanted) ?? payState.changeOptions[0];
      if (!option) throw new AppError("VALIDATION", "No hay una moneda de efectivo configurada para dar el cambio.");
      changeCurrencyCode = option.currency.code;
      changeAmount = option.amount;
    }

    // The cash session must still be open when the sale is written: a close that
    // started meanwhile waits for this sale (and counts it) or this sale is refused.
    if (session) {
      const [current] = await tx.select({ status: cashSessions.status }).from(cashSessions).where(eq(cashSessions.id, session.id)).for("share");
      if (current?.status !== "open") throw new AppError("CASH_SESSION_REQUIRED", "La caja se acaba de cerrar. Pide que la abran de nuevo.");
    }

    // A resumed held sale is replaced by the completed sale, once.
    if (input.heldSaleId) {
      const removed = await tx
        .delete(sales)
        .where(and(eq(sales.id, input.heldSaleId), eq(sales.status, "held")))
        .returning({ id: sales.id });
      if (removed.length === 0) throw new AppError("INVALID_STATE", "Esta venta en espera ya fue cobrada o descartada en otro equipo.");
    }

    const number = await nextDocumentNumber(tx, "sale");
    const [sale] = await tx
      .insert(sales)
      .values({
        number,
        branchId: location.branchId,
        warehouseId: location.warehouseId,
        cashSessionId: session?.id ?? null,
        customerId: customer?.id ?? null,
        sellerId: ctx.sellerId,
        priceListId: quote ? quote.priceListId : priceListId,
        status: "completed",
        subtotalUsd: toMoneyDb(totals.subtotalUsd),
        discountUsd: toMoneyDb(totals.discountUsd),
        taxUsd: toMoneyDb(totals.taxUsd),
        totalUsd: toMoneyDb(totals.totalUsd),
        paidUsd: toMoneyDb(payState.paidUsd),
        changeUsd: toMoneyDb(payState.changeUsd),
        changeCurrencyCode,
        changeAmount: toMoneyDb(changeAmount),
        rateVes: toRateDb(snapshot.rateSet.VES ?? 0),
        rateCop: toRateDb(snapshot.rateSet.COP ?? 0),
        notes: input.notes ?? null,
        quoteId: quote?.id ?? null,
        clientRequestId: input.clientRequestId ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: sales.id, number: sales.number });

    const movements: MovementInput[] = [...qtyByProduct].map(([productId, qty]) => ({
      productId,
      warehouseId: location.warehouseId,
      type: "sale_out",
      quantity: qty.neg(),
      unitCostUsd: cart.products.get(productId)!.costAvgUsd,
      referenceType: "sale",
      referenceId: sale.id,
      userId: ctx.userId,
      allowNegative,
    }));
    await applyMovements(tx, movements);

    await tx.insert(saleItems).values(
      totals.lines.map((l, i) => {
        const product = cart.lines[i].product;
        return {
          saleId: sale.id,
          productId: product.id,
          description: product.name,
          quantity: toQtyDb(l.quantity),
          unitPriceUsd: toMoneyDb(l.unitPriceUsd),
          unitCostUsd: toMoneyDb(product.costAvgUsd),
          discountType: l.discountType,
          discountValue: toMoneyDb(l.discountValue),
          discountUsd: toMoneyDb(l.discountUsd),
          taxRate: l.taxRate.toFixed(4),
          taxUsd: toMoneyDb(l.taxUsd),
          lineTotalUsd: toMoneyDb(l.lineTotalUsd),
          discountAuthorizedBy: exceeds && l.discountUsd.gt(0) ? supervisorId : null,
        };
      }),
    );

    if (payState.payments.length > 0) {
      await tx.insert(salePayments).values(
        payState.payments.map((p) => ({
          saleId: sale.id,
          paymentMethodId: p.paymentMethodId,
          currencyCode: p.currencyCode,
          amount: toMoneyDb(p.amountDec),
          exchangeRate: toRateDb(p.exchangeRate),
          amountUsd: toMoneyDb(p.amountUsd),
          reference: p.reference ?? null,
        })),
      );
    }

    if (quote) {
      await tx.update(quotes).set({ status: "converted" }).where(eq(quotes.id, quote.id));
    }

    await writeAudit(tx, {
      userId: ctx.userId,
      action: "sale.complete",
      entityType: "sale",
      entityId: sale.id,
      after: {
        number,
        sellerId: ctx.sellerId,
        customerId: customer?.id ?? null,
        totalUsd: totals.totalUsd.toFixed(2),
        discountUsd: totals.discountUsd.toFixed(2),
        paidUsd: payState.paidUsd.toFixed(2),
        changeUsd: payState.changeUsd.toFixed(2),
        supervisorId: exceeds ? supervisorId : null,
        quoteId: quote?.id ?? null,
        allowNegativeStock: allowNegative,
      },
    });

    return {
      saleId: sale.id,
      number: sale.number ?? number,
      totalUsd: totals.totalUsd.toFixed(2),
      changeUsd: payState.changeUsd.toFixed(2),
      changeCurrencyCode,
      changeAmount: changeAmount.toString(),
    };
  });
}
