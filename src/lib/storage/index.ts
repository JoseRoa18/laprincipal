import { env } from "@/lib/env";
import { LocalStorage } from "./local";
import { SupabaseStorage } from "./supabase";

export type Bucket = "product-photos" | "documents";

export interface PutInput {
  bucket: Bucket;
  /** Path inside the bucket, e.g. "products/<id>/original.jpg" */
  path: string;
  data: Buffer | Uint8Array;
  contentType: string;
}

export interface StoredFile {
  data: Buffer;
  contentType: string;
}

export interface FileStorage {
  put(input: PutInput): Promise<{ bucket: Bucket; path: string }>;
  get(bucket: Bucket, path: string): Promise<StoredFile | null>;
  delete(bucket: Bucket, path: string): Promise<void>;
  /** Only for public buckets (product-photos). */
  publicUrl(bucket: Bucket, path: string): string;
  /** Time-limited URL for private buckets (documents). */
  signedUrl(bucket: Bucket, path: string, expiresInSeconds: number): Promise<string>;
}

export const PUBLIC_BUCKETS: Bucket[] = ["product-photos"];

const globalForStorage = globalThis as unknown as { __storage?: FileStorage };

export function getStorage(): FileStorage {
  if (globalForStorage.__storage) return globalForStorage.__storage;
  const storage =
    env.STORAGE_DRIVER === "supabase"
      ? new SupabaseStorage(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
      : new LocalStorage(env.LOCAL_STORAGE_DIR, env.APP_URL, env.PIN_COOKIE_SECRET ?? env.AUTH_SECRET);
  globalForStorage.__storage = storage;
  return storage;
}

/** Safe path segment: letters, digits, dash, underscore, dot, slash. */
export function assertSafePath(path: string): void {
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(path) || path.includes("..") || path.startsWith("/")) {
    throw new Error(`Ruta de archivo inválida: ${path}`);
  }
}
