import type { NextRequest } from "next/server";
import { signOut } from "@/auth";
import { clearActingSeller } from "@/modules/sales/application/acting-seller";

const NOTICES = new Set(["sesion", "clave"]);

/**
 * Ends the session from a link or a redirect (pages cannot clear cookies):
 * used when the database revoked the session and after changing the password.
 */
export async function GET(req: NextRequest) {
  const aviso = req.nextUrl.searchParams.get("aviso");
  await clearActingSeller();
  await signOut({ redirectTo: aviso && NOTICES.has(aviso) ? `/login?aviso=${aviso}` : "/login" });
}
