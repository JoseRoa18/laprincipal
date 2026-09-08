import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { saleItems, sales, type UserRole } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { businessDate } from "@/lib/format";
import { toMoneyDb, toQtyDb, toRateDb } from "@/lib/money";
import { writeAudit } from "@/modules/core/application/audit";
import { getDefaultLocation } from "@/modules/core/application/context";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { persistedDiscount, priceLines, resolveCustomerAndPriceList } from "./cart-pricing";
import type { HoldSaleInput } from "./schemas";

export interface HoldContext {
  userId: string;
  sellerId: string;
  role: UserRole;
  warehouseId?: string;
  branchId?: string;
}

/**
 * Park the cart as a `held` sale: no number, no stock movement. Any user can
 * resume it later from the "Ventas en espera" drawer.
 */
export async function holdSale(dbx: Db, input: HoldSaleInput, ctx: HoldContext): Promise<{ saleId: string }> {
  const location =
    ctx.warehouseId && ctx.branchId ? { warehouseId: ctx.warehouseId, branchId: ctx.branchId } : await getDefaultLocation(dbx);
  const snapshot = await getRatesSnapshot(businessDate(), dbx);
  const { customer, priceListId } = await resolveCustomerAndPriceList(dbx, input.customerId);
  const cart = await priceLines(dbx, input.lines, {
    priceListId,
    warehouseId: location.warehouseId,
    globalDiscount: input.globalDiscount ?? null,
  });
  const hasGlobal = Boolean(input.globalDiscount && Number(input.globalDiscount.value) > 0);

  return dbx.transaction(async (tx) => {
    if (input.heldSaleId) {
      await tx.delete(sales).where(and(eq(sales.id, input.heldSaleId), eq(sales.status, "held")));
    }
    const [sale] = await tx
      .insert(sales)
      .values({
        branchId: location.branchId,
        warehouseId: location.warehouseId,
        customerId: customer?.id ?? null,
        sellerId: ctx.sellerId,
        priceListId,
        status: "held",
        holdLabel: input.label,
        subtotalUsd: toMoneyDb(cart.totals.subtotalUsd),
        discountUsd: toMoneyDb(cart.totals.discountUsd),
        taxUsd: toMoneyDb(cart.totals.taxUsd),
        totalUsd: toMoneyDb(cart.totals.totalUsd),
        rateVes: toRateDb(snapshot.rateSet.VES ?? 0),
        rateCop: toRateDb(snapshot.rateSet.COP ?? 0),
        notes: input.notes ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: sales.id });

    await tx.insert(saleItems).values(
      cart.totals.lines.map((l, i) => {
        const product = cart.lines[i].product;
        const discount = persistedDiscount(l, l.discountUsd, hasGlobal);
        return {
          saleId: sale.id,
          productId: product.id,
          description: product.name,
          quantity: toQtyDb(l.quantity),
          unitPriceUsd: toMoneyDb(l.unitPriceUsd),
          unitCostUsd: toMoneyDb(product.costAvgUsd),
          discountType: discount.discountType,
          discountValue: toMoneyDb(discount.discountValue),
          discountUsd: toMoneyDb(l.discountUsd),
          taxRate: l.taxRate.toFixed(4),
          taxUsd: toMoneyDb(l.taxUsd),
          lineTotalUsd: toMoneyDb(l.lineTotalUsd),
        };
      }),
    );

    await writeAudit(tx, {
      userId: ctx.userId,
      action: "sale.hold",
      entityType: "sale",
      entityId: sale.id,
      after: { label: input.label, totalUsd: cart.totals.totalUsd.toFixed(2), lines: cart.lines.length },
    });
    return { saleId: sale.id };
  });
}

/** Delete a held sale that will not be resumed. */
export async function discardHeldSale(dbx: Db, saleId: string, ctx: { userId: string }): Promise<void> {
  await dbx.transaction(async (tx) => {
    const [held] = await tx
      .select({ id: sales.id, status: sales.status, holdLabel: sales.holdLabel })
      .from(sales)
      .where(eq(sales.id, saleId))
      .limit(1);
    if (!held) throw notFound("La venta en espera");
    if (held.status !== "held") throw new AppError("INVALID_STATE", "Esta venta ya no está en espera.");
    await tx.delete(sales).where(eq(sales.id, saleId));
    await writeAudit(tx, { userId: ctx.userId, action: "sale.discard_held", entityType: "sale", entityId: saleId, before: held });
  });
}
