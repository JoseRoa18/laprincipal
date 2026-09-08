import { randomUUID } from "node:crypto";
import { and, asc, count, eq, isNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import { productImages, products } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { writeAudit } from "@/modules/core/application/audit";
import { candidatePaths, imageBasePath, newAiStamp } from "../domain/photo-paths";
import type { ActorUser } from "./catalog-shared";

export const PHOTO_BUCKET = "product-photos" as const;

export interface ImageFile {
  data: Buffer;
  contentType: string;
}

export interface AddImageInput {
  productId: string;
  /** Downscaled camera/file image (JPEG). */
  original: ImageFile;
  /** White-background square version (WebP), when background removal succeeded. */
  processed?: ImageFile | null;
  thumb?: ImageFile | null;
  /** AI catalog version generated before the upload (create form). When present it becomes the shown version. */
  ai?: ImageFile | null;
  aiThumb?: ImageFile | null;
  status: "processed" | "original_only";
}

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function extensionFor(contentType: string): string {
  const ext = EXTENSIONS[contentType];
  if (!ext) throw new AppError("VALIDATION", "Formato de imagen no permitido. Usa JPG, PNG o WebP.");
  return ext;
}

/** Store the files and create the product_images row. The first image becomes primary. */
export async function addProductImage(input: AddImageInput, user: ActorUser) {
  const [p] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, input.productId), isNull(products.deletedAt)));
  if (!p) throw notFound("El producto");

  const storage = getStorage();
  const imageId = randomUUID();
  const base = imageBasePath(input.productId, imageId);
  const stored: string[] = [];

  const put = async (suffix: string, file: ImageFile) => {
    const path = `${base}-${suffix}.${extensionFor(file.contentType)}`;
    await storage.put({ bucket: PHOTO_BUCKET, path, data: file.data, contentType: file.contentType });
    stored.push(path);
    return path;
  };

  try {
    const originalPath = await put("original", input.original);
    const cutoutPath = input.processed ? await put("processed", input.processed) : null;
    const cutoutThumbPath = input.thumb ? await put("thumb", input.thumb) : null;
    let processedPath = cutoutPath;
    let thumbPath = cutoutThumbPath;
    if (input.ai) {
      const stamp = newAiStamp();
      processedPath = await put(`ai-${stamp}`, input.ai);
      thumbPath = input.aiThumb ? await put(`ai-${stamp}-thumb`, input.aiThumb) : cutoutThumbPath;
    }

    return await db.transaction(async (tx) => {
      const [{ total }] = await tx.select({ total: count() }).from(productImages).where(eq(productImages.productId, input.productId));
      const [{ maxSort }] = await tx.select({ maxSort: max(productImages.sortOrder) }).from(productImages).where(eq(productImages.productId, input.productId));
      const [row] = await tx
        .insert(productImages)
        .values({
          id: imageId,
          productId: input.productId,
          originalPath,
          processedPath,
          thumbPath,
          sortOrder: (maxSort ?? 0) + 1,
          isPrimary: Number(total) === 0,
          status: processedPath ? "processed" : input.status,
          createdBy: user.id,
        })
        .returning();
      await writeAudit(tx, { userId: user.id, action: "product_image.add", entityType: "product", entityId: input.productId, after: row });
      return row;
    });
  } catch (err) {
    await Promise.all(stored.map((path) => storage.delete(PHOTO_BUCKET, path).catch(() => undefined)));
    throw err;
  }
}

export async function setPrimaryImage(productId: string, imageId: string, user: ActorUser): Promise<void> {
  await db.transaction(async (tx) => {
    const [img] = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)));
    if (!img) throw notFound("La foto");
    await tx.update(productImages).set({ isPrimary: false }).where(eq(productImages.productId, productId));
    await tx.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, imageId));
    await writeAudit(tx, { userId: user.id, action: "product_image.set_primary", entityType: "product", entityId: productId, after: { imageId } });
  });
}

export async function deleteProductImage(productId: string, imageId: string, user: ActorUser): Promise<void> {
  const row = await db.transaction(async (tx) => {
    const [img] = await tx
      .select()
      .from(productImages)
      .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)));
    if (!img) throw notFound("La foto");
    await tx.delete(productImages).where(eq(productImages.id, imageId));
    if (img.isPrimary) {
      const [next] = await tx.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder)).limit(1);
      if (next) await tx.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, next.id));
    }
    await writeAudit(tx, { userId: user.id, action: "product_image.delete", entityType: "product", entityId: productId, before: img });
    return img;
  });
  const storage = getStorage();
  // The row points at one version, but the cut-out and its thumbnail may still exist next to an AI version.
  const base = imageBasePath(productId, imageId);
  const paths = new Set([row.originalPath, row.processedPath, row.thumbPath, ...candidatePaths(base, "processed"), ...candidatePaths(base, "thumb")]);
  for (const path of paths) {
    if (path) await storage.delete(PHOTO_BUCKET, path).catch(() => undefined);
  }
}
