import { and, asc, desc, eq, gte, inArray, isNull, lt, max, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import {
  inventoryMovements,
  productStats,
  productSuppliers,
  products,
  saleItems,
  sales,
  stockLevels,
  stockSettings,
  suppliers,
  units,
} from "@/db/schema";
import { businessDate, DEFAULT_TZ } from "@/lib/format";
import { D, roundTo, toDb, toMoneyDb, toQtyDb } from "@/lib/money";
import { getDefaultLocation } from "@/modules/core/application/context";
import {
  daysOfCover,
  reorderPoint,
  safetyStock,
  stdDev,
  stockStatus,
  suggestedQty,
  velocity,
  weightedVelocity,
  type AbcClass,
  type StockStatus,
} from "@/modules/inventory/domain/velocity";
import { getSetting } from "@/modules/settings/infrastructure/settings";
import { classifyAbc } from "../domain/abc";
import { addDays, dayEndExclusive, dayStart, diffDays, dayOf } from "../domain/date-range";
import { daysWithStock, type DayMovement, type DaySales } from "../domain/stock-days";
import { dayExpr, netLineTotal, netQty, SOLD_STATUSES } from "../infrastructure/common";

export interface RecomputeOptions {
  /** Database or transaction (tests pass the test database). */
  db?: DbOrTx;
  /** Business day to compute for (`yyyy-MM-dd`); defaults to today in Caracas. */
  today?: string;
  /** Warehouse to compute for; defaults to the store warehouse. */
  warehouseId?: string;
  tz?: string;
}

export interface RecomputeSummary {
  products: number;
  /** Products whose automatic reorder point was written back to stock_settings. */
  autoUpdated: number;
  computedAt: Date;
  durationMs: number;
}

const CHUNK = 200;

function excluded(column: PgColumn) {
  return sql.raw(`excluded."${column.name}"`);
}

/**
 * Recomputes `product_stats` for every active product: velocity per window,
 * demand deviation, days of cover, ABC class, suggested reorder point and
 * quantity, and the traffic-light status. Products in automatic mode that
 * already have enough history also get their reorder point written back.
 *
 * Read-only on sales and kardex; writes only `product_stats` and
 * `stock_settings.reorder_point/reorder_qty` (auto mode).
 */
export async function recomputeProductStats(opts: RecomputeOptions = {}): Promise<RecomputeSummary> {
  const started = Date.now();
  const dbx = opts.db ?? db;
  const tz = opts.tz ?? DEFAULT_TZ;
  const today = opts.today ?? businessDate(new Date(), tz);
  const settings = await getSetting("stats", dbx);
  const warehouseId = opts.warehouseId ?? (await getDefaultLocation(dbx)).warehouseId;

  const windows = settings.windows.length > 0 ? settings.windows : [30, 60, 90];
  const maxWindow = Math.max(...windows);
  const windowStart = (days: number) => addDays(today, -(days - 1));
  const rangeStart = windowStart(maxWindow);
  const startAt = dayStart(rangeStart, tz);
  const endAt = dayEndExclusive(today, tz);

  // --- Reads -------------------------------------------------------------
  const productRows = await dbx
    .select({
      id: products.id,
      unitDecimals: units.decimals,
      quantity: stockLevels.quantity,
      reservedQty: stockLevels.reservedQty,
      minStock: stockSettings.minStock,
      maxStock: stockSettings.maxStock,
      reorderPoint: stockSettings.reorderPoint,
      mode: stockSettings.mode,
    })
    .from(products)
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(stockLevels, and(eq(stockLevels.productId, products.id), eq(stockLevels.warehouseId, warehouseId)))
    .leftJoin(stockSettings, and(eq(stockSettings.productId, products.id), eq(stockSettings.warehouseId, warehouseId)))
    .where(and(isNull(products.deletedAt), eq(products.isActive, true)))
    .orderBy(products.id);

  if (productRows.length === 0) {
    return { products: 0, autoUpdated: 0, computedAt: new Date(), durationMs: Date.now() - started };
  }

  const [beforeRows, moveRows, saleRows, lastSaleRows, firstStockRows, supplierRows] = await Promise.all([
    // Balance right before the widest window, per product.
    dbx
      .selectDistinctOn([inventoryMovements.productId], {
        productId: inventoryMovements.productId,
        day: dayExpr(inventoryMovements.createdAt, tz),
        balanceAfter: inventoryMovements.balanceAfter,
      })
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.warehouseId, warehouseId), lt(inventoryMovements.createdAt, startAt)))
      .orderBy(inventoryMovements.productId, desc(inventoryMovements.createdAt), desc(inventoryMovements.id)),
    // Every movement inside the window, chronological.
    dbx
      .select({
        productId: inventoryMovements.productId,
        day: dayExpr(inventoryMovements.createdAt, tz),
        balanceAfter: inventoryMovements.balanceAfter,
      })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.warehouseId, warehouseId),
          gte(inventoryMovements.createdAt, startAt),
          lt(inventoryMovements.createdAt, endAt),
        ),
      )
      .orderBy(inventoryMovements.productId, asc(inventoryMovements.createdAt), asc(inventoryMovements.id)),
    // Units and revenue per product and business day inside the window.
    dbx
      .select({
        productId: saleItems.productId,
        day: dayExpr(sales.saleDate, tz),
        units: sql<string>`coalesce(sum(${netQty}), 0)`,
        revenue: sql<string>`coalesce(sum(${netLineTotal}), 0)`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(
        and(
          eq(sales.warehouseId, warehouseId),
          inArray(sales.status, [...SOLD_STATUSES]),
          gte(sales.saleDate, startAt),
          lt(sales.saleDate, endAt),
        ),
      )
      .groupBy(saleItems.productId, dayExpr(sales.saleDate, tz)),
    // Last sale ever (not limited to the window).
    dbx
      .select({ productId: saleItems.productId, lastSaleAt: max(sales.saleDate) })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(and(eq(sales.warehouseId, warehouseId), inArray(sales.status, [...SOLD_STATUSES]), lt(sales.saleDate, endAt)))
      .groupBy(saleItems.productId),
    // First inbound movement ever.
    dbx
      .select({
        productId: inventoryMovements.productId,
        firstStockAt: sql<Date | null>`min(${inventoryMovements.createdAt})`.mapWith(inventoryMovements.createdAt),
      })
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.warehouseId, warehouseId), sql`${inventoryMovements.quantity} > 0`, lt(inventoryMovements.createdAt, endAt)))
      .groupBy(inventoryMovements.productId),
    // Preferred supplier first, then the oldest link.
    dbx
      .select({
        productId: productSuppliers.productId,
        leadTimeDays: suppliers.leadTimeDays,
        packSize: productSuppliers.packSize,
      })
      .from(productSuppliers)
      .innerJoin(suppliers, eq(suppliers.id, productSuppliers.supplierId))
      .where(isNull(suppliers.deletedAt))
      .orderBy(productSuppliers.productId, desc(productSuppliers.isPreferred), asc(productSuppliers.createdAt)),
  ]);

  const movesByProduct = new Map<string, DayMovement[]>();
  for (const r of beforeRows) movesByProduct.set(r.productId, [{ day: r.day, balanceAfter: r.balanceAfter }]);
  for (const r of moveRows) {
    const list = movesByProduct.get(r.productId) ?? [];
    list.push({ day: r.day, balanceAfter: r.balanceAfter });
    movesByProduct.set(r.productId, list);
  }
  const salesByProduct = new Map<string, Array<DaySales & { revenue: string }>>();
  for (const r of saleRows) {
    const list = salesByProduct.get(r.productId) ?? [];
    list.push({ day: r.day, units: r.units, revenue: r.revenue });
    salesByProduct.set(r.productId, list);
  }
  const lastSaleByProduct = new Map(lastSaleRows.map((r) => [r.productId, r.lastSaleAt]));
  const firstStockByProduct = new Map(firstStockRows.map((r) => [r.productId, r.firstStockAt]));
  const supplierByProduct = new Map<string, { leadTimeDays: number; packSize: number }>();
  for (const r of supplierRows) {
    if (!supplierByProduct.has(r.productId)) supplierByProduct.set(r.productId, { leadTimeDays: r.leadTimeDays, packSize: r.packSize });
  }

  // --- Compute -------------------------------------------------------------
  interface Computed {
    productId: string;
    unitDecimals: number;
    available: ReturnType<typeof D>;
    windowVelocities: ReturnType<typeof D>[];
    velocity: ReturnType<typeof D>;
    demandStdDev: ReturnType<typeof D>;
    cover: ReturnType<typeof D> | null;
    units90: ReturnType<typeof D>;
    revenue90: ReturnType<typeof D>;
    daysWithSales: number;
    lastSaleAt: Date | null;
    firstStockAt: Date | null;
    hasData: boolean;
    leadTimeDays: number;
    packSize: number;
    minStock: string;
    maxStock: string;
    manualReorderPoint: string;
    mode: "manual" | "auto";
  }

  const computed: Computed[] = productRows.map((p) => {
    const moves = movesByProduct.get(p.id) ?? [];
    const daySales = salesByProduct.get(p.id) ?? [];
    const perWindow = windows.map((w) => daysWithStock(moves, daySales, windowStart(w), today));
    const windowVelocities = perWindow.map((r) => velocity(r.unitsSold, r.daysWithStock));
    const weighted = weightedVelocity(
      perWindow.map((r, i) => ({ days: windows[i], unitsSold: r.unitsSold, daysWithStock: r.daysWithStock })),
      settings.weights,
    );
    const shortest = perWindow[0];
    const widest = perWindow[perWindow.length - 1];
    const available = D(p.quantity ?? 0).minus(D(p.reservedQty ?? 0));
    const revenue90 = daySales.reduce((acc, s) => acc.plus(D(s.revenue)), D(0));
    const daysWithSales = daySales.filter((s) => D(s.units).gt(0)).length;
    const firstStockAt = firstStockByProduct.get(p.id) ?? null;
    const daysSinceFirstStock = firstStockAt ? diffDays(dayOf(firstStockAt, tz), today) + 1 : 0;
    const hasData = daysSinceFirstStock >= settings.minDaysForAuto && widest.unitsSold.gt(0);
    const supplier = supplierByProduct.get(p.id);
    return {
      productId: p.id,
      unitDecimals: p.unitDecimals,
      available,
      windowVelocities,
      velocity: weighted,
      demandStdDev: stdDev(shortest.dailyUnits),
      cover: daysOfCover(available, weighted),
      units90: widest.unitsSold,
      revenue90,
      daysWithSales,
      lastSaleAt: lastSaleByProduct.get(p.id) ?? null,
      firstStockAt,
      hasData,
      leadTimeDays: supplier?.leadTimeDays ?? 7,
      packSize: Math.max(supplier?.packSize ?? 1, 1),
      minStock: p.minStock ?? "0",
      maxStock: p.maxStock ?? "0",
      manualReorderPoint: p.reorderPoint ?? "0",
      mode: p.mode ?? "manual",
    };
  });

  const abc = classifyAbc(computed.map((c) => ({ id: c.productId, revenue: c.revenue90 })));
  const computedAt = new Date();

  const statsRows = computed.map((c) => {
    const abcClass: AbcClass = abc.get(c.productId) ?? "C";
    const serviceLevel = settings.serviceLevels[abcClass];
    const safety = safetyStock(c.demandStdDev, c.leadTimeDays, serviceLevel);
    const suggestedRop = reorderPoint(c.velocity, c.leadTimeDays, safety);
    const suggested = suggestedQty(c.velocity, settings.targetCoverDays, c.available, 0, c.packSize);
    const useAuto = c.hasData && c.mode === "auto";
    const effectiveRop = useAuto ? suggestedRop : D(c.manualReorderPoint).gt(0) ? D(c.manualReorderPoint) : D(c.minStock);
    const status: StockStatus = stockStatus({
      stock: c.available,
      reorderPoint: effectiveRop,
      maxStock: c.maxStock,
      daysOfCover: c.cover,
      hasData: c.hasData,
      soonThresholdDays: settings.soonThresholdDays,
    });
    const [v30, v60, v90] = [c.windowVelocities[0], c.windowVelocities[1], c.windowVelocities[2]];
    return {
      row: {
        productId: c.productId,
        warehouseId,
        velocity30: toDb(v30 ?? 0, 4),
        velocity60: toDb(v60 ?? v30 ?? 0, 4),
        velocity90: toDb(v90 ?? v60 ?? v30 ?? 0, 4),
        velocity: toDb(c.velocity, 4),
        demandStdDev: toDb(c.demandStdDev, 4),
        daysOfCover: c.cover ? toDb(c.cover, 2) : null,
        abcClass,
        revenue90Usd: toMoneyDb(c.revenue90),
        units90: toQtyDb(c.units90),
        daysWithSales: c.daysWithSales,
        lastSaleAt: c.lastSaleAt,
        firstStockAt: c.firstStockAt,
        suggestedReorderPoint: toQtyDb(suggestedRop),
        suggestedQty: toQtyDb(suggested),
        status,
        computedAt,
      },
      writeBack: useAuto
        ? {
            productId: c.productId,
            reorderPoint: toQtyDb(roundTo(suggestedRop, c.unitDecimals)),
            reorderQty: toQtyDb(roundTo(suggested, c.unitDecimals)),
          }
        : null,
    };
  });

  // --- Write -------------------------------------------------------------
  await dbx.transaction(async (tx) => {
    for (let i = 0; i < statsRows.length; i += CHUNK) {
      const chunk = statsRows.slice(i, i + CHUNK).map((s) => s.row);
      await tx
        .insert(productStats)
        .values(chunk)
        .onConflictDoUpdate({
          target: productStats.productId,
          set: {
            warehouseId: excluded(productStats.warehouseId),
            velocity30: excluded(productStats.velocity30),
            velocity60: excluded(productStats.velocity60),
            velocity90: excluded(productStats.velocity90),
            velocity: excluded(productStats.velocity),
            demandStdDev: excluded(productStats.demandStdDev),
            daysOfCover: excluded(productStats.daysOfCover),
            abcClass: excluded(productStats.abcClass),
            revenue90Usd: excluded(productStats.revenue90Usd),
            units90: excluded(productStats.units90),
            daysWithSales: excluded(productStats.daysWithSales),
            lastSaleAt: excluded(productStats.lastSaleAt),
            firstStockAt: excluded(productStats.firstStockAt),
            suggestedReorderPoint: excluded(productStats.suggestedReorderPoint),
            suggestedQty: excluded(productStats.suggestedQty),
            status: excluded(productStats.status),
            computedAt: excluded(productStats.computedAt),
          },
        });
    }
    for (const s of statsRows) {
      if (!s.writeBack) continue;
      await tx
        .update(stockSettings)
        .set({ reorderPoint: s.writeBack.reorderPoint, reorderQty: s.writeBack.reorderQty })
        .where(and(eq(stockSettings.productId, s.writeBack.productId), eq(stockSettings.warehouseId, warehouseId)));
    }
  });

  return {
    products: statsRows.length,
    autoUpdated: statsRows.filter((s) => s.writeBack).length,
    computedAt,
    durationMs: Date.now() - started,
  };
}

/** When the statistics were last computed (null before the first run). */
export async function getStatsComputedAt(dbx: DbOrTx = db): Promise<Date | null> {
  const [row] = await dbx.select({ at: max(productStats.computedAt) }).from(productStats);
  return row?.at ?? null;
}
