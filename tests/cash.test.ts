import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { AppError } from "@/lib/errors";
import { addCashMovement, closeCashSession, openCashSession, reopenCashSession } from "@/modules/cash/application/open-close";
import { getOpenCashSession } from "@/modules/cash/application/session";
import { getSessionSummary } from "@/modules/cash/application/session-summary";
import { getCashSessionDetail, listCashSessions } from "@/modules/cash/infrastructure/queries";
import { createTestDb, uid, type TestDb } from "./db";
import { createTestPaymentMethods, createTestStore, createTestUser, ensureBaseData } from "./fixtures";

const SKIP = Boolean(process.env.SKIP_DB_TESTS);

describe.skipIf(SKIP)("cash sessions", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let admin: typeof s.users.$inferSelect;
  let seller: typeof s.users.$inferSelect;
  let store: Awaited<ReturnType<typeof createTestStore>>;
  let methods: Awaited<ReturnType<typeof createTestPaymentMethods>>;
  let priceListId: string;
  const createdSales: string[] = [];
  const createdSessions: string[] = [];

  beforeAll(async () => {
    ({ db, close } = createTestDb());
    await ensureBaseData(db);
    admin = await createTestUser(db, "admin");
    seller = await createTestUser(db, "seller");
    store = await createTestStore(db);
    methods = await createTestPaymentMethods(db);
    const [list] = await db.select({ id: s.priceLists.id }).from(s.priceLists).where(eq(s.priceLists.code, "PUBLIC"));
    priceListId = list.id;
  });

  afterAll(async () => {
    if (createdSales.length) {
      await db.delete(s.saleReturns).where(inArray(s.saleReturns.saleId, createdSales));
      await db.delete(s.sales).where(inArray(s.sales.id, createdSales));
    }
    if (createdSessions.length) {
      await db.delete(s.cashMovements).where(inArray(s.cashMovements.sessionId, createdSessions));
      await db.delete(s.cashSessions).where(inArray(s.cashSessions.id, createdSessions));
    }
    await db.delete(s.paymentMethods).where(inArray(s.paymentMethods.id, methods.rows.map((m) => m.id)));
    await db.delete(s.cashRegisters).where(eq(s.cashRegisters.id, store.register.id));
    await db.delete(s.warehouses).where(eq(s.warehouses.id, store.warehouse.id));
    await db.delete(s.branches).where(eq(s.branches.id, store.branch.id));
    await close();
  });

  async function insertSale(sessionId: string, opts: { status?: "completed" | "voided"; change?: { currencyCode: string; amount: string } } = {}) {
    const [sale] = await db
      .insert(s.sales)
      .values({
        number: uid("V"),
        branchId: store.branch.id,
        warehouseId: store.warehouse.id,
        cashSessionId: sessionId,
        sellerId: seller.id,
        priceListId,
        status: opts.status ?? "completed",
        // Fixed past date so these fixtures never show up in another test file's "today" totals.
        saleDate: new Date("2020-01-15T15:00:00Z"),
        totalUsd: "45.0000",
        paidUsd: "45.0000",
        changeCurrencyCode: opts.change?.currencyCode ?? null,
        changeAmount: opts.change?.amount ?? "0",
        createdBy: seller.id,
      })
      .returning();
    createdSales.push(sale.id);
    return sale;
  }

  it("opens a session with one balance per cash currency and refuses a second one", async () => {
    const session = await openCashSession(
      { userId: seller.id, registerId: store.register.id, openings: [{ currencyCode: "USD", amount: "50" }, { currencyCode: "COP", amount: "100000" }], notes: "Apertura de prueba" },
      db,
    );
    createdSessions.push(session.id);
    expect(session.number).toMatch(/^J-\d{6}$/);
    expect(session.status).toBe("open");
    expect(session.balances.map((b) => [b.currencyCode, b.openingAmount]).sort()).toEqual([
      ["COP", "100000.0000"],
      ["USD", "50.0000"],
    ]);

    const open = await getOpenCashSession(db, store.register.id);
    expect(open?.id).toBe(session.id);

    await expect(openCashSession({ userId: seller.id, registerId: store.register.id, openings: [] }, db)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("computes the live summary from payments, change, refunds and movements", async () => {
    const session = (await getOpenCashSession(db, store.register.id))!;

    // Sale 1: 20 USD cash + 15 Zelle (reference), change 0.
    const sale1 = await insertSale(session.id);
    await db.insert(s.salePayments).values([
      { saleId: sale1.id, paymentMethodId: methods.cashUsd.id, currencyCode: "USD", amount: "20.0000", exchangeRate: "1", amountUsd: "20.0000" },
      { saleId: sale1.id, paymentMethodId: methods.zelle.id, currencyCode: "USD", amount: "15.0000", exchangeRate: "1", amountUsd: "15.0000", reference: "Z-001" },
    ]);
    // Sale 2: 44 000 COP cash (rate 4000) with 4 000 COP change, plus 3 600 Bs Pago Móvil (rate 36).
    const sale2 = await insertSale(session.id, { change: { currencyCode: "COP", amount: "4000" } });
    await db.insert(s.salePayments).values([
      { saleId: sale2.id, paymentMethodId: methods.cashCop.id, currencyCode: "COP", amount: "44000.0000", exchangeRate: "4000", amountUsd: "11.0000" },
      { saleId: sale2.id, paymentMethodId: methods.pagoMovil.id, currencyCode: "VES", amount: "3600.0000", exchangeRate: "36", amountUsd: "100.0000", reference: "PM-77" },
    ]);
    // Voided sale: must be ignored entirely.
    const voided = await insertSale(session.id, { status: "voided", change: { currencyCode: "USD", amount: "5" } });
    await db.insert(s.salePayments).values({ saleId: voided.id, paymentMethodId: methods.cashUsd.id, currencyCode: "USD", amount: "99.0000", exchangeRate: "1", amountUsd: "99.0000" });

    // Refund 2 USD in cash for sale 1, and a voided return that must be ignored.
    await db.insert(s.saleReturns).values([
      { number: uid("D"), saleId: sale1.id, cashSessionId: session.id, status: "completed", refundMethodId: methods.cashUsd.id, refundCurrencyCode: "USD", refundAmount: "2.0000", refundAmountUsd: "2.0000", totalUsd: "2.0000", createdBy: seller.id },
      { number: uid("D"), saleId: sale1.id, cashSessionId: session.id, status: "voided", refundMethodId: methods.cashUsd.id, refundCurrencyCode: "USD", refundAmount: "7.0000", refundAmountUsd: "7.0000", totalUsd: "7.0000", createdBy: seller.id },
    ]);

    // Movements: +10 USD, −30 USD (authorized by admin), −20 000 COP.
    await addCashMovement({ sessionId: session.id, userId: seller.id, type: "in", currencyCode: "USD", amount: "10", reason: "Sencillo" }, db);
    await addCashMovement({ sessionId: session.id, userId: seller.id, type: "out", currencyCode: "USD", amount: "30", reason: "Pago proveedor", authorizedBy: admin.id }, db);
    await addCashMovement({ sessionId: session.id, userId: admin.id, type: "out", currencyCode: "COP", amount: "20000", reason: "Retiro", authorizedBy: admin.id }, db);

    const summary = await getSessionSummary(session.id, db);
    const usd = summary.balances.find((b) => b.currencyCode === "USD")!;
    const cop = summary.balances.find((b) => b.currencyCode === "COP")!;

    expect(usd.salesCash).toBe("20.0000");
    expect(usd.refundsCash).toBe("2.0000");
    expect(usd.movementsIn).toBe("10.0000");
    expect(usd.movementsOut).toBe("30.0000");
    expect(usd.changeGiven).toBe("0.0000");
    // 50 + 20 − 0 − 2 + 10 − 30
    expect(usd.expected).toBe("48.0000");

    expect(cop.salesCash).toBe("44000.0000");
    expect(cop.changeGiven).toBe("4000.0000");
    expect(cop.movementsOut).toBe("20000.0000");
    // 100000 + 44000 − 4000 − 0 + 0 − 20000
    expect(cop.expected).toBe("120000.0000");

    const byCode = Object.fromEntries(summary.methods.map((m) => [m.code.split("_").slice(0, -1).join("_"), m]));
    expect(byCode.ZELLE.amount).toBe("15.0000");
    expect(byCode.PAGO_MOVIL.amountUsd).toBe("100.0000");
    expect(byCode.CASH_USD.refundsAmount).toBe("2.0000");
    expect(summary.totals.salesCount).toBe(2);
    expect(summary.totals.paymentsUsd).toBe("146.0000");
    expect(summary.totals.refundsUsd).toBe("2.0000");
    expect(summary.totals.netUsd).toBe("144.0000");
    expect(summary.payments.filter((p) => !p.countsInDrawer).map((p) => p.reference).sort()).toEqual(["PM-77", "Z-001"]);
  });

  it("refuses a withdrawal larger than the cash in the drawer", async () => {
    const session = (await getOpenCashSession(db, store.register.id))!;
    await expect(
      addCashMovement({ sessionId: session.id, userId: admin.id, type: "out", currencyCode: "USD", amount: "48.01", reason: "Demasiado", authorizedBy: admin.id }, db),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      addCashMovement({ sessionId: session.id, userId: admin.id, type: "out", currencyCode: "VES", amount: "1", reason: "Sin efectivo Bs" }, db),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("closing requires a justification when the count differs and stores the differences", async () => {
    const session = (await getOpenCashSession(db, store.register.id))!;

    await expect(
      closeCashSession({ sessionId: session.id, userId: seller.id, counts: [{ currencyCode: "USD", counted: "48" }, { currencyCode: "COP", counted: "119000" }] }, db),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(closeCashSession({ sessionId: session.id, userId: seller.id, counts: [{ currencyCode: "USD", counted: "48" }] }, db)).rejects.toMatchObject({ code: "VALIDATION" });

    const closed = await closeCashSession(
      {
        sessionId: session.id,
        userId: seller.id,
        counts: [
          { currencyCode: "USD", counted: "48" },
          { currencyCode: "COP", counted: "119000", justification: "Faltó un billete de 1.000" },
        ],
        denominations: { USD: { "20": 2, "5": 1, "1": 3 } },
        reconciled: { [methods.zelle.id]: true },
        closingNotes: "Cierre de prueba",
      },
      db,
    );
    expect(closed.number).toBe(session.number);

    const detail = (await getCashSessionDetail(session.id, db))!;
    expect(detail.status).toBe("closed");
    expect(detail.closedBy?.id).toBe(seller.id);
    const usd = detail.balances.find((b) => b.currencyCode === "USD")!;
    const cop = detail.balances.find((b) => b.currencyCode === "COP")!;
    expect(usd.expectedAmount).toBe("48.0000");
    expect(usd.countedAmount).toBe("48.0000");
    expect(usd.difference).toBe("0.0000");
    expect(usd.salesCash).toBe("20.0000");
    expect(usd.movementsOut).toBe("30.0000");
    expect(cop.expectedAmount).toBe("120000.0000");
    expect(cop.countedAmount).toBe("119000.0000");
    expect(cop.difference).toBe("-1000.0000");
    expect(cop.justification).toBe("Faltó un billete de 1.000");
    expect(detail.closingSummary?.totals.netUsd).toBe("144.0000");
    expect(detail.closingSummary?.counts.denominations.USD["20"]).toBe(2);
    expect(detail.closingSummary?.counts.reconciled[methods.zelle.id]).toBe(true);
    expect(detail.closingSummary?.references).toHaveLength(2);

    expect(await getOpenCashSession(db, store.register.id)).toBeNull();
    await expect(closeCashSession({ sessionId: session.id, userId: seller.id, counts: [] }, db)).rejects.toMatchObject({ code: "INVALID_STATE" });

    const list = await listCashSessions({ page: 1, pageSize: 10, registerId: store.register.id }, db);
    expect(list.total).toBe(1);
    expect(list.rows[0].differences.find((d) => d.currencyCode === "COP")?.difference).toBe("-1000.0000");
  });

  it("an admin can reopen only the latest closed session, and only when no session is open", async () => {
    const first = (await listCashSessions({ page: 1, pageSize: 1, registerId: store.register.id }, db)).rows[0];

    const reopened = await reopenCashSession({ sessionId: first.id, userId: admin.id }, db);
    expect(reopened.status).toBe("open");
    expect(reopened.closedAt).toBeNull();
    expect(reopened.closingSummary).toBeNull();
    expect((await getOpenCashSession(db, store.register.id))?.id).toBe(first.id);

    // Still consistent: the live summary is the same after reopening.
    const summary = await getSessionSummary(first.id, db);
    expect(summary.balances.find((b) => b.currencyCode === "USD")?.expected).toBe("48.0000");

    await closeCashSession({ sessionId: first.id, userId: admin.id, counts: [{ currencyCode: "USD", counted: "48" }, { currencyCode: "COP", counted: "120000" }] }, db);

    // Open a newer session: the first one can no longer be reopened.
    const second = await openCashSession({ userId: admin.id, registerId: store.register.id, openings: [{ currencyCode: "USD", amount: "0" }] }, db);
    createdSessions.push(second.id);
    await expect(reopenCashSession({ sessionId: first.id, userId: admin.id }, db)).rejects.toMatchObject({ code: "CONFLICT" });
    await closeCashSession({ sessionId: second.id, userId: admin.id, counts: [{ currencyCode: "USD", counted: "0" }, { currencyCode: "COP", counted: "0" }] }, db);
    await expect(reopenCashSession({ sessionId: first.id, userId: admin.id }, db)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(reopenCashSession({ sessionId: first.id, userId: admin.id }, db)).rejects.toBeInstanceOf(AppError);
  });
});
