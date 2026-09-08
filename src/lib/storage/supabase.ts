import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertSafePath, type Bucket, type FileStorage, type PutInput, type StoredFile } from "./index";

/**
 * Production storage on Supabase Storage using the service role key (server only).
 * The client is created lazily and without auth timers: an auto-refresh interval
 * keeps the event loop alive and makes serverless functions hang until their timeout.
 */
export class SupabaseStorage implements FileStorage {
  private client: SupabaseClient | null = null;
  private readonly baseUrl: string;

  constructor(
    url: string,
    private readonly serviceRoleKey: string,
  ) {
    this.baseUrl = url.replace(/\/+$/, "");
  }

  private get api(): SupabaseClient {
    if (!this.client) {
      this.client = createClient(this.baseUrl, this.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    }
    return this.client;
  }

  async put(input: PutInput) {
    assertSafePath(input.path);
    const { error } = await this.api.storage
      .from(input.bucket)
      .upload(input.path, input.data, { contentType: input.contentType, upsert: true });
    if (error) throw new Error(`Supabase Storage: ${error.message}`);
    return { bucket: input.bucket, path: input.path };
  }

  async get(bucket: Bucket, filePath: string): Promise<StoredFile | null> {
    assertSafePath(filePath);
    const { data, error } = await this.api.storage.from(bucket).download(filePath);
    if (error || !data) return null;
    return { data: Buffer.from(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
  }

  async delete(bucket: Bucket, filePath: string) {
    assertSafePath(filePath);
    await this.api.storage.from(bucket).remove([filePath]);
  }

  /** Public buckets have a fixed URL shape; no client or network needed. */
  publicUrl(bucket: Bucket, filePath: string) {
    assertSafePath(filePath);
    return `${this.baseUrl}/storage/v1/object/public/${bucket}/${filePath}`;
  }

  async signedUrl(bucket: Bucket, filePath: string, expiresInSeconds: number) {
    assertSafePath(filePath);
    const { data, error } = await this.api.storage.from(bucket).createSignedUrl(filePath, expiresInSeconds);
    if (error || !data) throw new Error(`Supabase Storage: ${error?.message ?? "sin URL"}`);
    return data.signedUrl;
  }
}
