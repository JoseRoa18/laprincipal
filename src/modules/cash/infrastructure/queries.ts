import { and, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { cashMovements, cashSessionBalances, cashSessions, currencies, paymentMethods, users } from "@/db/schema";
import type { ClosingSummary } from "../domain/summary";

export interface CashCurrency {
  code: string;
  symbol: string;
  decimals: number;
  cashRounding: string;
}

/** Currencies that physically live in the drawer: those with an active method that counts in the drawer. */
export async function listCashCurrencies(dbx: DbOrTx = db): Promise<CashCurrency[]> {
  const rows = await dbx
    .selectDistinct({
      code: currencies.code,
      symbol: currencies.symbol,
      decimals: currencies.decimals,
      cashRounding: currencies.cashRounding,
      sortOrder: currencies.sortOrder,
    })
    .from(paymentMethods)
    .innerJoin(currencies, eq(currencies.code, paymentMethods.currencyCode))
    .where(and(eq(paymentMethods.isActive, true), eq(paymentMethods.countsInDrawer, true), eq(currencies.isActive, true)))
    .orderBy(currencies.sortOrder);
  return rows.map((c) => ({ code: c.code, symbol: c.symbol, decimals: c.decimals, cashRounding: c.cashRounding }));
}

export async function listPaymentMethods(dbx: DbOrTx = db, opts: { activeOnly?: boolean } = {}) {
  const where = opts.activeOnly ? eq(paymentMethods.isActive, true) : undefined;
  return dbx.select().from(paymentMethods).where(where).orderBy(paymentMethods.sortOrder, paymentMethods.name);
}

/** Active admins with a PIN, for authorizing withdrawals made by sellers. */
export async function listAuthorizingAdmins(dbx: DbOrTx = db) {
  return dbx
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.role, "admin"), isNotNull(users.pinHash)))
    .orderBy(users.name);
}

export interface SessionListRow {
  id: string;
  number: string | null;
  status: "open" | "closed";
  openedAt: Date;
  openedByName: string;
  closedAt: Date | null;
  closedByName: string | null;
  differences: Array<{ currencyCode: string; difference: string | null; counted: string | null; expected: string | null }>;
}

export async function listCashSessions(
  opts: { page: number; pageSize: number; registerId?: string },
  dbx: DbOrTx = db,
): Promise<{ rows: SessionListRow[]; total: number }> {
  const openedBy = alias(users, "opened_by_user");
  const closedBy = alias(users, "closed_by_user");
  const where = opts.registerId ? eq(cashSessions.registerId, opts.registerId) : undefined;

  const [{ total }] = await dbx.select({ total: count() }).from(cashSessions).where(where);
  const sessions = await dbx
    .select({
      id: cashSessions.id,
      number: cashSessions.number,
      status: cashSessions.status,
      openedAt: cashSessions.openedAt,
      openedByName: openedBy.name,
      closedAt: cashSessions.closedAt,
      closedByName: closedBy.name,
    })
    .from(cashSessions)
    .innerJoin(openedBy, eq(openedBy.id, cashSessions.openedBy))
    .leftJoin(closedBy, eq(closedBy.id, cashSessions.closedBy))
    .where(where)
    .orderBy(desc(cashSessions.openedAt))
    .limit(opts.pageSize)
    .offset((opts.page - 1) * opts.pageSize);

  const ids = sessions.map((s) => s.id);
  const balances = ids.length
    ? await dbx
        .select({
          sessionId: cashSessionBalances.sessionId,
          currencyCode: cashSessionBalances.currencyCode,
          difference: cashSessionBalances.difference,
          counted: cashSessionBalances.countedAmount,
          expected: cashSessionBalances.expectedAmount,
        })
        .from(cashSessionBalances)
        .where(inArray(cashSessionBalances.sessionId, ids))
        .orderBy(cashSessionBalances.currencyCode)
    : [];

  return {
    total,
    rows: sessions.map((s) => ({
      ...s,
      differences: balances
        .filter((b) => b.sessionId === s.id)
        .map((b) => ({ currencyCode: b.currencyCode, difference: b.difference, counted: b.counted, expected: b.expected })),
    })),
  };
}

