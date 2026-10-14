import Decimal from "decimal.js";
import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db/client";
import { cashSessions, exchangeRates, paymentMethods, priceHistory, quoteItems, quotes, saleItems, salePayments, sales, type UserRole } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { businessDate, formatQty } from "@/lib/format";
import { D, toMoneyDb, toQtyDb, toRateDb } from "@/lib/money";
import { getOpenCashSession } from "@/modules/cash/application/session";
import { writeAudit } from "@/modules/core/application/audit";
import { isUniqueViolation } from "@/modules/core/application/db-errors";
import { getDefaultLocation } from "@/modules/core/application/context";
import { nextDocumentNumber } from "@/modules/core/application/numbering";
import { getPriceListIds } from "@/modules/catalog/infrastructure/catalog-options";
import { getProductsForSale } from "@/modules/catalog/infrastructure/product-lookup";
import type { RateSet } from "@/modules/currency/domain/conversion";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { adjustReserved, applyMovements, lockStock, type MovementInput } from "@/modules/inventory/application/stock";
import { getSetting } from "@/modules/settings/infrastructure/settings";
import { computePaymentState, type PaymentInput, changePartsOf, type ChangeGiven } from "../domain/payments";
import { exceedsDiscountLimit } from "../domain/pricing";
import { priceLines, requireIdentifiedCustomer, resolveCustomerAndPriceList } from "./cart-pricing";
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
  /** Main part of the change (the dollars of a split change). */
  changeCurrencyCode: string | null;
  changeAmount: string;
  /** Every part handed back: one, or two for dollars plus the cents in pesos. */
  changeParts: ChangeGiven[];
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
      changeExtraCurrencyCode: sales.changeExtraCurrencyCode,
      changeExtraAmount: sales.changeExtraAmount,
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
    changeParts: changePartsOf(row),
  };
}

/** Offline sales older than this are refused (a device forgotten in a drawer). */
const OFFLINE_MAX_AGE_DAYS = 30;
/** A rate the device used must have been the official one within these days before the sale. */
const OFFLINE_RATE_WINDOW_DAYS = 10;

/**
 * Rates a device used while offline: each must be the rate in force on the day
 * of the sale (even an old one, the counter warns about it) or one loaded in
 * the days before. A stale but real rate is fine; an invented one is not.
 */
async function offlineRates(dbx: Db, seen: Record<string, string>, codes: Set<string>, soldAt: Date, fallback: RateSet): Promise<RateSet> {
  const out: RateSet = { ...fallback };
  const day = businessDate(soldAt);
  for (const code of codes) {
    const rate = seen[code];
    if (code === "USD" || !rate) continue;
    if (fallback[code] && D(fallback[code]).eq(D(rate))) {
      out[code] = rate;
      continue;
    }
    const [row] = await dbx
      .select({ id: exchangeRates.id })
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.currencyCode, code),
          sql`${exchangeRates.rate} = ${rate}::numeric`,
          sql`${exchangeRates.effectiveDate} between (${day}::date - ${OFFLINE_RATE_WINDOW_DAYS}::int) and ${day}::date`,
        ),
      )
      .limit(1);
    if (!row) {
      throw new AppError("CONFLICT", `La tasa de ${code} que usó el equipo sin conexión (1 $ = ${D(rate).toFixed(2)}) no está en el historial de tasas de esos días.`, {
        reason: "offline_rates",
      });
    }
    out[code] = rate;
  }
  return out;
}

/** Price a product had in a list at a given moment, from the price history. */
async function priceAt(tx: Tx, productId: string, priceListId: string, at: Date): Promise<string | null> {
  const [before] = await tx
    .select({ price: priceHistory.newPriceUsd })
    .from(priceHistory)
    .where(and(eq(priceHistory.productId, productId), eq(priceHistory.priceListId, priceListId), lte(priceHistory.changedAt, at)))
    .orderBy(desc(priceHistory.changedAt))
    .limit(1);
  if (before) return before.price;
  const [after] = await tx
    .select({ price: priceHistory.oldPriceUsd })
    .from(priceHistory)
    .where(and(eq(priceHistory.productId, productId), eq(priceHistory.priceListId, priceListId), gt(priceHistory.changedAt, at)))
    .orderBy(asc(priceHistory.changedAt))
    .limit(1);
  return after?.price ?? null;
}

/**
 * Unit prices a device charged while offline, kept when they are the current
 * price or the price the product had when it was sold; anything else is refused.
 */
async function offlinePrices(
  tx: Tx,
  unitPrices: Record<string, string>,
  productIds: string[],
  priceListId: string,
  warehouseId: string,
  soldAt: Date,
): Promise<Map<string, string>> {
  const { publicId } = await getPriceListIds(tx);
  const current = new Map((await getProductsForSale(productIds, { priceListId, warehouseId, dbx: tx })).map((p) => [p.id, p]));
  const out = new Map<string, string>();
  for (const id of productIds) {
    const charged = unitPrices[id];
    if (!charged) continue;
    const now = current.get(id);
    let ok = Boolean(now?.priceUsd && D(now.priceUsd).eq(D(charged)));
    for (const listId of new Set([priceListId, publicId])) {
      if (ok) break;
      const then = await priceAt(tx, id, listId, soldAt);
      ok = Boolean(then && D(then).eq(D(charged)));
    }
    if (!ok) {
      throw new AppError("CONFLICT", `El precio de "${now?.name ?? "un producto"}" ($ ${D(charged).toFixed(2)}) no era su precio cuando se vendió sin conexión.`, {
        reason: "offline_prices",
        productId: id,
      });
    }
    out.set(id, charged);
  }
  return out;
}

