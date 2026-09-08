// Server-side only. Never import this file from client components.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env, isProd } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

/**
 * postgres.js client. `prepare: false` is required by the Supabase transaction
 * pooler (Supavisor) and harmless elsewhere. The client is cached on
 * globalThis in development so hot reloads do not leak connections.
 */
const client =
  globalForDb.__pgClient ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    max: isProd ? 5 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (!isProd) globalForDb.__pgClient = client;

export const db = drizzle(client, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
