import { config } from "dotenv";
import { hash } from "bcryptjs";
import postgres from "postgres";

/** Sets a user's password in the database of ENV_FILE (default .env.production.local).
 *  ENV_FILE=.env.production.local USER_EMAIL=... USER_PASSWORD=... pnpm exec tsx scripts/set-password.ts */
config({ path: [process.env.ENV_FILE ?? ".env.production.local"], quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  const email = process.env.USER_EMAIL?.toLowerCase();
  const password = process.env.USER_PASSWORD;
  if (!url || !email || !password) throw new Error("DATABASE_URL, USER_EMAIL y USER_PASSWORD son obligatorios");
  if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
  const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });
  try {
    const rows = await sql`update users set password_hash = ${await hash(password, 10)}, updated_at = now() where email = ${email} returning email, role`;
    if (rows.length === 0) throw new Error(`No existe el usuario ${email}`);
    console.log(`Contraseña actualizada para ${rows[0].email} (${rows[0].role})`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
