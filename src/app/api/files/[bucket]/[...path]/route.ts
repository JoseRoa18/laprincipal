import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-guards";
import { env } from "@/lib/env";
import { getStorage, PUBLIC_BUCKETS, type Bucket } from "@/lib/storage";
import type { LocalStorage } from "@/lib/storage/local";

const BUCKETS: Bucket[] = ["product-photos", "documents"];

/**
 * Serves files from the local storage driver (development).
 * Public buckets are open; private buckets need a session or a signed URL.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket, path } = await ctx.params;
  if (!BUCKETS.includes(bucket as Bucket)) return new NextResponse("Not found", { status: 404 });
  // Only the local driver serves files through this route (Supabase serves its own URLs).
  // Checked via env instead of `instanceof`: hot reloads can duplicate the class identity in dev.
  if (env.STORAGE_DRIVER !== "local") return new NextResponse("Not found", { status: 404 });
  const storage = getStorage() as LocalStorage;

  const filePath = path.join("/");
  const isPublic = PUBLIC_BUCKETS.includes(bucket as Bucket);

  if (!isPublic) {
    const exp = Number(req.nextUrl.searchParams.get("exp"));
    const sig = req.nextUrl.searchParams.get("sig") ?? "";
    const signed = sig !== "" && storage.verify(bucket as Bucket, filePath, exp, sig);
    if (!signed && !(await getSessionUser())) return new NextResponse("Unauthorized", { status: 401 });
  }

  let file;
  try {
    file = await storage.get(bucket as Bucket, filePath);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "content-type": file.contentType,
      "cache-control": isPublic ? "public, max-age=31536000, immutable" : "private, no-store",
    },
  });
}
