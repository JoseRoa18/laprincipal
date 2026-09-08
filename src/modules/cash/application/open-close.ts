import { and, eq, gt } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import { cashMovements, cashSessionBalances, cashSessions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { D, toMoneyDb } from "@/lib/money";
import { writeAudit } from "@/modules/core/application/audit";
import { getDefaultCashRegister } from "@/modules/core/application/context";
import { isUniqueViolation } from "@/modules/core/application/db-errors";
import { nextDocumentNumber } from "@/modules/core/application/numbering";
import { computeDifference, type ClosingSummary } from "../domain/summary";
import { listCashCurrencies } from "../infrastructure/queries";
import { getOpenCashSession } from "./session";
import { getSessionSummary } from "./session-summary";

async function lockSession(tx: Tx, sessionId: string) {
  const [session] = await tx.select().from(cashSessions).where(eq(cashSessions.id, sessionId)).for("update");
  if (!session) throw new AppError("NOT_FOUND", "La sesión de caja no existe.");
  return session;
}

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

export interface OpenSessionInput {
  userId: string;
  /** Opening cash per currency. Missing cash currencies open with 0. */
  openings: Array<{ currencyCode: string; amount: string }>;
  notes?: string | null;
  registerId?: string;
}

export async function openCashSession(input: OpenSessionInput, dbx: Db = db) {
  return dbx.transaction(async (tx) => {
    const registerId = input.registerId ?? (await getDefaultCashRegister(tx)).id;
    const existing = await getOpenCashSession(tx, registerId);
    if (existing) throw new AppError("CONFLICT", `Ya hay una caja abierta (${existing.number ?? "sin número"}). Ciérrala antes de abrir otra.`);

    const cashCurrencies = await listCashCurrencies(tx);
    if (cashCurrencies.length === 0) {
      throw new AppError("INVALID_STATE", "No hay métodos de pago en efectivo activos. Configura los métodos de pago primero.");
    }
    for (const o of input.openings) {
      if (!cashCurrencies.some((c) => c.code === o.currencyCode)) {
        throw new AppError("VALIDATION", `La moneda ${o.currencyCode} no se maneja en efectivo.`);
      }
      if (D(o.amount).lt(0)) throw new AppError("VALIDATION", "El fondo inicial no puede ser negativo.");
    }

    const number = await nextDocumentNumber(tx, "cash_session");
    let session: typeof cashSessions.$inferSelect;
    try {
      [session] = await tx
        .insert(cashSessions)
        .values({ number, registerId, status: "open", openedBy: input.userId, openedAt: new Date(), notes: input.notes?.trim() || null })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError("CONFLICT", "Ya hay una caja abierta. Actualiza la pantalla.");
      throw err;
    }

    const balances = await tx
      .insert(cashSessionBalances)
      .values(
        cashCurrencies.map((c) => ({
          sessionId: session.id,
          currencyCode: c.code,
          openingAmount: toMoneyDb(input.openings.find((o) => o.currencyCode === c.code)?.amount ?? 0),
        })),
      )
      .returning();

    await writeAudit(tx, {
      userId: input.userId,
      action: "cash_session.open",
      entityType: "cash_session",
      entityId: session.id,
      after: { number, openings: balances.map((b) => ({ currencyCode: b.currencyCode, openingAmount: b.openingAmount })), notes: session.notes },
    });

    return { ...session, balances };
  });
}

// ---------------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------------

export interface MovementInput {
  sessionId: string;
  userId: string;
  type: "in" | "out";
  currencyCode: string;
  amount: string;
  reason: string;
  /** Admin that authorized a withdrawal (self for admins). */
  authorizedBy?: string | null;
}

export async function addCashMovement(input: MovementInput, dbx: Db = db) {
  return dbx.transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    if (session.status !== "open") throw new AppError("INVALID_STATE", "La caja ya está cerrada.");

    const amount = D(input.amount);
    if (!amount.isFinite() || amount.lte(0)) throw new AppError("VALIDATION", "El monto debe ser mayor que cero.");

    const [balance] = await tx
      .select({ id: cashSessionBalances.id })
      .from(cashSessionBalances)
      .where(and(eq(cashSessionBalances.sessionId, session.id), eq(cashSessionBalances.currencyCode, input.currencyCode)))
      .limit(1);
    if (!balance) throw new AppError("VALIDATION", `Esta caja no maneja efectivo en ${input.currencyCode}.`);

    if (input.type === "out") {
      const summary = await getSessionSummary(session.id, tx);
      const expected = summary.balances.find((b) => b.currencyCode === input.currencyCode)?.expected ?? "0";
      if (amount.gt(expected)) {
        throw new AppError(
          "VALIDATION",
          `No hay suficiente efectivo en ${input.currencyCode}: en caja hay ${formatMoney(expected, input.currencyCode)}.`,
        );
      }
    }

    const [row] = await tx
      .insert(cashMovements)
      .values({
        sessionId: session.id,
        type: input.type,
        currencyCode: input.currencyCode,
        amount: toMoneyDb(amount),
        reason: input.reason.trim(),
        authorizedBy: input.authorizedBy ?? null,
        createdBy: input.userId,
      })
      .returning();

    await writeAudit(tx, {
      userId: input.userId,
      action: input.type === "in" ? "cash_movement.in" : "cash_movement.out",
      entityType: "cash_movement",
      entityId: row.id,
      after: { sessionNumber: session.number, ...row },
    });

    return row;
  });
}

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

