/**
 * Postgres `unique_violation` (SQLSTATE 23505). Drizzle wraps driver errors
 * (`DrizzleQueryError` with `cause`), so the chain of causes is inspected.
 */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