export interface SessionDetail {
  id: string;
  number: string | null;
  registerId: string;
  status: "open" | "closed";
  openedAt: Date;
  openedBy: { id: string; name: string };
  closedAt: Date | null;
  closedBy: { id: string; name: string } | null;
  notes: string | null;
  closingNotes: string | null;
  closingSummary: ClosingSummary | null;
  balances: Array<typeof cashSessionBalances.$inferSelect & { symbol: string; decimals: number }>;
  movements: MovementView[];
}

export interface MovementView {
  id: string;
  type: "in" | "out";
  currencyCode: string;
  amount: string;
  reason: string;
  createdAt: Date;
  createdByName: string;
  authorizedByName: string | null;
}

export async function listSessionMovements(sessionId: string, dbx: DbOrTx = db): Promise<MovementView[]> {
  const createdBy = alias(users, "movement_created_by");
  const authorizedBy = alias(users, "movement_authorized_by");
  return dbx
    .select({
      id: cashMovements.id,
      type: cashMovements.type,
      currencyCode: cashMovements.currencyCode,
      amount: cashMovements.amount,
      reason: cashMovements.reason,
      createdAt: cashMovements.createdAt,
      createdByName: createdBy.name,
      authorizedByName: authorizedBy.name,
    })
    .from(cashMovements)
    .innerJoin(createdBy, eq(createdBy.id, cashMovements.createdBy))
    .leftJoin(authorizedBy, eq(authorizedBy.id, cashMovements.authorizedBy))
    .where(eq(cashMovements.sessionId, sessionId))
    .orderBy(desc(cashMovements.createdAt));
}

export async function getCashSessionDetail(id: string, dbx: DbOrTx = db): Promise<SessionDetail | null> {
  const openedBy = alias(users, "opened_by_user");
  const closedBy = alias(users, "closed_by_user");
  const [row] = await dbx
    .select({
      id: cashSessions.id,
      number: cashSessions.number,
      registerId: cashSessions.registerId,
      status: cashSessions.status,
      openedAt: cashSessions.openedAt,
      openedById: openedBy.id,
      openedByName: openedBy.name,
      closedAt: cashSessions.closedAt,
      closedById: closedBy.id,
      closedByName: closedBy.name,
      notes: cashSessions.notes,
      closingNotes: cashSessions.closingNotes,
      closingSummary: cashSessions.closingSummary,
    })
    .from(cashSessions)
    .innerJoin(openedBy, eq(openedBy.id, cashSessions.openedBy))
    .leftJoin(closedBy, eq(closedBy.id, cashSessions.closedBy))
    .where(eq(cashSessions.id, id))
    .limit(1);
  if (!row) return null;

  const balances = await dbx
    .select({ balance: cashSessionBalances, symbol: currencies.symbol, decimals: currencies.decimals })
    .from(cashSessionBalances)
    .innerJoin(currencies, eq(currencies.code, cashSessionBalances.currencyCode))
    .where(eq(cashSessionBalances.sessionId, id))
    .orderBy(currencies.sortOrder);

  const movements = await listSessionMovements(id, dbx);

  return {
    id: row.id,
    number: row.number,
    registerId: row.registerId,
    status: row.status,
    openedAt: row.openedAt,
    openedBy: { id: row.openedById, name: row.openedByName },
    closedAt: row.closedAt,
    closedBy: row.closedById && row.closedByName ? { id: row.closedById, name: row.closedByName } : null,
    notes: row.notes,
    closingNotes: row.closingNotes,
    closingSummary: (row.closingSummary as ClosingSummary | null) ?? null,
    balances: balances.map((b) => ({ ...b.balance, symbol: b.symbol, decimals: b.decimals })),
    movements,
  };
}

/** Most recently opened session of a register, open or closed. */
export async function getLatestSession(registerId: string, dbx: DbOrTx = db) {
  const [row] = await dbx
    .select()
    .from(cashSessions)
    .where(eq(cashSessions.registerId, registerId))
    .orderBy(desc(cashSessions.openedAt))
    .limit(1);
  return row ?? null;
}
