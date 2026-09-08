// Server-side only. Never import this file from client components.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env, isProd } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

/**
 * postgres.js client. In production DATABASE_URL must point to the Supabase
 * SESSION pooler (port 5432): concurrent queries through the transaction pooler
 * (6543) hang with this driver. `prepare: false` keeps both modes safe. The
 * client is cached on globalThis in development so hot reloads do not leak
 * connections; in serverless each instance keeps a small pool.
 */
const client =
  globalForDb.__pgClient ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    max: isProd ? 3 : 10,
    idle_timeout: isProd ? 10 : 20,
    connect_timeout: 10,
    ssl: env.DATABASE_URL.includes("supabase.co") || env.DATABASE_URL.includes("supabase.com") ? "require" : undefined,
  });

if (!isProd) globalForDb.__pgClient = client;

export const db = drizzle(client, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
