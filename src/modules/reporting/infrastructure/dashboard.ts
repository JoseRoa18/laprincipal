import { and, count, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { productStats, products, saleItems, sales, stockLevels, users } from "@/db/schema";
import { businessDate } from "@/lib/format";
import { D, roundTo } from "@/lib/money";
import { getOpenCashSession } from "@/modules/cash/application/session";
import { getStatsComputedAt } from "../application/product-stats";
import { addDays, dayEndExclusive, dayStart, diffDays, eachDay, startOfMonth } from "../domain/date-range";
import { dayExpr, netQty, pctChange, resolveScope, SOLD_STATUSES, sumOf, type ScopeOptions } from "./common";

export interface PeriodSales {
  total: string;
  count: number;
  avgTicket: string;
  /** % change against the comparison period; null when there is nothing to compare. */
  changePct: number | null;
  /** Comparison period label, e.g. "ayer". */
  comparedTo: string;
}

export interface DashboardData {
  today: string;
  salesToday: PeriodSales;
  salesMonth: PeriodSales;
  unitsToday: string;
  buyNow: number;
  soon: number;
  inventoryValue: string;
  cash: { open: true; number: string | null; openedBy: string; openedAt: Date } | { open: false };
  topProducts: Array<{ productId: string; name: string; partNumber: string | null; units: string; revenue: string }>;
  /** Last 14 business days, oldest first, zeros filled. */
  byDay: Array<{ day: string; total: string; count: number }>;
  statsComputedAt: Date | null;
}

export interface DashboardOptions extends ScopeOptions {
  today?: string;
  registerId?: string;
}

function period(current: { total: string; count: number }, previous: { total: string; count: number }, comparedTo: string): PeriodSales {
  const total = D(current.total);
  return {
    total: total.toFixed(4),
    count: current.count,
    avgTicket: current.count > 0 ? roundTo(total.div(current.count), 2).toFixed(4) : "0.0000",
    changePct: pctChange(current.total, previous.total),
    comparedTo,
  };
}

/** Everything the home page shows, in a handful of parallel queries. */
export async function getDashboardData(opts: DashboardOptions = {}): Promise<DashboardData> {
  const { dbx, warehouseId, tz } = await resolveScope(opts);
  const today = opts.today ?? businessDate(new Date(), tz);
  const yesterday = addDays(today, -1);
  const monthStart = startOfMonth(today);
  const dayIndex = diffDays(monthStart, today);
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = startOfMonth(lastMonthEnd);
  const lastMonthTo = diffDays(lastMonthStart, lastMonthEnd) >= dayIndex ? addDays(lastMonthStart, dayIndex) : lastMonthEnd;
  const weekStart = addDays(today, -6);
  const chartStart = addDays(today, -13);

  const soldFilter = and(eq(sales.warehouseId, warehouseId), inArray(sales.status, [...SOLD_STATUSES]));
  const between = (from: string, to: string) => and(gte(sales.saleDate, dayStart(from, tz)), lt(sales.saleDate, dayEndExclusive(to, tz)));

  const totals = async (from: string, to: string) => {
    const [row] = await dbx
      .select({ count: count(), total: sumOf(sales.totalUsd) })
      .from(sales)
      .where(and(soldFilter, between(from, to)));
    return { count: row?.count ?? 0, total: row?.total ?? "0" };
  };

  const [
    todayTotals,
    yesterdayTotals,
    monthTotals,
    lastMonthTotals,
    unitsRow,
    statusRows,
    valueRow,
    cashSession,
    topRows,
    dayRows,
    statsComputedAt,
  ] = await Promise.all([
    totals(today, today),
    totals(yesterday, yesterday),
    totals(monthStart, today),
    totals(lastMonthStart, lastMonthTo),
    dbx
      .select({ units: sumOf(netQty) })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(and(soldFilter, between(today, today)))
      .then((r) => r[0]),
    dbx
      .select({ status: productStats.status, count: count() })
      .from(productStats)
      .innerJoin(products, eq(products.id, productStats.productId))
      .where(and(eq(productStats.warehouseId, warehouseId), isNull(products.deletedAt), eq(products.isActive, true)))
      .groupBy(productStats.status),
    dbx
      .select({ value: sumOf(sql`${stockLevels.quantity} * ${products.costAvgUsd}`) })
      .from(stockLevels)
      .innerJoin(products, eq(products.id, stockLevels.productId))
      .where(
        and(eq(stockLevels.warehouseId, warehouseId), sql`${stockLevels.quantity} > 0`, isNull(products.deletedAt), eq(products.isActive, true)),
      )
      .then((r) => r[0]),
    getOpenCashSession(dbx, opts.registerId).catch(() => null),
    dbx
      .select({
        productId: saleItems.productId,
        name: products.name,
        partNumber: products.partNumber,
        units: sumOf(netQty),
        revenue: sumOf(sql`(case when ${saleItems.quantity} = 0 then 0 else ${saleItems.lineTotalUsd} * ${netQty} / ${saleItems.quantity} end)`),
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .innerJoin(products, eq(products.id, saleItems.productId))
      .where(and(soldFilter, between(weekStart, today)))
      .groupBy(saleItems.productId, products.name, products.partNumber)
      .orderBy(desc(sumOf(netQty)))
      .limit(5),
    dbx
      .select({ day: dayExpr(sales.saleDate, tz), total: sumOf(sales.totalUsd), count: count() })
      .from(sales)
      .where(and(soldFilter, between(chartStart, today)))
      .groupBy(dayExpr(sales.saleDate, tz)),
    getStatsComputedAt(dbx),
  ]);

  let openedBy = "";
  if (cashSession) {
    const [u] = await dbx.select({ name: users.name }).from(users).where(eq(users.id, cashSession.openedBy)).limit(1);
    openedBy = u?.name ?? "";
  }

  const byStatus = new Map(statusRows.map((r) => [r.status, r.count]));
  const dayMap = new Map(dayRows.map((r) => [r.day, r]));

  return {
    today,
    salesToday: period(todayTotals, yesterdayTotals, "ayer"),
    salesMonth: period(monthTotals, lastMonthTotals, "mismo período del mes pasado"),
    unitsToday: unitsRow?.units ?? "0",
    buyNow: byStatus.get("buy_now") ?? 0,
    soon: byStatus.get("soon") ?? 0,
    inventoryValue: valueRow?.value ?? "0",
    cash: cashSession
      ? { open: true, number: cashSession.number, openedBy, openedAt: cashSession.openedAt }
      : { open: false },
    topProducts: topRows.map((r) => ({ productId: r.productId, name: r.name, partNumber: r.partNumber, units: r.units, revenue: r.revenue })),
    byDay: eachDay(chartStart, today).map((day) => {
      const r = dayMap.get(day);
      return { day, total: r?.total ?? "0", count: r?.count ?? 0 };
    }),
    statsComputedAt,
  };
}
