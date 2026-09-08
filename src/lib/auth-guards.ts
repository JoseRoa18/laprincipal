import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { UserRole } from "@/db/schema/enums";
import { AppError } from "./errors";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  return { id: u.id, name: u.name ?? "", email: u.email ?? "", role: u.role };
}

/** For pages: redirects to /login when there is no session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
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
