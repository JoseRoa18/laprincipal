import { PgTransaction } from "drizzle-orm/pg-core";
import type { DbOrTx } from "./client";

type Task = () => PromiseLike<unknown>;

/**
 * `Promise.all` for queries that share `dbx`. On the pool they run in
 * parallel (each query borrows its own connection); inside a transaction they
 * run one after another, because a pg client executes a single query at a
 * time and pg 9 rejects overlapping calls.
 */
export async function allQueries<T extends readonly Task[] | []>(
  dbx: DbOrTx,
  tasks: T,
): Promise<{ -readonly [K in keyof T]: T[K] extends () => PromiseLike<infer R> ? R : never }> {
  if (!(dbx instanceof PgTransaction)) return (await Promise.all(tasks.map((task) => task()))) as never;
  const out: unknown[] = [];
  for (const task of tasks) out.push(await task());
  return out as never;
}
