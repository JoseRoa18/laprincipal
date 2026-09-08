import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSafePath, PUBLIC_BUCKETS, type Bucket, type FileStorage, type PutInput, type StoredFile } from "./index";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
};

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Development storage on the local disk, served by /api/files/[bucket]/[...path].
 * Private buckets use an HMAC-signed, expiring query string.
 */
export class LocalStorage implements FileStorage {
  constructor(
    private readonly rootDir: string,
    private readonly appUrl: string,
    private readonly secret: string,
  ) {}

  private fullPath(bucket: Bucket, filePath: string) {
    assertSafePath(filePath);
    return path.resolve(this.rootDir, bucket, filePath);
  }

  async put(input: PutInput) {
    const full = this.fullPath(input.bucket, input.path);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, input.data);
    return { bucket: input.bucket, path: input.path };
  }

  async get(bucket: Bucket, filePath: string): Promise<StoredFile | null> {
    try {
      const data = await readFile(this.fullPath(bucket, filePath));
      return { data, contentType: contentTypeFor(filePath) };
    } catch {
      return null;
    }
  }

  async delete(bucket: Bucket, filePath: string) {
    await rm(this.fullPath(bucket, filePath), { force: true });
  }

  publicUrl(bucket: Bucket, filePath: string) {
    if (!PUBLIC_BUCKETS.includes(bucket)) throw new Error(`El bucket ${bucket} no es público`);
    return `/api/files/${bucket}/${filePath}`;
  }

  async signedUrl(bucket: Bucket, filePath: string, expiresInSeconds: number) {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const sig = this.sign(bucket, filePath, exp);
    return `${this.appUrl}/api/files/${bucket}/${filePath}?exp=${exp}&sig=${sig}`;
  }

  sign(bucket: Bucket, filePath: string, exp: number): string {
    return createHmac("sha256", this.secret).update(`${bucket}/${filePath}:${exp}`).digest("hex");
  }

  verify(bucket: Bucket, filePath: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = Buffer.from(this.sign(bucket, filePath, exp));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
}
