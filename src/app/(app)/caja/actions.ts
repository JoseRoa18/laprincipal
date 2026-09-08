"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/lib/action";
import { assertRole } from "@/lib/auth-guards";
import { AppError } from "@/lib/errors";
import { verifyUserPin } from "@/modules/auth/application/pin";
import { getUserById } from "@/modules/auth/infrastructure/users";
import { addCashMovement, closeCashSession, openCashSession, reopenCashSession } from "@/modules/cash/application/open-close";
import { getOpenCashSession } from "@/modules/cash/application/session";
import { closeSessionSchema, movementSchema, openSessionSchema, toAmount } from "@/modules/cash/domain/forms";

function revalidateCash(sessionId?: string) {
  revalidatePath("/caja");
  revalidatePath("/caja/cerrar");
  revalidatePath("/caja/historial");
  if (sessionId) revalidatePath(`/caja/historial/${sessionId}`);
  revalidatePath("/inicio");
}

export async function openCashSessionAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "seller");
    const data = parseInput(openSessionSchema, input);
    const session = await openCashSession({
      userId: user.id,
      openings: data.openings.map((o) => ({ currencyCode: o.currencyCode, amount: toAmount(o.amount) })),
      notes: data.notes ?? null,
    });
    revalidateCash(session.id);
    return { id: session.id, number: session.number };
  });
}

export async function addCashMovementAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "seller");
    const data = parseInput(movementSchema, input);
    const session = await getOpenCashSession();
    if (!session) throw new AppError("CASH_SESSION_REQUIRED", "No hay una caja abierta.");

    let authorizedBy: string | null = user.role === "admin" ? user.id : null;
    if (data.type === "out" && user.role !== "admin") {
      if (!data.adminId || !data.pin) {
        throw new AppError("FORBIDDEN", "Un administrador debe autorizar el retiro con su PIN.", { fields: { pin: "PIN requerido" } });
      }
      const admin = await getUserById(data.adminId);
      if (!admin || admin.role !== "admin" || !admin.isActive) throw new AppError("FORBIDDEN", "El usuario elegido no es un administrador activo.");
      const ok = await verifyUserPin(admin.id, data.pin);
      if (!ok) throw new AppError("FORBIDDEN", "PIN incorrecto.", { fields: { pin: "PIN incorrecto" } });
      authorizedBy = admin.id;
    }

    const row = await addCashMovement({
      sessionId: session.id,
      userId: user.id,
      type: data.type,
      currencyCode: data.currencyCode,
      amount: toAmount(data.amount),
      reason: data.reason,
      authorizedBy,
    });
    revalidateCash(session.id);
    return { id: row.id };
  });
}

export async function closeCashSessionAction(input: unknown) {
  return runAction(async () => {
    const user = await assertRole("admin", "seller");
    const data = parseInput(closeSessionSchema, input);
    const session = await getOpenCashSession();
    if (!session) throw new AppError("CASH_SESSION_REQUIRED", "No hay una caja abierta.");

    const closed = await closeCashSession({
      sessionId: session.id,
      userId: user.id,
      counts: data.counts.map((c) => ({ currencyCode: c.currencyCode, counted: toAmount(c.counted), justification: c.justification ?? null })),
      denominations: data.denominations,
      reconciled: data.reconciled,
      closingNotes: data.closingNotes ?? null,
    });
    revalidateCash(closed.id);
    return { id: closed.id, number: closed.number };
  });
}

export async function reopenCashSessionAction(sessionId: string) {
  return runAction(async () => {
    const user = await assertRole("admin");
    const id = parseInput(z.string().uuid("Sesión inválida"), sessionId);
    const session = await reopenCashSession({ sessionId: id, userId: user.id });
    revalidateCash(session.id);
    return { id: session.id };
  });
}
