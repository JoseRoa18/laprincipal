import { eq, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { authThrottle } from "@/db/schema";
import { lockMinutes, type ThrottlePolicy } from "../domain/throttle";

/**
 * Count one attempt for `key` before checking it, in a single upsert so that
 * parallel requests all count. Returns when the key is locked until (this
 * attempt is refused), or null when the attempt may go ahead. Counters older
 * than a day start over.
 */
export async function reserveAttempt(key: string, policy: ThrottlePolicy, dbx: DbOrTx = db): Promise<Date | null> {
  const t = authThrottle;
  const [row] = await dbx
    .insert(t)
    .values({ key, failures: 1, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: t.key,
      set: {
        failures: sql`case
          when ${t.lockedUntil} > now() then ${t.failures}
          when ${t.updatedAt} < now() - interval '1 day' then 1
          else ${t.failures} + 1 end`,
        locks: sql`case when ${t.updatedAt} < now() - interval '1 day' and (${t.lockedUntil} is null or ${t.lockedUntil} <= now()) then 0 else ${t.locks} end`,
        updatedAt: sql`case when ${t.lockedUntil} > now() then ${t.updatedAt} else now() end`,
      },
    })
    .returning({ failures: t.failures, locks: t.locks, lockedUntil: t.lockedUntil });

  if (row.lockedUntil && row.lockedUntil > new Date()) return row.lockedUntil;
  if (row.failures <= policy.maxFailures) return null;

  // Too many failures: lock. Only the first of several parallel requests sets the lock.
  const minutes = lockMinutes(policy, row.locks);
  const [locked] = await dbx
    .update(t)
    .set({ lockedUntil: sql`now() + make_interval(mins => ${minutes})`, locks: sql`${t.locks} + 1`, failures: 0 })
    .where(sql`${t.key} = ${key} and (${t.lockedUntil} is null or ${t.lockedUntil} <= now())`)
    .returning({ lockedUntil: t.lockedUntil });
  if (locked?.lockedUntil) return locked.lockedUntil;
  const [current] = await dbx.select({ lockedUntil: t.lockedUntil }).from(t).where(eq(t.key, key)).limit(1);
  return current?.lockedUntil ?? new Date(Date.now() + minutes * 60_000);
}

/** A successful attempt clears the counter and the escalation. */
export async function clearAttempts(key: string, dbx: DbOrTx = db): Promise<void> {
  await dbx.delete(authThrottle).where(eq(authThrottle.key, key));
}
