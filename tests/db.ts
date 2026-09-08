import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

/**
 * Integration-test database helper. Uses DATABASE_URL from .env.test
 * (a separate database on the same embedded server, see scripts/dev-db.ts).
 */
export function createTestDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set for tests");
  if (!/test/i.test(url)) throw new Error(`Refusing to run integration tests against a non-test database: ${url}`);
  const client = postgres(url, { max: 8, prepare: false });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end({ timeout: 2 }) };
}

export type TestDb = ReturnType<typeof createTestDb>["db"];

/** Unique suffix for SKUs, names and emails created by a test. */
export function uid(prefix = "t"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
