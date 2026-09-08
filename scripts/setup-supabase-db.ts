import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";

/**
 * Finds the Supabase pooler host for the project, writes DATABASE_URL (6543) and
 * DIRECT_URL (5432) into .env.production.local. Password from SUPABASE_DB_PASSWORD.
 */
config({ path: [".env.production.local"], quiet: true });

const REF = new URL(process.env.SUPABASE_URL!).host.split(".")[0];
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) throw new Error("SUPABASE_DB_PASSWORD requerido");

const regions = ["us-east-1", "us-east-2", "us-west-1", "us-west-2", "sa-east-1", "eu-central-1", "eu-west-1", "eu-west-2", "ca-central-1"];
const hosts = regions.flatMap((r) => [`aws-0-${r}.pooler.supabase.com`, `aws-1-${r}.pooler.supabase.com`]);

async function tryHost(host: string, port: number): Promise<boolean> {
  const sql = postgres({ host, port, database: "postgres", username: `postgres.${REF}`, password: PASSWORD, ssl: "require", max: 1, connect_timeout: 6, prepare: false });
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}

async function main() {
  for (const host of hosts) {
    if (await tryHost(host, 5432)) {
      const enc = encodeURIComponent(PASSWORD!);
      const direct = `postgresql://postgres.${REF}:${enc}@${host}:5432/postgres`;
      const pooled = `postgresql://postgres.${REF}:${enc}@${host}:6543/postgres`;
      const ok6543 = await tryHost(host, 6543);
      let env = readFileSync(".env.production.local", "utf-8").replace(/^(DATABASE_URL|DIRECT_URL)=.*$\n?/gm, "").replace(/^# Pendientes:.*$\n?/gm, "");
      env += `${env.endsWith("\n") ? "" : "\n"}DATABASE_URL=${ok6543 ? pooled : direct}\nDIRECT_URL=${direct}\n`;
      writeFileSync(".env.production.local", env);
      console.log(`servidor encontrado: ${host} (5432 ok, 6543 ${ok6543 ? "ok" : "no disponible, se usa 5432"})`);
      return;
    }
  }
  console.error("No se encontró el servidor. Copia las cadenas del botón Connect de Supabase.");
  process.exit(1);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
