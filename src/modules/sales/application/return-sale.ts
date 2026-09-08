import type Decimal from "decimal.js";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { paymentMethods, saleItems, saleReturnItems, saleReturns, sales, type UserRole } from "@/db/schema";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { formatQty } from "@/lib/format";
import { D, roundTo, sum, toMoneyDb, toQtyDb } from "@/lib/money";
import { getOpenCashSession } from "@/modules/cash/application/session";
import { writeAudit } from "@/modules/core/application/audit";
import { nextDocumentNumber } from "@/modules/core/application/numbering";
import { toCash } from "@/modules/currency/domain/conversion";
import { listCurrencies } from "@/modules/currency/infrastructure/rates";
import { applyMovements } from "@/modules/inventory/application/stock";
import { getSetting } from "@/modules/settings/infrastructure/settings";
import type { CreateReturnInput } from "./schemas";

export interface ReturnContext {
  userId: string;
  role: UserRole;
  cashRegisterId?: string;
}

export interface ReturnResult {
  returnId: string;
  number: string;
  totalUsd: string;
  refundCurrencyCode: string | null;
  refundAmount: string;
  saleStatus: "partially_refunded" | "refunded";
}

/**
 * Register a customer return: the refund is computed from the returned line
 * totals (proportional to quantity) converted with the rates stored on the
 * sale. Restocking creates `return_in` movements at the line's historical cost.
 */
export async function createReturn(dbx: Db, input: CreateReturnInput, ctx: ReturnContext): Promise<ReturnResult> {
  // Mirrors PERMISSIONS.return_sale in src/lib/auth-guards (kept out of here so tests run without next-auth).
  if (ctx.role !== "admin" && ctx.role !== "seller") throw forbidden();
  const policies = await getSetting("policies", dbx);
  const session = await getOpenCashSession(dbx, ctx.cashRegisterId);
  const currencies = await listCurrencies(dbx);

  return dbx.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, input.saleId)).limit(1).for("update");
    if (!sale) throw notFound("La venta");
    if (sale.status !== "completed" && sale.status !== "partially_refunded") {
      throw new AppError("INVALID_STATE", "Esta venta no admite devoluciones en su estado actual.");
    }

    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
    const byId = new Map(items.map((i) => [i.id, i]));
    const requested = new Map<string, Decimal>();
    for (const r of input.items) requested.set(r.saleItemId, (requested.get(r.saleItemId) ?? D(0)).plus(D(r.quantity)));

    const lines = [...requested].map(([saleItemId, qty]) => {
      const item = byId.get(saleItemId);
      if (!item) throw new AppError("VALIDATION", "Una de las líneas no pertenece a esta venta.");
      const pending = D(item.quantity).minus(D(item.returnedQty));
      if (qty.gt(pending)) {
        throw new AppError("VALIDATION", `Solo puedes devolver ${formatQty(pending, 3)} de "${item.description}".`, {
          saleItemId,
          pending: pending.toString(),
        });
      }
      const lineTotal = roundTo(D(item.lineTotalUsd).mul(qty).div(D(item.quantity)), 2);
      return { item, qty, lineTotal };
    });
    const totalUsd = sum(lines.map((l) => l.lineTotal));

    let method: typeof paymentMethods.$inferSelect | null = null;
    let refundCurrencyCode: string | null = null;
    let refundAmount = D(0);
    if (input.refundMethodId && totalUsd.gt(0)) {
      const [m] = await tx.select().from(paymentMethods).where(eq(paymentMethods.id, input.refundMethodId)).limit(1);
      if (!m || !m.isActive) throw new AppError("VALIDATION", "El método de reembolso no está disponible.");
      method = m;
      refundCurrencyCode = m.currencyCode;
      const rate =
        m.currencyCode === "USD" ? D(1) : m.currencyCode === "VES" ? D(sale.rateVes) : m.currencyCode === "COP" ? D(sale.rateCop) : D(0);
      if (rate.lte(0)) throw new AppError("VALIDATION", `La venta no tiene tasa registrada para ${m.currencyCode}.`);
      const currency = currencies.find((c) => c.code === m.currencyCode);
      const raw = totalUsd.mul(rate);
      refundAmount = m.kind === "cash" && currency ? toCash(raw, currency) : roundTo(raw, currency?.decimals ?? 2);
      if (policies.requireOpenCashSession && m.countsInDrawer && !session) {
        throw new AppError("CASH_SESSION_REQUIRED", "La caja está cerrada. Ábrela para reembolsar en efectivo.");
      }
    }

    const number = await nextDocumentNumber(tx, "return");
    const [ret] = await tx
      .insert(saleReturns)
      .values({
        number,
        saleId: sale.id,
        cashSessionId: session?.id ?? null,
        status: "completed",
        reasonId: input.reasonId ?? null,
        reasonText: input.reasonText ?? null,
        restock: input.restock,
        refundMethodId: method?.id ?? null,
        refundCurrencyCode,
        refundAmount: toMoneyDb(refundAmount),
        refundAmountUsd: toMoneyDb(method ? totalUsd : 0),
        totalUsd: toMoneyDb(totalUsd),
        notes: input.notes ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: saleReturns.id });

    await tx.insert(saleReturnItems).values(
      lines.map((l) => ({
        returnId: ret.id,
        saleItemId: l.item.id,
        productId: l.item.productId,
        quantity: toQtyDb(l.qty),
        unitPriceUsd: l.item.unitPriceUsd,
        lineTotalUsd: toMoneyDb(l.lineTotal),
      })),
    );

    if (input.restock) {
      await applyMovements(
        tx,
        lines.map((l) => ({
          productId: l.item.productId,
          warehouseId: sale.warehouseId,
          type: "return_in" as const,
          quantity: l.qty,
          unitCostUsd: l.item.unitCostUsd,
          referenceType: "sale_return",
          referenceId: ret.id,
          reasonId: input.reasonId ?? null,
          userId: ctx.userId,
          notes: `Devolución ${number} de ${sale.number ?? "venta"}`,
          allowNegative: true,
        })),
      );
    }

    for (const l of lines) {
      await tx
        .update(saleItems)
        .set({ returnedQty: toQtyDb(D(l.item.returnedQty).plus(l.qty)) })
        .where(eq(saleItems.id, l.item.id));
    }

    const allReturned = items.every((item) => {
      const extra = lines.find((l) => l.item.id === item.id)?.qty ?? D(0);
      return D(item.returnedQty).plus(extra).gte(D(item.quantity));
    });
    const saleStatus = allReturned ? "refunded" : "partially_refunded";
    await tx.update(sales).set({ status: saleStatus }).where(eq(sales.id, sale.id));

    await writeAudit(tx, {
      userId: ctx.userId,
      action: "sale.return",
      entityType: "sale_return",
      entityId: ret.id,
      after: {
        number,
        saleId: sale.id,
        saleNumber: sale.number,
        totalUsd: totalUsd.toFixed(2),
        refundCurrencyCode,
        refundAmount: refundAmount.toString(),
        restock: input.restock,
        saleStatus,
      },
    });

    return {
      returnId: ret.id,
      number,
      totalUsd: totalUsd.toFixed(2),
      refundCurrencyCode,
      refundAmount: refundAmount.toString(),
      saleStatus,
    };
  });
}
