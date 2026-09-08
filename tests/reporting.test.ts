import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { businessDate } from "@/lib/format";
import { recomputeProductStats } from "@/modules/reporting/application/product-stats";
import { addDays, dayStart, diffDays, startOfMonth } from "@/modules/reporting/domain/date-range";
import { getDashboardData } from "@/modules/reporting/infrastructure/dashboard";
import { getMarginReport } from "@/modules/reporting/infrastructure/margin-report";
import { getNoMovementReport } from "@/modules/reporting/infrastructure/no-movement-report";
import { getSalesReport } from "@/modules/reporting/infrastructure/sales-report";
import { getVelocityReport } from "@/modules/reporting/infrastructure/velocity-report";
import { getInventoryValuation } from "@/modules/reporting/infrastructure/inventory-report";
import { createTestDb, uid, type TestDb } from "./db";

/**
 * Integration tests for Paquete E. They build their own fixtures in an
 * inactive warehouse (so `getDefaultLocation()` never picks it) and clean up
 * everything except kardex rows (append-only) and the rows they reference,
 * which are soft-deleted or deactivated instead.
 */
const skip = Boolean(process.env.SKIP_DB_TESTS);

describe.skipIf(skip)("reporting: product stats, dashboard and reports", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  const today = businessDate();
  const ids = {
    branch: "",
    warehouse: "",
    unit: "",
    tax: "",
    priceList: "",
    user: "",
    category: "",
    productA: "",
    productB: "",
    register: "",
    sales: [] as string[],
  };

  /** Instant at `hour`:`minute` of a business day. */
  const at = (day: string, hour: number, minute = 0) => new Date(dayStart(day).getTime() + (hour * 60 + minute) * 60_000);

  beforeAll(async () => {
    const t = createTestDb();
    db = t.db;
    close = t.close;

    const [branch] = await db.insert(s.branches).values({ name: "Sucursal prueba", code: uid("BR") }).returning();
    const [warehouse] = await db
      .insert(s.warehouses)
      .values({ branchId: branch.id, name: "Almacén prueba", code: uid("WH"), isActive: false })
      .returning();
    const [unit] = await db.insert(s.units).values({ name: uid("Unidad"), symbol: "u", decimals: 0 }).returning();
    const [tax] = await db.insert(s.taxes).values({ name: uid("Exento"), rate: "0.0000" }).returning();
    const [priceList] = await db.insert(s.priceLists).values({ code: uid("PL"), name: "Lista prueba" }).returning();
    const [user] = await db
      .insert(s.users)
      .values({ name: "Vendedor prueba", email: `${uid("u")}@test.local`, passwordHash: "x", role: "seller" })
      .returning();
    const [category] = await db.insert(s.categories).values({ name: "Categoría prueba", slug: uid("cat") }).returning();
    // Inactive on purpose: `getDefaultCashRegister()` only picks active registers, so sessions other test
    // files open in parallel never leak into this file's dashboard assertions (and vice versa).
    const [register] = await db.insert(s.cashRegisters).values({ branchId: branch.id, name: uid("Caja"), isActive: false }).returning();
    const [productA] = await db
      .insert(s.products)
      .values({ sku: uid("SKU"), name: "Compresor prueba A", partNumber: "PN-A", unitId: unit.id, taxId: tax.id, costAvgUsd: "4.0000", categoryId: category.id })
      .returning();
    const [productB] = await db
      .insert(s.products)
      .values({ sku: uid("SKU"), name: "Termostato prueba B", unitId: unit.id, taxId: tax.id, costAvgUsd: "2.5000", categoryId: category.id })
      .returning();

    Object.assign(ids, {
      branch: branch.id,
      warehouse: warehouse.id,
      unit: unit.id,
      tax: tax.id,
      priceList: priceList.id,
      user: user.id,
      category: category.id,
      productA: productA.id,
      productB: productB.id,
      register: register.id,
    });

    // Stock: A had 100 forty days ago and sold 2 a day for the last 30 days (40 left); B has 10 and never sold.
    await db.insert(s.stockLevels).values([
      { productId: productA.id, warehouseId: warehouse.id, quantity: "40.000" },
      { productId: productB.id, warehouseId: warehouse.id, quantity: "10.000" },
    ]);
    const firstStockDay = addDays(today, -40);
    await db.insert(s.inventoryMovements).values([
      { productId: productA.id, warehouseId: warehouse.id, type: "initial", quantity: "100.000", unitCostUsd: "4.0000", totalCostUsd: "400.0000", balanceAfter: "100.000", createdAt: at(firstStockDay, 9) },
      { productId: productB.id, warehouseId: warehouse.id, type: "initial", quantity: "10.000", unitCostUsd: "2.5000", totalCostUsd: "25.0000", balanceAfter: "10.000", createdAt: at(firstStockDay, 9) },
    ]);

    let balance = 100;
    for (let i = 29; i >= 0; i--) {
      const day = addDays(today, -i);
      const when = at(day, 10, 29 - i);
      balance -= 2;
      const [sale] = await db
        .insert(s.sales)
        .values({
          number: uid("V"),
          branchId: branch.id,
          warehouseId: warehouse.id,
          sellerId: user.id,
          priceListId: priceList.id,
          status: "completed",
          saleDate: when,
          subtotalUsd: "20.0000",
          totalUsd: "20.0000",
          paidUsd: "20.0000",
          createdBy: user.id,
        })
        .returning();
      ids.sales.push(sale.id);
      await db.insert(s.saleItems).values({
        saleId: sale.id,
        productId: productA.id,
        description: "Compresor prueba A",
        quantity: "2.000",
        unitPriceUsd: "10.0000",
        unitCostUsd: "4.0000",
        lineTotalUsd: "20.0000",
      });
      await db.insert(s.inventoryMovements).values({
        productId: productA.id,
        warehouseId: warehouse.id,
        type: "sale_out",
        quantity: "-2.000",
        unitCostUsd: "4.0000",
        totalCostUsd: "8.0000",
        balanceAfter: `${balance}.000`,
        referenceType: "sale",
        referenceId: sale.id,
        createdAt: when,
      });
    }
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    const productIds = [ids.productA, ids.productB].filter(Boolean);
    if (ids.sales.length) await db.delete(s.sales).where(inArray(s.sales.id, ids.sales));
    if (productIds.length) {
      await db.delete(s.productStats).where(inArray(s.productStats.productId, productIds));
      await db.delete(s.stockSettings).where(inArray(s.stockSettings.productId, productIds));
      await db.delete(s.stockLevels).where(inArray(s.stockLevels.productId, productIds));
      // Kardex rows are append-only, so the products they reference can only be soft-deleted.
      await db.update(s.products).set({ isActive: false, deletedAt: new Date() }).where(inArray(s.products.id, productIds));
    }
    if (ids.register) {
      await db.delete(s.cashSessions).where(eq(s.cashSessions.registerId, ids.register));
      await db.delete(s.cashRegisters).where(eq(s.cashRegisters.id, ids.register));
    }
    if (ids.priceList) await db.delete(s.priceLists).where(eq(s.priceLists.id, ids.priceList));
    if (ids.user) await db.delete(s.users).where(eq(s.users.id, ids.user));
    if (ids.category) await db.update(s.categories).set({ isActive: false }).where(eq(s.categories.id, ids.category));
    await close();
  });

  it("computes velocity, ABC, status and suggestions from kardex and sales", async () => {
    const summary = await recomputeProductStats({ db, today, warehouseId: ids.warehouse });
    expect(summary.products).toBeGreaterThanOrEqual(2);
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);

    const [a] = await db.select().from(s.productStats).where(eq(s.productStats.productId, ids.productA));
    expect(a).toBeDefined();
    // 60 units over 30 days with stock
    expect(a.velocity30).toBe("2.0000");
    // 60 units over the 41 days since the first stock (60- and 90-day windows)
    expect(a.velocity60).toBe("1.4634");
    expect(a.velocity90).toBe("1.4634");
    // 2×0.5 + 1.4634×0.3 + 1.4634×0.2
    expect(a.velocity).toBe("1.7317");
    expect(a.demandStdDev).toBe("0.0000");
    expect(a.units90).toBe("60.000");
    expect(a.revenue90Usd).toBe("600.0000");
    expect(a.daysWithSales).toBe(30);
    expect(a.abcClass).toBe("A");
    expect(a.daysOfCover).toBe("23.10"); // 40 / 1.7317
    expect(a.lastSaleAt?.getTime()).toBe(at(today, 10, 29).getTime());
    expect(a.firstStockAt?.getTime()).toBe(at(addDays(today, -40), 9).getTime());
    // velocity × lead time 7 + safety stock 0 (constant demand)
    expect(a.suggestedReorderPoint).toBe("12.122");
    // 30 days of cover = 51.95 − 40 available → 12 (pack of 1)
    expect(a.suggestedQty).toBe("12.000");
    expect(Number(a.suggestedQty)).toBeGreaterThan(0);
    // 40 available > reorder point, cover 23 days > 7: OK
    expect(a.status).toBe("ok");
    expect(a.warehouseId).toBe(ids.warehouse);

    const [b] = await db.select().from(s.productStats).where(eq(s.productStats.productId, ids.productB));
    expect(b.velocity).toBe("0.0000");
    expect(b.units90).toBe("0.000");
    expect(b.abcClass).toBe("C");
    expect(b.daysOfCover).toBeNull();
    expect(b.lastSaleAt).toBeNull();
    expect(b.suggestedQty).toBe("0.000");
    // No sales and no manual minimums: nothing to say yet
    expect(b.status).toBe("no_data");
  });

  it("writes the reorder point back only for products in automatic mode with history", async () => {
    await db.insert(s.stockSettings).values([
      { productId: ids.productA, warehouseId: ids.warehouse, mode: "auto", minStock: "5.000", reorderPoint: "1.000", reorderQty: "1.000" },
      { productId: ids.productB, warehouseId: ids.warehouse, mode: "manual", minStock: "20.000" },
    ]);
    const summary = await recomputeProductStats({ db, today, warehouseId: ids.warehouse });
    expect(summary.autoUpdated).toBeGreaterThanOrEqual(1);

    const [a] = await db
      .select()
      .from(s.stockSettings)
      .where(and(eq(s.stockSettings.productId, ids.productA), eq(s.stockSettings.warehouseId, ids.warehouse)));
    // Rounded to the unit decimals (0)
    expect(a.reorderPoint).toBe("12.000");
    expect(a.reorderQty).toBe("12.000");

    // B is manual: keeps its values and, with 10 in stock under a minimum of 20, must be bought now.
    const [b] = await db
      .select()
      .from(s.stockSettings)
      .where(and(eq(s.stockSettings.productId, ids.productB), eq(s.stockSettings.warehouseId, ids.warehouse)));
    expect(b.reorderPoint).toBe("0.000");
    const [bStats] = await db.select().from(s.productStats).where(eq(s.productStats.productId, ids.productB));
    expect(bStats.status).toBe("buy_now");
  });

  it("dashboard totals match the inserted sales", async () => {
    const data = await getDashboardData({ db, warehouseId: ids.warehouse, today, registerId: ids.register });
    expect(data.salesToday.count).toBe(1);
    expect(Number(data.salesToday.total)).toBe(20);
    expect(Number(data.salesToday.avgTicket)).toBe(20);
    expect(data.salesToday.changePct).toBe(0); // yesterday also sold 20
    expect(Number(data.unitsToday)).toBe(2);

    const daysThisMonth = diffDays(startOfMonth(today), today) + 1;
    const expectedCount = Math.min(30, daysThisMonth);
    expect(data.salesMonth.count).toBe(expectedCount);
    expect(Number(data.salesMonth.total)).toBe(20 * expectedCount);

    expect(data.buyNow).toBe(1); // product B (manual minimum)
    expect(Number(data.inventoryValue)).toBe(40 * 4 + 10 * 2.5);
    expect(data.cash.open).toBe(false);
    expect(data.byDay).toHaveLength(14);
    expect(data.byDay.every((d) => Number(d.total) === 20 && d.count === 1)).toBe(true);
    expect(data.topProducts[0]?.productId).toBe(ids.productA);
    expect(Number(data.topProducts[0]?.units)).toBe(14); // 7 days × 2
    expect(data.statsComputedAt).toBeInstanceOf(Date);

    // With a session open on this register the card shows who opened it.
    const [session] = await db
      .insert(s.cashSessions)
      .values({ number: uid("J"), registerId: ids.register, status: "open", openedBy: ids.user })
      .returning();
    const withCash = await getDashboardData({ db, warehouseId: ids.warehouse, today, registerId: ids.register });
    expect(withCash.cash).toMatchObject({ open: true, number: session.number, openedBy: "Vendedor prueba" });
    await db.delete(s.cashSessions).where(eq(s.cashSessions.id, session.id));
  });

  it("sales, margin, inventory, velocity and no-movement reports agree with the fixtures", async () => {
    const range = { from: addDays(today, -29), to: today, preset: "last_30" as const };
    const sales = await getSalesReport(range, { db, warehouseId: ids.warehouse });
    expect(sales.totals.count).toBe(30);
    expect(Number(sales.totals.total)).toBe(600);
    expect(Number(sales.totals.units)).toBe(60);
    expect(sales.previousTotals.count).toBe(0);
    expect(sales.byDay).toHaveLength(30);
    expect(sales.byProduct[0]?.productId).toBe(ids.productA);
    expect(sales.byProduct[0]?.share).toBe(100);
    expect(sales.byCategory[0]?.name).toBe("Categoría prueba");
    expect(sales.bySeller[0]?.count).toBe(30);
    expect(sales.byHour).toEqual([{ hour: 10, count: 30, total: "600.0000" }]);
    expect(sales.voided.count).toBe(0);

    const margin = await getMarginReport(range, { db, warehouseId: ids.warehouse });
    expect(Number(margin.totals.revenue)).toBe(600);
    expect(Number(margin.totals.cost)).toBe(240);
    expect(Number(margin.totals.margin)).toBe(360);
    expect(margin.totals.marginPct).toBe(60);
    expect(margin.byProduct[0]?.id).toBe(ids.productA);

    const inventory = await getInventoryValuation({ db, warehouseId: ids.warehouse, limit: 50 });
    expect(Number(inventory.totalValue)).toBe(185);
    expect(inventory.withStock).toBe(2);
    expect(inventory.rows[0]?.productId).toBe(ids.productA); // 160 > 25
    expect(inventory.byCategory[0]?.share).toBe(100);

    const velocity = await getVelocityReport({ db, warehouseId: ids.warehouse, categoryId: ids.category, sort: "velocity" });
    expect(velocity.total).toBe(2);
    expect(velocity.rows[0]?.productId).toBe(ids.productA);
    expect(velocity.rows[0]?.status).toBe("ok");
    expect(velocity.rows[0]?.mode).toBe("auto");
    expect(velocity.rows[1]?.status).toBe("buy_now");
    expect(velocity.computedAt).toBeInstanceOf(Date);

    const filtered = await getVelocityReport({ db, warehouseId: ids.warehouse, categoryId: ids.category, status: "buy_now" });
    expect(filtered.rows.map((r) => r.productId)).toEqual([ids.productB]);

    const idle = await getNoMovementReport({ db, warehouseId: ids.warehouse, days: 30, today });
    const idleIds = idle.rows.map((r) => r.productId);
    expect(idleIds).toContain(ids.productB);
    expect(idleIds).not.toContain(ids.productA);
    const b = idle.rows.find((r) => r.productId === ids.productB)!;
    expect(Number(b.value)).toBe(25);
    expect(b.lastSaleAt).toBeNull();
    expect(b.idleDays).toBe(40);
  });
});
