import { compare, hash } from "bcryptjs";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { users, type UserRole } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/modules/core/application/audit";
import { isTrivialPin, lockMessage, PIN_REQUESTER_POLICY, PIN_TARGET_POLICY, type ThrottlePolicy } from "../domain/throttle";
import { clearAttempts, reserveAttempt } from "./throttle";

export const PIN_REGEX = /^\d{4,6}$/;

export interface PinUser {
  id: string;
  name: string;
  role: UserRole;
}

/** Active users that have a PIN set (for the "cambiar vendedor" dialog). */
export async function listPinUsers(dbx: DbOrTx = db): Promise<PinUser[]> {
  return dbx
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(eq(users.isActive, true), isNotNull(users.pinHash)))
    .orderBy(users.name);
}

async function reserveOrThrow(key: string, policy: ThrottlePolicy, dbx: DbOrTx) {
  const lockedUntil = await reserveAttempt(key, policy, dbx);
  if (lockedUntil) throw new AppError("FORBIDDEN", lockMessage(lockedUntil));
}

/*
 * Throttle keys. Guesses are counted per (person typing, PIN owner), so typing
 * your own PIN right never resets the count of guesses at someone else's, and
 * per PIN owner, so several accounts cannot share the guessing.
 */
const requesterKey = (requesterId: string, target: string) => `pin:${requesterId}>${target}`;
const targetKey = (userId: string) => `pin-target:${userId}`;

/**
 * Verify `userId`'s PIN as typed by `requesterId` (the signed-in user). The
 * attempt is counted before the check, so parallel guesses are throttled too;
 * failures go to the audit log. Throws when the attempts are locked.
 */
export async function verifyUserPin(userId: string, pin: string, requesterId: string, dbx: DbOrTx = db): Promise<boolean> {
  await reserveOrThrow(requesterKey(requesterId, userId), PIN_REQUESTER_POLICY, dbx);
  await reserveOrThrow(targetKey(userId), PIN_TARGET_POLICY, dbx);

  const [user] = await dbx.select({ isActive: users.isActive, pinHash: users.pinHash }).from(users).where(eq(users.id, userId)).limit(1);
  const ok = Boolean(user?.isActive && user.pinHash && PIN_REGEX.test(pin) && (await compare(pin, user.pinHash)));
  if (ok) {
    await clearAttempts(requesterKey(requesterId, userId), dbx);
    await clearAttempts(targetKey(userId), dbx);
    return true;
  }
  await writeAudit(dbx, { userId: requesterId, action: "pin.failed", entityType: "user", entityId: userId });
  return false;
}

/** Find an active admin whose PIN matches (supervisor authorization for discounts). */
export async function authorizeSupervisor(pin: string, requesterId: string, dbx: DbOrTx = db): Promise<PinUser | null> {
  const key = requesterKey(requesterId, "supervisor");
  await reserveOrThrow(key, PIN_REQUESTER_POLICY, dbx);
  const admins = PIN_REGEX.test(pin)
    ? await dbx
        .select({ id: users.id, name: users.name, role: users.role, pinHash: users.pinHash })
        .from(users)
        .where(and(eq(users.isActive, true), eq(users.role, "admin"), isNotNull(users.pinHash)))
    : [];
  for (const admin of admins) {
    if (await compare(pin, admin.pinHash!)) {
      await clearAttempts(key, dbx);
      return { id: admin.id, name: admin.name, role: admin.role };
    }
  }
  await writeAudit(dbx, { userId: requesterId, action: "pin.failed", entityType: "user", entityId: null, after: { target: "supervisor" } });
  return null;
}

export async function setUserPin(userId: string, pin: string, dbx: DbOrTx = db): Promise<void> {
  if (!PIN_REGEX.test(pin)) throw new AppError("VALIDATION", "El PIN debe tener entre 4 y 6 dígitos.");
  if (isTrivialPin(pin)) throw new AppError("VALIDATION", "Ese PIN es muy fácil de adivinar (como 1234 o 0000). Elige otro.");
  await dbx
    .update(users)
    .set({ pinHash: await hash(pin, 10), pinFailedAttempts: 0, pinLockedUntil: null })
    .where(eq(users.id, userId));
  await clearAttempts(targetKey(userId), dbx);
}
