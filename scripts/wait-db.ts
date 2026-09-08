import "./load-env";
import postgres from "postgres";

/** Waits until DATABASE_URL accepts connections (max ~60 s). */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const deadline = Date.now() + 60_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const sql = postgres(url, { max: 1, connect_timeout: 3, prepare: false });
    try {
      const [row] = await sql`select version() as version`;
      console.log(`Database ready: ${String(row.version).split(",")[0]}`);
      await sql.end();
      return;
    } catch (err) {
      lastError = err;
      await sql.end({ timeout: 1 }).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  console.error("Database did not become ready in time", lastError);
  process.exit(1);
}

main();
