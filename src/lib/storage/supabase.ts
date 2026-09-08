import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertSafePath, type Bucket, type FileStorage, type PutInput, type StoredFile } from "./index";

/** Production storage on Supabase Storage using the service role key (server only). */
export class SupabaseStorage implements FileStorage {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async put(input: PutInput) {
    assertSafePath(input.path);
    const { error } = await this.client.storage
      .from(input.bucket)
      .upload(input.path, input.data, { contentType: input.contentType, upsert: true });
    if (error) throw new Error(`Supabase Storage: ${error.message}`);
    return { bucket: input.bucket, path: input.path };
  }

  async get(bucket: Bucket, filePath: string): Promise<StoredFile | null> {
    assertSafePath(filePath);
    const { data, error } = await this.client.storage.from(bucket).download(filePath);
    if (error || !data) return null;
    return { data: Buffer.from(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
  }

  async delete(bucket: Bucket, filePath: string) {
    assertSafePath(filePath);
    await this.client.storage.from(bucket).remove([filePath]);
  }

  publicUrl(bucket: Bucket, filePath: string) {
    return this.client.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
  }

  async signedUrl(bucket: Bucket, filePath: string, expiresInSeconds: number) {
    const { data, error } = await this.client.storage.from(bucket).createSignedUrl(filePath, expiresInSeconds);
    if (error || !data) throw new Error(`Supabase Storage: ${error?.message ?? "sin URL"}`);
    return data.signedUrl;
  }
}
