import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { cashSessions } from "@/db/schema";
import { getDefaultCashRegister } from "@/modules/core/application/context";

/** The open cash session for the register (null when the drawer is closed). */
export async function getOpenCashSession(dbx: DbOrTx = db, registerId?: string) {
  const regId = registerId ?? (await getDefaultCashRegister(dbx)).id;
  const [session] = await dbx
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.registerId, regId), eq(cashSessions.status, "open")))
    .limit(1);
  return session ?? null;
}
