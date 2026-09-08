// Server-side only. Never import this file from client components.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, types } from "pg";
import { env, isProd } from "@/lib/env";
import * as schema from "./schema";

// Keep DATE columns as "yyyy-MM-dd" strings (the schema uses date mode "string").
types.setTypeParser(types.builtins.DATE, (value) => value);

const globalForDb = globalThis as unknown as { __pgPool?: Pool };

const isSupabase = /supabase\.(co|com)/.test(env.DATABASE_URL);

/**
 * node-postgres pool. Works with the Supabase TRANSACTION pooler (port 6543),
 * which is the right choice for serverless: it multiplexes many short-lived
 * function connections over a small number of database sessions. The pool is
 * cached on globalThis in development so hot reloads do not leak connections.
 */
const pool =
  globalForDb.__pgPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: isProd ? 4 : 10,
    idleTimeoutMillis: isProd ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  });

if (!isProd) globalForDb.__pgPool = pool;

export const db = drizzle(pool, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