export interface CloseSessionInput {
  sessionId: string;
  userId: string;
  counts: Array<{ currencyCode: string; counted: string; justification?: string | null }>;
  /** currency -> bill -> count, from the counting helper (informative). */
  denominations?: Record<string, Record<string, number>>;
  /** payment method id -> reconciled checkbox (informative). */
  reconciled?: Record<string, boolean>;
  closingNotes?: string | null;
}

export async function closeCashSession(input: CloseSessionInput, dbx: Db = db) {
  return dbx.transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    if (session.status !== "open") throw new AppError("INVALID_STATE", "Esta caja ya fue cerrada.");

    const summary = await getSessionSummary(session.id, tx);
    const closedAt = new Date();

    const balances: ClosingSummary["balances"] = [];
    for (const b of summary.balances) {
      const count = input.counts.find((c) => c.currencyCode === b.currencyCode);
      if (!count) throw new AppError("VALIDATION", `Falta el conteo de efectivo en ${b.currencyCode}.`);
      const counted = D(count.counted);
      if (!counted.isFinite() || counted.lt(0)) throw new AppError("VALIDATION", `El conteo en ${b.currencyCode} no es válido.`);
      const difference = computeDifference(b.expected, counted);
      const justification = count.justification?.trim() || null;
      if (!D(difference).isZero() && !justification) {
        throw new AppError("VALIDATION", `Hay una diferencia de ${formatMoney(difference, b.currencyCode)} en ${b.currencyCode}. Escribe una justificación.`, {
          fields: { [`justification.${b.currencyCode}`]: "Justifica la diferencia" },
        });
      }
      balances.push({ ...b, counted: toMoneyDb(counted), difference, justification });

      await tx
        .update(cashSessionBalances)
        .set({
          salesCash: b.salesCash,
          changeGiven: b.changeGiven,
          refundsCash: b.refundsCash,
          movementsIn: b.movementsIn,
          movementsOut: b.movementsOut,
          expectedAmount: b.expected,
          countedAmount: toMoneyDb(counted),
          difference,
          justification,
        })
        .where(and(eq(cashSessionBalances.sessionId, session.id), eq(cashSessionBalances.currencyCode, b.currencyCode)));
    }

    const closingSummary: ClosingSummary = {
      version: 1,
      closedAt: closedAt.toISOString(),
      balances,
      methods: summary.methods,
      totals: summary.totals,
      counts: { denominations: input.denominations ?? {}, reconciled: input.reconciled ?? {} },
      references: summary.payments
        .filter((p) => !p.countsInDrawer)
        .map((p) => ({
          paymentMethodId: p.paymentMethodId,
          methodName: p.methodName,
          currencyCode: p.currencyCode,
          amount: toMoneyDb(p.amount),
          amountUsd: toMoneyDb(p.amountUsd),
          reference: p.reference ?? null,
          saleNumber: p.saleNumber ?? null,
          at: p.createdAt ? new Date(p.createdAt).toISOString() : null,
        })),
    };

    const [closed] = await tx
      .update(cashSessions)
      .set({
        status: "closed",
        closedBy: input.userId,
        closedAt,
        closingSummary,
        closingNotes: input.closingNotes?.trim() || null,
      })
      .where(eq(cashSessions.id, session.id))
      .returning();

    await writeAudit(tx, {
      userId: input.userId,
      action: "cash_session.close",
      entityType: "cash_session",
      entityId: session.id,
      before: { status: "open" },
      after: { number: session.number, balances, totals: summary.totals },
    });

    return { id: closed.id, number: closed.number, balances };
  });
}

// ---------------------------------------------------------------------------
// Reopen (admin): only the latest session of the register, and only when
// no other session is open.
// ---------------------------------------------------------------------------

export async function reopenCashSession(input: { sessionId: string; userId: string }, dbx: Db = db) {
  return dbx.transaction(async (tx) => {
    const session = await lockSession(tx, input.sessionId);
    if (session.status !== "closed") throw new AppError("INVALID_STATE", "La sesión ya está abierta.");

    const open = await getOpenCashSession(tx, session.registerId);
    if (open) throw new AppError("CONFLICT", `Ya hay una caja abierta (${open.number ?? ""}). No se puede reabrir otra.`);

    const [newer] = await tx
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(and(eq(cashSessions.registerId, session.registerId), gt(cashSessions.openedAt, session.openedAt)))
      .limit(1);
    if (newer) throw new AppError("INVALID_STATE", "Solo se puede reabrir la última sesión de caja.");

    await tx
      .update(cashSessionBalances)
      .set({ expectedAmount: null, countedAmount: null, difference: null, justification: null })
      .where(eq(cashSessionBalances.sessionId, session.id));

    const [reopened] = await tx
      .update(cashSessions)
      .set({ status: "open", closedBy: null, closedAt: null, closingSummary: null, closingNotes: null })
      .where(eq(cashSessions.id, session.id))
      .returning();

    await writeAudit(tx, {
      userId: input.userId,
      action: "cash_session.reopen",
      entityType: "cash_session",
      entityId: session.id,
      before: { status: "closed", closedAt: session.closedAt, closedBy: session.closedBy, closingSummary: session.closingSummary, closingNotes: session.closingNotes },
      after: { status: "open", number: reopened.number },
    });

    return reopened;
  });
}
