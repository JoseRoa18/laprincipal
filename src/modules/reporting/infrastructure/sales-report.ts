import { and, asc, count, countDistinct, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { categories, paymentMethods, products, saleItems, salePayments, saleReturns, sales, users } from "@/db/schema";
import { D, roundTo } from "@/lib/money";
import { eachDay, previousRange, type DateRange } from "../domain/date-range";
import { dayEndExclusive, dayStart } from "../domain/date-range";
import { dayExpr, hourExpr, netLineTotal, netQty, resolveScope, SOLD_STATUSES, sumOf, type ScopeOptions } from "./common";

export interface SalesTotals {
  total: string;
  count: number;
  avgTicket: string;
  units: string;
  tax: string;
  discount: string;
}

export interface SalesReport {
  range: DateRange;
  previous: { from: string; to: string };
  totals: SalesTotals;
  previousTotals: SalesTotals;
  byDay: Array<{ day: string; total: string; count: number }>;
  byProduct: Array<{ productId: string; sku: string; name: string; partNumber: string | null; units: string; revenue: string; share: number }>;
  byCategory: Array<{ categoryId: string | null; name: string; units: string; revenue: string; share: number }>;
  bySeller: Array<{ sellerId: string; name: string; count: number; total: string; share: number }>;
  byMethod: Array<{ methodId: string; name: string; currencyCode: string; amount: string; amountUsd: string; count: number; share: number }>;
  byHour: Array<{ hour: number; count: number; total: string }>;
  voided: { count: number; total: string };
  returned: { count: number; total: string };
}

function share(part: string, total: string): number {
  const t = D(total);
  if (t.lte(0)) return 0;
  return roundTo(D(part).div(t).mul(100), 1).toNumber();
}

export async function getSalesReport(range: DateRange, opts: ScopeOptions = {}): Promise<SalesReport> {
  const { dbx, warehouseId, tz } = await resolveScope(opts);
  const previous = previousRange(range);

  const between = (r: { from: string; to: string }) => and(gte(sales.saleDate, dayStart(r.from, tz)), lt(sales.saleDate, dayEndExclusive(r.to, tz)));
  const soldFilter = and(eq(sales.warehouseId, warehouseId), inArray(sales.status, [...SOLD_STATUSES]));
  const inRange = and(soldFilter, between(range));

  const totalsFor = async (r: { from: string; to: string }): Promise<SalesTotals> => {
    const [[head], [items]] = await Promise.all([
      dbx
        .select({ count: count(), total: sumOf(sales.totalUsd), tax: sumOf(sales.taxUsd), discount: sumOf(sales.discountUsd) })
        .from(sales)
        .where(and(soldFilter, between(r))),
      dbx
        .select({ units: sumOf(netQty) })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .where(and(soldFilter, between(r))),
    ]);
    const c = head?.count ?? 0;
    const total = D(head?.total ?? 0);
    return {
      total: total.toFixed(4),
      count: c,
      avgTicket: c > 0 ? roundTo(total.div(c), 2).toFixed(4) : "0.0000",
      units: items?.units ?? "0",
      tax: head?.tax ?? "0",
      discount: head?.discount ?? "0",
    };
  };

  const categoryLabel = sql<string>`coalesce(${categories.name}, 'Sin categoría')`;

  const [totals, previousTotals, dayRows, byProductRows, byCategoryRows, bySellerRows, byMethodRows, byHourRows, voidedRow, returnedRow] =
    await Promise.all([
      totalsFor(range),
      totalsFor(previous),
      dbx
        .select({ day: dayExpr(sales.saleDate, tz), total: sumOf(sales.totalUsd), count: count() })
        .from(sales)
        .where(inRange)
        .groupBy(dayExpr(sales.saleDate, tz)),
      dbx
        .select({
          productId: saleItems.productId,
          sku: products.sku,
          name: products.name,
          partNumber: products.partNumber,
          units: sumOf(netQty),
          revenue: sumOf(netLineTotal),
        })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .innerJoin(products, eq(products.id, saleItems.productId))
        .where(inRange)
        .groupBy(saleItems.productId, products.sku, products.name, products.partNumber)
        .orderBy(desc(sumOf(netLineTotal)), asc(products.name)),
      dbx
        .select({ categoryId: products.categoryId, name: categoryLabel, units: sumOf(netQty), revenue: sumOf(netLineTotal) })
        .from(saleItems)
        .innerJoin(sales, eq(sales.id, saleItems.saleId))
        .innerJoin(products, eq(products.id, saleItems.productId))
        .leftJoin(categories, eq(categories.id, products.categoryId))
        .where(inRange)
        .groupBy(products.categoryId, categoryLabel)
        .orderBy(desc(sumOf(netLineTotal))),
      dbx
        .select({ sellerId: sales.sellerId, name: users.name, count: count(), total: sumOf(sales.totalUsd) })
        .from(sales)
        .innerJoin(users, eq(users.id, sales.sellerId))
        .where(inRange)
        .groupBy(sales.sellerId, users.name)
        .orderBy(desc(sumOf(sales.totalUsd))),
      dbx
        .select({
          methodId: salePayments.paymentMethodId,
          name: paymentMethods.name,
          currencyCode: salePayments.currencyCode,
          amount: sumOf(salePayments.amount),
          amountUsd: sumOf(salePayments.amountUsd),
          count: countDistinct(salePayments.saleId),
        })
        .from(salePayments)
        .innerJoin(sales, eq(sales.id, salePayments.saleId))
        .innerJoin(paymentMethods, eq(paymentMethods.id, salePayments.paymentMethodId))
        .where(inRange)
        .groupBy(salePayments.paymentMethodId, paymentMethods.name, salePayments.currencyCode)
        .orderBy(desc(sumOf(salePayments.amountUsd))),
      dbx
        .select({ hour: hourExpr(sales.saleDate, tz), count: count(), total: sumOf(sales.totalUsd) })
        .from(sales)
        .where(inRange)
        .groupBy(hourExpr(sales.saleDate, tz))
        .orderBy(asc(hourExpr(sales.saleDate, tz))),
      dbx
        .select({ count: count(), total: sumOf(sales.totalUsd) })
        .from(sales)
        .where(and(eq(sales.warehouseId, warehouseId), eq(sales.status, "voided"), between(range)))
        .then((r) => r[0]),
      dbx
        .select({ count: count(), total: sumOf(saleReturns.totalUsd) })
        .from(saleReturns)
        .innerJoin(sales, eq(sales.id, saleReturns.saleId))
        .where(
          and(
            eq(sales.warehouseId, warehouseId),
            eq(saleReturns.status, "completed"),
            gte(saleReturns.createdAt, dayStart(range.from, tz)),
            lt(saleReturns.createdAt, dayEndExclusive(range.to, tz)),
          ),
        )
        .then((r) => r[0]),
    ]);

  const dayMap = new Map(dayRows.map((r) => [r.day, r]));
  const totalUsd = totals.total;
  const paymentsUsd = byMethodRows.reduce((acc, r) => acc.plus(D(r.amountUsd)), D(0)).toFixed(4);

  return {
    range,
    previous,
    totals,
    previousTotals,
    byDay: eachDay(range.from, range.to).map((day) => {
      const r = dayMap.get(day);
      return { day, total: r?.total ?? "0", count: r?.count ?? 0 };
    }),
    byProduct: byProductRows.map((r) => ({ ...r, share: share(r.revenue, totalUsd) })),
    byCategory: byCategoryRows.map((r) => ({ ...r, share: share(r.revenue, totalUsd) })),
    bySeller: bySellerRows.map((r) => ({ ...r, share: share(r.total, totalUsd) })),
    byMethod: byMethodRows.map((r) => ({ ...r, share: share(r.amountUsd, paymentsUsd) })),
    byHour: byHourRows.map((r) => ({ hour: Number(r.hour), count: r.count, total: r.total })),
    voided: { count: voidedRow?.count ?? 0, total: voidedRow?.total ?? "0" },
    returned: { count: returnedRow?.count ?? 0, total: returnedRow?.total ?? "0" },
  };
}
