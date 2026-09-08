import { NextResponse } from "next/server";
import type { UserRole } from "@/db/schema/enums";
import { getSessionUser, type SessionUser } from "@/lib/auth-guards";

/** Session + role check for the sales route handlers (JSON errors instead of redirects). */
export async function requireApiRole(...roles: UserRole[]): Promise<{ user: SessionUser; error: null } | { user: null; error: NextResponse }> {
  const user = await getSessionUser();
  if (!user) return { user: null, error: NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 }) };
  if (!roles.includes(user.role)) return { user: null, error: NextResponse.json({ error: "Sin permiso." }, { status: 403 }) };
  return { user, error: null };
}
