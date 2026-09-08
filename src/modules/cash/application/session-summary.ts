import { and, asc, eq, gt, ne } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { cashMovements, cashSessionBalances, cashSessions, currencies, paymentMethods, saleReturns, salePayments, sales } from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  summarizeSession,
  type CurrencyBalance,
  type MethodTotal,
  type PaymentInput,
  type RefundInput,
  type SessionTotals,
} from "../domain/summary";
import { getCashSessionDetail, type SessionDetail } from "../infrastructure/queries";

export interface PaymentView extends PaymentInput {
  createdAt: Date;
}

export interface RefundView extends RefundInput {
  createdAt: Date;
}

export interface SessionSummary {
  session: SessionDetail;
  /** Cash currencies of this session, in display order. */
  currencies: Array<{ code: string; symbol: string; decimals: number }>;
  balances: CurrencyBalance[];
  methods: MethodTotal[];
  totals: SessionTotals;
  /** Every payment of the session (cash and electronic) with its reference. */
  payments: PaymentView[];
  refunds: RefundView[];
}

/**
 * Live totals of a session computed from sales, payments, returns and
 * movements linked to it. Works for open and closed sessions (for closed
 * ones the persisted `closing_summary` is the official record).
 */
export async function getSessionSummary(sessionId: string, dbx: DbOrTx = db): Promise<SessionSummary> {
  const session = await getCashSessionDetail(sessionId, dbx);
  if (!session) throw new AppError("NOT_FOUND", "La sesión de caja no existe.");

  const [payments, changes, refunds, movements] = await Promise.all([
    dbx
      .select({
        paymentMethodId: salePayments.paymentMethodId,
        methodCode: paymentMethods.code,
        methodName: paymentMethods.name,
        methodKind: paymentMethods.kind,
        countsInDrawer: paymentMethods.countsInDrawer,
        currencyCode: salePayments.currencyCode,
        amount: salePayments.amount,
        amountUsd: salePayments.amountUsd,
        reference: salePayments.reference,
        saleId: sales.id,
        saleNumber: sales.number,
        createdAt: salePayments.createdAt,
      })
      .from(salePayments)
      .innerJoin(sales, eq(sales.id, salePayments.saleId))
      .innerJoin(paymentMethods, eq(paymentMethods.id, salePayments.paymentMethodId))
      .where(and(eq(sales.cashSessionId, sessionId), ne(sales.status, "voided")))
      .orderBy(asc(salePayments.createdAt)),
    dbx
      .select({ currencyCode: sales.changeCurrencyCode, amount: sales.changeAmount })
      .from(sales)
      .where(and(eq(sales.cashSessionId, sessionId), ne(sales.status, "voided"), gt(sales.changeAmount, "0"))),
    dbx
      .select({
        refundMethodId: saleReturns.refundMethodId,
        methodCode: paymentMethods.code,
        methodName: paymentMethods.name,
        countsInDrawer: paymentMethods.countsInDrawer,
        currencyCode: saleReturns.refundCurrencyCode,
        amount: saleReturns.refundAmount,
        amountUsd: saleReturns.refundAmountUsd,
        returnId: saleReturns.id,
        returnNumber: saleReturns.number,
        createdAt: saleReturns.createdAt,
      })
      .from(saleReturns)
      .leftJoin(paymentMethods, eq(paymentMethods.id, saleReturns.refundMethodId))
      .where(and(eq(saleReturns.cashSessionId, sessionId), eq(saleReturns.status, "completed")))
      .orderBy(asc(saleReturns.createdAt)),
    dbx
      .select({ type: cashMovements.type, currencyCode: cashMovements.currencyCode, amount: cashMovements.amount })
      .from(cashMovements)
      .where(eq(cashMovements.sessionId, sessionId)),
  ]);

  const refundRows: RefundView[] = refunds.map((r) => ({ ...r, countsInDrawer: r.countsInDrawer ?? false }));

  const computed = summarizeSession({
    openings: session.balances.map((b) => ({ currencyCode: b.currencyCode, openingAmount: b.openingAmount })),
    payments,
    changes,
    refunds: refundRows,
    movements,
  });

  return {
    session,
    currencies: session.balances.map((b) => ({ code: b.currencyCode, symbol: b.symbol, decimals: b.decimals })),
    balances: computed.balances,
    methods: computed.methods,
    totals: computed.totals,
    payments,
    refunds: refundRows,
  };
}

/** Expected cash right now for one currency of an open session (used to validate withdrawals). */
export async function getExpectedCash(sessionId: string, currencyCode: string, dbx: DbOrTx = db): Promise<string> {
  const summary = await getSessionSummary(sessionId, dbx);
  const balance = summary.balances.find((b) => b.currencyCode === currencyCode);
  if (!balance) throw new AppError("VALIDATION", `La caja no maneja efectivo en ${currencyCode}.`);
  return balance.expected;
}

/** Session balances with the currency metadata, for forms. */
export async function listSessionCurrencies(sessionId: string, dbx: DbOrTx = db) {
  return dbx
    .select({ code: currencies.code, symbol: currencies.symbol, decimals: currencies.decimals, openingAmount: cashSessionBalances.openingAmount })
    .from(cashSessionBalances)
    .innerJoin(currencies, eq(currencies.code, cashSessionBalances.currencyCode))
    .innerJoin(cashSessions, eq(cashSessions.id, cashSessionBalances.sessionId))
    .where(eq(cashSessionBalances.sessionId, sessionId))
    .orderBy(currencies.sortOrder);
}
