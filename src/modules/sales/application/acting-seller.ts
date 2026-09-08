import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { users, type UserRole } from "@/db/schema";
import { getSessionUser, type SessionUser } from "@/lib/auth-guards";
import { env, isProd } from "@/lib/env";

export const ACTING_SELLER_COOKIE = "acting_seller";
const TTL_SECONDS = 12 * 60 * 60;

export interface ActingSeller {
  id: string;
  name: string;
  role: UserRole;
  /** True when the seller differs from the logged-in user (switched by PIN). */
  isActing: boolean;
}

function secret(): string {
  return env.PIN_COOKIE_SECRET ?? env.AUTH_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Cookie value `<userId>.<exp>.<hmac>`; returns the user id when valid. */
export function parseActingSellerCookie(value: string | undefined): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [userId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!userId || !Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const expected = Buffer.from(sign(`${userId}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return userId;
}

/** Set the HttpOnly signed cookie. Only callable from a server action or route handler. */
export async function setActingSeller(userId: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${userId}.${exp}`;
  const store = await cookies();
  store.set({
    name: ACTING_SELLER_COOKIE,
    value: `${payload}.${sign(payload)}`,
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function clearActingSeller(): Promise<void> {
  const store = await cookies();
  store.set({ name: ACTING_SELLER_COOKIE, value: "", path: "/", maxAge: 0 });
}

/**
 * The seller a sale is attributed to: the user switched by PIN when the signed
 * cookie is valid and that user is still active, otherwise the session user.
 */
export async function getActingSeller(sessionUser?: SessionUser | null): Promise<ActingSeller | null> {
  const session = sessionUser ?? (await getSessionUser());
  if (!session) return null;
  const store = await cookies();
  const actingId = parseActingSellerCookie(store.get(ACTING_SELLER_COOKIE)?.value);
  if (actingId && actingId !== session.id) {
    const [user] = await db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(and(eq(users.id, actingId), eq(users.isActive, true)))
      .limit(1);
    if (user && (user.role === "admin" || user.role === "seller")) {
      return { id: user.id, name: user.name, role: user.role, isActing: true };
    }
  }
  return { id: session.id, name: session.name, role: session.role, isActing: false };
}
