import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { UserRole } from "@/db/schema/enums";
import { AppError } from "./errors";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

/**
 * The signed cookie says who logged in; the database says whether that still
 * holds. A deactivated user, or one whose role or password changed after the
 * login (users.session_version), is out on the next request. Once per request.
 */
const loadSession = cache(async (): Promise<{ user: SessionUser | null; revoked: boolean }> => {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return { user: null, revoked: false };
  const [row] = await db
    .select({ name: users.name, email: users.email, role: users.role, isActive: users.isActive, sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, u.id))
    .limit(1);
  if (!row || !row.isActive || row.sessionVersion !== (u.sv ?? 0)) return { user: null, revoked: true };
  return { user: { id: u.id, name: row.name, email: row.email, role: row.role }, revoked: false };
});

export async function getSessionUser(): Promise<SessionUser | null> {
  return (await loadSession()).user;
}

/** For pages: redirects to /login when there is no session, or to /salir (clears the cookie) when it was revoked. */
export async function requireUser(): Promise<SessionUser> {
  const { user, revoked } = await loadSession();
  if (!user) redirect(revoked ? "/salir?aviso=sesion" : "/login");
  return user;
}

/** For pages: redirects to /sin-acceso when the role is not allowed. */
export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/sin-acceso");
  return user;
}

/** For server actions: throws AppError instead of redirecting. */
export async function assertRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Debes iniciar sesión.");
  if (!roles.includes(user.role)) throw new AppError("FORBIDDEN", "No tienes permiso para esta acción.");
  return user;
}

// Permission table lives in a framework-free module so tests and domain code can import it.
export { ALL_ROLES, can, PERMISSIONS, type Permission } from "./permissions";
