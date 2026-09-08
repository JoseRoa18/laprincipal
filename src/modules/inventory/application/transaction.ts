import type { Db, DbOrTx, Tx } from "@/db/client";

/**
 * Run `fn` inside a transaction. When `dbx` is already a transaction Drizzle
 * opens a savepoint, so use cases can be composed and tests can wrap a whole
 * scenario in one transaction that is rolled back at the end.
 */
export function inTransaction<T>(dbx: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (dbx as Db).transaction(fn);
}
