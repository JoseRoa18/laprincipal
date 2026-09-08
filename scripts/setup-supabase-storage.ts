import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

/** Creates the storage buckets the app needs (idempotent).  pnpm exec tsx scripts/setup-supabase-storage.ts */
config({ path: [".env.production.local"], quiet: true });

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: existing, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(`No se pudo listar buckets: ${listError.message}`);
  const names = new Set((existing ?? []).map((b) => b.name));

  const wanted = [
    { id: "product-photos", public: true, fileSizeLimit: 12 * 1024 * 1024, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] },
    { id: "documents", public: false, fileSizeLimit: 50 * 1024 * 1024, allowedMimeTypes: null },
  ] as const;

  for (const b of wanted) {
    if (names.has(b.id)) {
      console.log(`bucket "${b.id}" ya existe`);
      continue;
    }
    const { error } = await supabase.storage.createBucket(b.id, {
      public: b.public,
      fileSizeLimit: b.fileSizeLimit,
      allowedMimeTypes: b.allowedMimeTypes ? [...b.allowedMimeTypes] : undefined,
    });
    if (error) throw new Error(`No se pudo crear "${b.id}": ${error.message}`);
    console.log(`bucket "${b.id}" creado (${b.public ? "público" : "privado"})`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