async function completeNewSale(dbx: Db, input: CompleteSaleInput, ctx: SaleContext): Promise<CompleteSaleResult> {
  const policies = await getSetting("policies", dbx);
  const location =
    ctx.warehouseId && ctx.branchId ? { warehouseId: ctx.warehouseId, branchId: ctx.branchId } : await getDefaultLocation(dbx);

  // Sold without a connection and sent now: it happened at `soldAt`, with the device's saved rates and prices.
  const offline = input.offline ?? null;
  const soldAt = offline ? new Date(offline.soldAt) : null;
  if (soldAt && (soldAt.getTime() > Date.now() + 10 * 60_000 || soldAt.getTime() < Date.now() - OFFLINE_MAX_AGE_DAYS * 86_400_000)) {
    throw new AppError("VALIDATION", "La fecha de la venta hecha sin conexión no es válida.", { reason: "offline_date" });
  }

  const snapshot = await getRatesSnapshot(businessDate(soldAt ?? new Date()), dbx);
  if (!offline && snapshot.missing.length > 0 && policies.requireRatesToSell) {
    throw new AppError("RATES_REQUIRED", `Falta la tasa del día para ${snapshot.missing.join(" y ")}. Cárgala en Configuración → Tasas.`, {
      missing: snapshot.missing,
    });
  }

  const session = await getOpenCashSession(dbx, ctx.cashRegisterId);
  if (!session && policies.requireOpenCashSession) {
    throw new AppError(
      "CASH_SESSION_REQUIRED",
      offline ? "La caja está cerrada: las ventas hechas sin conexión se envían cuando la abran." : "La caja está cerrada. Ábrela antes de cobrar.",
    );
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
  const usedCodes = new Set([...paymentInputs.map((p) => p.currencyCode), ...(input.changeOption ?? "USD").split("+")]);
  let rateSet = snapshot.rateSet;
  if (offline) {
    // Every rate the device had is checked, not only the ones this sale shows: the change
    // option may be the default one, which uses the peso rate too.
    rateSet = await offlineRates(dbx, input.clientRates ?? {}, new Set(Object.keys(input.clientRates ?? {})), soldAt!, snapshot.rateSet);
  } else if (input.clientRates) {
    const used = usedCodes;
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
  requireIdentifiedCustomer(customer, "cobrar");
  const maxPct = D(policies.maxDiscountPctByRole[ctx.role] ?? 0);
  // A sale made without a connection already left the counter: it is recorded even if the stock goes negative.
  const allowNegative = offline !== null || (policies.allowNegativeStock && ctx.role === "admin" && input.allowNegativeStock === true);

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

    if (offline && !quote) {
      const charged = await offlinePrices(tx, offline.unitPrices, productIds, priceListId, location.warehouseId, soldAt!);
      for (const [productId, price] of charged) priceOverrides.set(productId, price);
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
      payState = computePaymentState(totals.totalUsd, paymentInputs, rateSet, cashCurrencies, { minCopChange: policies.minCopChange });
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
    let changeExtraCurrencyCode: string | null = null;
    let changeExtraAmount = D(0);
    if (payState.changeUsd.gt(0)) {
      // Without a choice, the first option: dollars plus the cents in pesos when possible.
      const option = payState.changeOptions.find((o) => o.key === input.changeOption) ?? payState.changeOptions[0];
      if (!option) throw new AppError("VALIDATION", "No hay una moneda de efectivo configurada para dar el cambio.");
      [changeCurrencyCode, changeAmount] = [option.parts[0].currency.code, option.parts[0].amount];
      if (option.parts[1]) [changeExtraCurrencyCode, changeExtraAmount] = [option.parts[1].currency.code, option.parts[1].amount];
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
        customerId: customer.id,
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
        changeExtraCurrencyCode,
        changeExtraAmount: toMoneyDb(changeExtraAmount),
        rateVes: toRateDb(rateSet.VES ?? 0),
        rateCop: toRateDb(rateSet.COP ?? 0),
        ...(soldAt ? { saleDate: soldAt, soldOffline: true } : {}),
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
        customerId: customer.id,
        totalUsd: totals.totalUsd.toFixed(2),
        discountUsd: totals.discountUsd.toFixed(2),
        paidUsd: payState.paidUsd.toFixed(2),
        changeUsd: payState.changeUsd.toFixed(2),
        supervisorId: exceeds ? supervisorId : null,
        quoteId: quote?.id ?? null,
        allowNegativeStock: allowNegative,
        ...(soldAt ? { soldOffline: true, soldAt: soldAt.toISOString() } : {}),
      },
    });

    return {
      saleId: sale.id,
      number: sale.number ?? number,
      totalUsd: totals.totalUsd.toFixed(2),
      changeUsd: payState.changeUsd.toFixed(2),
      changeCurrencyCode,
      changeAmount: changeAmount.toString(),
      changeParts: changePartsOf({
        changeCurrencyCode,
        changeAmount: changeAmount.toString(),
        changeExtraCurrencyCode,
        changeExtraAmount: changeExtraAmount.toString(),
      }),
    };
  });
}
