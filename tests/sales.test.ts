import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogs,
  branches,
  cashRegisters,
  cashSessions,
  currencies,
  documentSeries,
  inventoryMovements,
  paymentMethods,
  priceListItems,
  priceLists,
  products,
  quotes,
  saleItems,
  salePayments,
  saleReturns,
  sales,
  stockLevels,
  taxes,
  units,
  users,
  warehouses,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { businessDate } from "@/lib/format";
import { D } from "@/lib/money";
import { upsertRate } from "@/modules/currency/infrastructure/rates";
import { applyMovement } from "@/modules/inventory/application/stock";
import { completeSale, type SaleContext } from "@/modules/sales/application/complete-sale";
import { holdSale } from "@/modules/sales/application/hold-sale";
import { createQuote } from "@/modules/sales/application/quotes";
import { createReturn } from "@/modules/sales/application/return-sale";
import { completeSaleSchema, createQuoteSchema, createReturnSchema, holdSaleSchema } from "@/modules/sales/application/schemas";
import { voidSale } from "@/modules/sales/application/void-sale";
import { createTestDb, uid, type TestDb } from "./db";

const SKIP = Boolean(process.env.SKIP_DB_TESTS);

describe.skipIf(SKIP)("sales: complete, void, return, quotes", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let ctx: SaleContext;
  let warehouseId: string;
  let branchId: string;
  let registerId: string;
  let adminId: string;
  let unitId: string;
  let taxId: string;
  let publicListId: string;
  let cashUsdId: string;
  let cashCopId: string;
  let pagoMovilId: string;

  async function makeProduct(opts: { price: string; stock: string; cost?: string }) {
    const sku = uid("SKU").toUpperCase();
    const [p] = await db
      .insert(products)
      .values({ sku, name: `Repuesto ${sku}`, unitId, taxId, costAvgUsd: opts.cost ?? "0", searchText: sku.toLowerCase() })
      .returning();
    await db.insert(priceListItems).values({ priceListId: publicListId, productId: p.id, priceUsd: opts.price });
    if (D(opts.stock).gt(0)) {
      await db.transaction((tx) =>
        applyMovement(tx, { productId: p.id, warehouseId, type: "initial", quantity: opts.stock, unitCostUsd: opts.cost ?? "0", userId: adminId }),
      );
    }
    return p;
  }

  async function stockOf(productId: string) {
    const [row] = await db.select().from(stockLevels).where(and(eq(stockLevels.productId, productId), eq(stockLevels.warehouseId, warehouseId)));
    return { quantity: D(row?.quantity ?? 0), reserved: D(row?.reservedQty ?? 0) };
  }

  beforeAll(async () => {
    ({ db, close } = createTestDb());
    await db
      .insert(currencies)
      .values([
        { code: "USD", name: "Dólar", symbol: "$", decimals: 2, cashRounding: "0.01", isBase: true, sortOrder: 1 },
        { code: "VES", name: "Bolívar", symbol: "Bs", decimals: 2, cashRounding: "0.01", isBase: false, sortOrder: 2 },
        { code: "COP", name: "Peso colombiano", symbol: "COP", decimals: 0, cashRounding: "100", isBase: false, sortOrder: 3 },
      ])
      .onConflictDoNothing();
    const [branch] = await db.insert(branches).values({ name: "Sucursal test", code: uid("B") }).returning();
    branchId = branch.id;
    const [wh] = await db.insert(warehouses).values({ branchId, name: "Almacén test", code: uid("W") }).returning();
    warehouseId = wh.id;
    const [admin] = await db
      .insert(users)
      .values({ name: "Admin ventas", email: `${uid("admin")}@test.local`, passwordHash: "x", role: "admin" })
      .returning();
    adminId = admin.id;
    const [tax] = await db.insert(taxes).values({ name: uid("IVA"), rate: "0.1600" }).returning();
    taxId = tax.id;
    const [unit] = await db.insert(units).values({ name: uid("Unidad"), symbol: "u", decimals: 0 }).returning();
    unitId = unit.id;
    await db
      .insert(priceLists)
      .values([
        { code: "PUBLIC", name: "Público", isDefault: true },
        { code: "TECH", name: "Técnico", isDefault: false },
      ])
      .onConflictDoNothing();
    const [pub] = await db.select().from(priceLists).where(eq(priceLists.code, "PUBLIC"));
    publicListId = pub.id;
    await db
      .insert(documentSeries)
      .values([
        { documentType: "sale", prefix: "V-" },
        { documentType: "quote", prefix: "C-" },
        { documentType: "return", prefix: "D-" },
      ])
      .onConflictDoNothing();
    await db
      .insert(paymentMethods)
      .values([
        { code: "CASH_USD", name: "Efectivo USD", kind: "cash", currencyCode: "USD", countsInDrawer: true, allowsChange: true, sortOrder: 1 },
        { code: "CASH_COP", name: "Efectivo COP", kind: "cash", currencyCode: "COP", countsInDrawer: true, allowsChange: true, sortOrder: 2 },
        { code: "PAGO_MOVIL", name: "Pago Móvil", kind: "mobile_payment", currencyCode: "VES", requiresReference: true, sortOrder: 6 },
      ])
      .onConflictDoNothing();
    const methods = await db.select().from(paymentMethods);
    cashUsdId = methods.find((m) => m.code === "CASH_USD")!.id;
    cashCopId = methods.find((m) => m.code === "CASH_COP")!.id;
    pagoMovilId = methods.find((m) => m.code === "PAGO_MOVIL")!.id;
    const today = businessDate();
    await upsertRate({ currencyCode: "VES", rate: "36.500000", effectiveDate: today, userId: adminId }, db);
    await upsertRate({ currencyCode: "COP", rate: "4100.000000", effectiveDate: today, userId: adminId }, db);
    // Inactive so getDefaultCashRegister() (used by other suites) never picks this register.
    const [register] = await db.insert(cashRegisters).values({ branchId, name: uid("Caja"), isActive: false }).returning();
    registerId = register.id;
    await db.insert(cashSessions).values({ registerId, status: "open", openedBy: adminId });

    ctx = { userId: adminId, sellerId: adminId, role: "admin", warehouseId, branchId, cashRegisterId: registerId };
  });

  afterAll(async () => {
    if (!db) return;
    const mine = await db.select({ id: sales.id }).from(sales).where(eq(sales.createdBy, adminId));
    for (const s of mine) await db.delete(saleReturns).where(eq(saleReturns.saleId, s.id));
    await db.delete(sales).where(eq(sales.createdBy, adminId));
    await db.delete(quotes).where(eq(quotes.createdBy, adminId));
    await db.delete(cashSessions).where(eq(cashSessions.registerId, registerId));
    await db.delete(cashRegisters).where(eq(cashRegisters.id, registerId));
    await close();
  });

  it("completes a sale with mixed payments, moves stock, writes kardex and numbers consecutively", async () => {
    const product = await makeProduct({ price: "11.60", stock: "5", cost: "7" });
    const input = completeSaleSchema.parse({
      lines: [{ productId: product.id, quantity: "2" }],
      payments: [
        { paymentMethodId: cashUsdId, amount: "10" },
        { paymentMethodId: pagoMovilId, amount: "481.80", reference: "0001234" }, // 13.20 USD at 36.5
      ],
    });
    const first = await completeSale(db, input, ctx);
    expect(first.number).toMatch(/^V-\d{6}$/);
    expect(first.totalUsd).toBe("23.20");
    expect(first.changeUsd).toBe("0.00");

    const [sale] = await db.select().from(sales).where(eq(sales.id, first.saleId));
    expect(sale.status).toBe("completed");
    expect(D(sale.taxUsd).toFixed(2)).toBe("3.20");
    expect(D(sale.paidUsd).toFixed(2)).toBe("23.20");
    expect(D(sale.rateVes).toFixed(2)).toBe("36.50");
    expect(sale.sellerId).toBe(adminId);
    expect(sale.cashSessionId).not.toBeNull();

    const items = await db.select().from(saleItems).where(eq(saleItems.saleId, first.saleId));
    expect(items).toHaveLength(1);
    expect(D(items[0].unitCostUsd).toFixed(2)).toBe("7.00");
    expect(D(items[0].lineTotalUsd).toFixed(2)).toBe("23.20");

    const payments = await db.select().from(salePayments).where(eq(salePayments.saleId, first.saleId));
    const ves = payments.find((p) => p.currencyCode === "VES")!;
    expect(D(ves.amountUsd).toFixed(4)).toBe("13.2000");
    expect(D(ves.exchangeRate).toFixed(2)).toBe("36.50");
    expect(ves.reference).toBe("0001234");
    const usd = payments.find((p) => p.currencyCode === "USD")!;
    expect(D(usd.amountUsd).toFixed(2)).toBe("10.00");

    expect((await stockOf(product.id)).quantity.toFixed(3)).toBe("3.000");
    const [mv] = await db
      .select()
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.referenceId, first.saleId), eq(inventoryMovements.type, "sale_out")));
    expect(D(mv.quantity).toFixed(3)).toBe("-2.000");
    expect(D(mv.balanceAfter).toFixed(3)).toBe("3.000");
    expect(D(mv.unitCostUsd).toFixed(2)).toBe("7.00");
    expect(mv.referenceType).toBe("sale");

    const second = await completeSale(db, completeSaleSchema.parse({ lines: [{ productId: product.id, quantity: "1" }], payments: [{ paymentMethodId: cashUsdId, amount: "11.60" }] }), ctx);
    expect(Number(second.number.replace("V-", ""))).toBe(Number(first.number.replace("V-", "")) + 1);
  });

  it("computes change in COP rounded to 100 when overpaid", async () => {
    const product = await makeProduct({ price: "7.50", stock: "2" });
    const res = await completeSale(
      db,
      completeSaleSchema.parse({ lines: [{ productId: product.id, quantity: "1" }], payments: [{ paymentMethodId: cashUsdId, amount: "10" }], changeCurrencyCode: "COP" }),
      ctx,
    );
    expect(res.changeUsd).toBe("2.50");
    expect(res.changeCurrencyCode).toBe("COP");
    expect(res.changeAmount).toBe("10300");
  });

  it("rejects a sale that is not fully paid", async () => {
    const product = await makeProduct({ price: "20", stock: "2" });
    await expect(
      completeSale(db, completeSaleSchema.parse({ lines: [{ productId: product.id, quantity: "1" }], payments: [{ paymentMethodId: cashUsdId, amount: "5" }] }), ctx),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await stockOf(product.id)).quantity.toFixed(0)).toBe("2");
  });

  it("rejects insufficient stock with the available quantity", async () => {
    const product = await makeProduct({ price: "5", stock: "1" });
    let error: unknown;
    try {
      await completeSale(db, completeSaleSchema.parse({ lines: [{ productId: product.id, quantity: "2" }], payments: [{ paymentMethodId: cashUsdId, amount: "10" }] }), ctx);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("INSUFFICIENT_STOCK");
    expect((error as AppError).details?.available).toBe("1");
    expect((error as AppError).details?.productName).toBe(product.name);
  });

  it("lets only one of two concurrent sales take the last unit", async () => {
    const product = await makeProduct({ price: "9", stock: "1" });
    const a = createTestDb();
    const b = createTestDb();
    try {
      const input = completeSaleSchema.parse({ lines: [{ productId: product.id, quantity: "1" }], payments: [{ paymentMethodId: cashUsdId, amount: "9" }] });
      const results = await Promise.allSettled([completeSale(a.db, input, ctx), completeSale(b.db, input, ctx)]);
      const ok = results.filter((r) => r.status === "fulfilled");
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect((failed[0].reason as AppError).code).toBe("INSUFFICIENT_STOCK");
      expect((await stockOf(product.id)).quantity.toFixed(0)).toBe("0");
      const outs = await db
        .select()
        .from(inventoryMovements)
        .where(and(eq(inventoryMovements.productId, product.id), eq(inventoryMovements.type, "sale_out")));
      expect(outs).toHaveLength(1);
    } finally {
      await a.close();
      await b.close();
    }
  });

  it("requires a supervisor for discounts over the role limit and records who authorized", async () => {
    const product = await makeProduct({ price: "100", stock: "5" });
    const sellerCtx: SaleContext = { ...ctx, role: "seller" };
    const input = completeSaleSchema.parse({
      lines: [{ productId: product.id, quantity: "1", discountType: "pct", discountValue: "25" }],
      payments: [{ paymentMethodId: cashUsdId, amount: "75" }],
    });
    await expect(completeSale(db, input, sellerCtx)).rejects.toMatchObject({ code: "FORBIDDEN", details: { reason: "discount_limit" } });
    const res = await completeSale(db, input, { ...sellerCtx, supervisorId: adminId });
    const [item] = await db.select().from(saleItems).where(eq(saleItems.saleId, res.saleId));
    expect(item.discountAuthorizedBy).toBe(adminId);
    expect(D(item.discountUsd).toFixed(2)).toBe("25.00");
    expect(res.totalUsd).toBe("75.00");
  });

  it("voids a sale and restores stock", async () => {
    const product = await makeProduct({ price: "4", stock: "5", cost: "2" });
    const sale = await completeSale(db, completeSaleSchema.parse({ lines: [{ productId: product.id, quantity: "2" }], payments: [{ paymentMethodId: cashUsdId, amount: "8" }] }), ctx);
    expect((await stockOf(product.id)).quantity.toFixed(0)).toBe("3");

    await expect(voidSale(db, { saleId: sale.saleId, reason: "Prueba" }, { userId: adminId, role: "seller" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await voidSale(db, { saleId: sale.saleId, reason: "Cliente se arrepintió" }, { userId: adminId, role: "admin" });

    const [row] = await db.select().from(sales).where(eq(sales.id, sale.saleId));
    expect(row.status).toBe("voided");
    expect(row.voidReason).toBe("Cliente se arrepintió");
    expect(row.voidedBy).toBe(adminId);
    expect((await stockOf(product.id)).quantity.toFixed(0)).toBe("5");
    const [mv] = await db
      .select()
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.referenceId, sale.saleId), eq(inventoryMovements.type, "sale_void_in")));
    expect(D(mv.quantity).toFixed(0)).toBe("2");
    expect(D(mv.balanceAfter).toFixed(0)).toBe("5");
    expect(D(mv.unitCostUsd).toFixed(2)).toBe("2.00");
    const audits = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, sale.saleId), eq(auditLogs.action, "sale.void")));
    expect(audits).toHaveLength(1);
    await expect(voidSale(db, { saleId: sale.saleId, reason: "otra vez" }, { userId: adminId, role: "admin" })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("registers a partial return with restock and refund in COP, then a full one", async () => {
    const product = await makeProduct({ price: "10", stock: "5", cost: "6" });
    const sale = await completeSale(db, completeSaleSchema.parse({ lines: [{ productId: product.id, quantity: "3" }], payments: [{ paymentMethodId: cashUsdId, amount: "30" }] }), ctx);
    const [item] = await db.select().from(saleItems).where(eq(saleItems.saleId, sale.saleId));

    const partial = await createReturn(
      db,
      createReturnSchema.parse({ saleId: sale.saleId, items: [{ saleItemId: item.id, quantity: "1" }], restock: true, refundMethodId: cashCopId, reasonText: "Pieza equivocada" }),
      { userId: adminId, role: "seller", cashRegisterId: registerId },
    );
    expect(partial.number).toMatch(/^D-\d{6}$/);
    expect(partial.totalUsd).toBe("10.00");
    expect(partial.refundCurrencyCode).toBe("COP");
    expect(partial.refundAmount).toBe("41000");
    expect(partial.saleStatus).toBe("partially_refunded");
    const [afterPartial] = await db.select().from(saleItems).where(eq(saleItems.id, item.id));
    expect(D(afterPartial.returnedQty).toFixed(0)).toBe("1");
    expect((await stockOf(product.id)).quantity.toFixed(0)).toBe("3");
    const [mv] = await db
      .select()
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.referenceId, partial.returnId), eq(inventoryMovements.type, "return_in")));
    expect(D(mv.unitCostUsd).toFixed(2)).toBe("6.00");

    await expect(
      createReturn(db, createReturnSchema.parse({ saleId: sale.saleId, items: [{ saleItemId: item.id, quantity: "5" }], restock: true }), { userId: adminId, role: "admin", cashRegisterId: registerId }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const full = await createReturn(
      db,
      createReturnSchema.parse({ saleId: sale.saleId, items: [{ saleItemId: item.id, quantity: "2" }], restock: false, refundMethodId: cashUsdId }),
      { userId: adminId, role: "admin", cashRegisterId: registerId },
    );
    expect(full.saleStatus).toBe("refunded");
    expect(full.refundAmount).toBe("20");
    expect((await stockOf(product.id)).quantity.toFixed(0)).toBe("3");
    const [row] = await db.select().from(sales).where(eq(sales.id, sale.saleId));
    expect(row.status).toBe("refunded");
  });

  it("holds a sale without number or stock movement and replaces it when completed", async () => {
    const product = await makeProduct({ price: "3", stock: "4" });
    const held = await holdSale(
      db,
      holdSaleSchema.parse({ label: "Cliente de la gorra azul", lines: [{ productId: product.id, quantity: "2" }], globalDiscount: { type: "pct", value: "10" } }),
      ctx,
    );
    const [row] = await db.select().from(sales).where(eq(sales.id, held.saleId));
    expect(row.status).toBe("held");
    expect(row.number).toBeNull();
    expect(row.holdLabel).toBe("Cliente de la gorra azul");
    expect(D(row.totalUsd).toFixed(2)).toBe("5.40");
    expect((await stockOf(product.id)).quantity.toFixed(0)).toBe("4");
    const [heldItem] = await db.select().from(saleItems).where(eq(saleItems.saleId, held.saleId));
    expect(heldItem.discountType).toBe("amount");
    expect(D(heldItem.discountValue).toFixed(2)).toBe("0.60");

    const done = await completeSale(
      db,
      completeSaleSchema.parse({
        heldSaleId: held.saleId,
        lines: [{ productId: product.id, quantity: "2", discountType: "amount", discountValue: "0.60" }],
        payments: [{ paymentMethodId: cashUsdId, amount: "5.40" }],
      }),
      ctx,
    );
    expect(done.totalUsd).toBe("5.40");
    const gone = await db.select().from(sales).where(eq(sales.id, held.saleId));
    expect(gone).toHaveLength(0);
  });

  it("creates a quote that reserves stock and converts it keeping the quoted price", async () => {
    const product = await makeProduct({ price: "50", stock: "3" });
    const quote = await createQuote(
      db,
      createQuoteSchema.parse({ lines: [{ productId: product.id, quantity: "2" }], reserveStock: true, notes: "Entrega el viernes" }),
      ctx,
    );
    expect(quote.number).toMatch(/^C-\d{6}$/);
    expect((await stockOf(product.id)).reserved.toFixed(0)).toBe("2");

    // Price changes after quoting; the sale keeps the quoted price.
    await db.update(priceListItems).set({ priceUsd: "60" }).where(and(eq(priceListItems.productId, product.id), eq(priceListItems.priceListId, publicListId)));

    // Only one unit is available for other customers while the quote reserves two.
    await expect(
      completeSale(db, completeSaleSchema.parse({ lines: [{ productId: product.id, quantity: "2" }], payments: [{ paymentMethodId: cashUsdId, amount: "120" }] }), ctx),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    const sale = await completeSale(
      db,
      completeSaleSchema.parse({ quoteId: quote.quoteId, lines: [{ productId: product.id, quantity: "2" }], payments: [{ paymentMethodId: cashUsdId, amount: "100" }] }),
      ctx,
    );
    expect(sale.totalUsd).toBe("100.00");
    const [q] = await db.select().from(quotes).where(eq(quotes.id, quote.quoteId));
    expect(q.status).toBe("converted");
    const stock = await stockOf(product.id);
    expect(stock.reserved.toFixed(0)).toBe("0");
    expect(stock.quantity.toFixed(0)).toBe("1");
    const [row] = await db.select().from(sales).where(eq(sales.id, sale.saleId));
    expect(row.quoteId).toBe(quote.quoteId);
  });
});
