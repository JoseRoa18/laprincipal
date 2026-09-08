/**
 * Starts an embedded PostgreSQL for local development (no Docker, no admin).
 * Data lives outside the synced project folder: %LOCALAPPDATA%\la-principal-2050\pg (override with LOCAL_PG_DIR). Connection: postgres://postgres:postgres@localhost:5433/lp2050
 *
 *   pnpm db:start
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_DIR =
  process.env.LOCAL_PG_DIR ??
  path.join(process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? process.cwd(), "AppData", "Local"), "la-principal-2050", "pg");
const PORT = Number(process.env.LOCAL_PG_PORT ?? 5433);
const DB_NAME = process.env.LOCAL_PG_DB ?? "lp2050";

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATABASE_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });

  const initialized = existsSync(path.join(DATABASE_DIR, "PG_VERSION"));
  if (!initialized) {
    console.log(`Initializing PostgreSQL cluster in ${DATABASE_DIR} ...`);
    await pg.initialise();
  }

  await pg.start();
  console.log(`PostgreSQL listening on port ${PORT}`);

  // Make sure both the dev and the test databases exist.
  const admin = postgres(`postgres://postgres:postgres@localhost:${PORT}/postgres`, { max: 1 });
  try {
    for (const name of [DB_NAME, `${DB_NAME}_test`]) {
      const [exists] = await admin`select 1 from pg_database where datname = ${name}`;
      if (!exists) {
        await admin.unsafe(`CREATE DATABASE "${name}"`);
        console.log(`Database "${name}" created`);
      }
    }
  } finally {
    await admin.end();
  }

  console.log(`Ready: postgres://postgres:postgres@localhost:${PORT}/${DB_NAME}`);
  console.log("Press Ctrl+C to stop.");

  const stop = async () => {
    console.log("\nStopping PostgreSQL ...");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
