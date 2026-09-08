import { compare, hash } from "bcryptjs";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { users, type UserRole } from "@/db/schema";
import { AppError } from "@/lib/errors";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

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

/**
 * Verify a user's PIN with lockout after repeated failures.
 * Returns true on success; false on mismatch; throws when locked.
 */
export async function verifyUserPin(userId: string, pin: string, dbx: DbOrTx = db): Promise<boolean> {
  const [user] = await dbx.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isActive || !user.pinHash) return false;

  if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
    const minutes = Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 60_000);
    throw new AppError("FORBIDDEN", `PIN bloqueado por intentos fallidos. Intenta en ${minutes} min.`);
  }

  const ok = PIN_REGEX.test(pin) && (await compare(pin, user.pinHash));
  if (ok) {
    if (user.pinFailedAttempts > 0 || user.pinLockedUntil) {
      await dbx.update(users).set({ pinFailedAttempts: 0, pinLockedUntil: null }).where(eq(users.id, userId));
    }
    return true;
  }

  const attempts = user.pinFailedAttempts + 1;
  await dbx
    .update(users)
    .set({
      pinFailedAttempts: attempts >= MAX_ATTEMPTS ? 0 : attempts,
      pinLockedUntil: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
    })
    .where(eq(users.id, userId));
  return false;
}

/** Find an admin whose PIN matches (supervisor authorization for discounts, voids). */
export async function authorizeSupervisor(pin: string, dbx: DbOrTx = db): Promise<PinUser | null> {
  if (!PIN_REGEX.test(pin)) return null;
  const admins = await dbx
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.role, "admin"), isNotNull(users.pinHash)));
  for (const admin of admins) {
    try {
      if (await verifyUserPin(admin.id, pin, dbx)) return admin;
    } catch {
      // locked admin: keep trying others
    }
  }
  return null;
}

export async function setUserPin(userId: string, pin: string, dbx: DbOrTx = db): Promise<void> {
  if (!PIN_REGEX.test(pin)) throw new AppError("VALIDATION", "El PIN debe tener entre 4 y 6 dígitos.");
  await dbx
    .update(users)
    .set({ pinHash: await hash(pin, 10), pinFailedAttempts: 0, pinLockedUntil: null })
    .where(eq(users.id, userId));
}
