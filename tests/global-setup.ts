import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Vitest global setup: applies migrations to the test database before any
 * integration test runs. Skipped when the database is not reachable so the
 * pure domain tests still run.
 */
export default async function setup() {
  config({ path: [".env.test", ".env.local", ".env"], quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url || !/test/i.test(url)) {
    console.warn("[tests] DATABASE_URL does not point to a test database; integration tests will be skipped");
    process.env.SKIP_DB_TESTS = "1";
    return;
  }
  const client = postgres(url, { max: 1, prepare: false, connect_timeout: 3 });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } catch (err) {
    console.warn("[tests] test database not reachable, integration tests will be skipped:", (err as Error).message);
    process.env.SKIP_DB_TESTS = "1";
  } finally {
    await client.end({ timeout: 2 }).catch(() => undefined);
  }
}
