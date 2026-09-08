import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

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
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 3000 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } catch (err) {
    console.warn("[tests] test database not reachable, integration tests will be skipped:", (err as Error).message);
    process.env.SKIP_DB_TESTS = "1";
  } finally {
    await pool.end().catch(() => undefined);
  }
}
