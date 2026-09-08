/**
 * "Estilo catálogo con IA": optional, server-side, generative enhancement of a product photo
 * with the Gemini image model, post-processed with sharp to the same 1200×1200 white format
 * the browser pipeline produces. Enabled only when GEMINI_API_KEY is set.
 *
 * Flow: generate (returns bytes for a before/after preview, nothing stored) → apply (stores the
 * AI files and points the row at them; the browser cut-out stays on disk) → revert ("Volver al
 * recorte": points the row back at the cut-out and deletes the AI files).
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { productImages, products } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { writeAudit } from "@/modules/core/application/audit";
import { aiImagePath, aiThumbPath, candidatePaths, imageBasePath, isAiImagePath, newAiStamp } from "../domain/photo-paths";
import { GEMINI_IMAGE_MODEL, GeminiError, generateCatalogImage } from "../infrastructure/gemini-image";
import { fitOnWhiteSquare, loadSharp, makeThumbBuffer } from "../infrastructure/sharp-image";
import type { ActorUser } from "./catalog-shared";
import { extensionFor, PHOTO_BUCKET, type ImageFile } from "./images";

export const AI_DISABLED_MESSAGE = "La mejora con IA no está configurada en este servidor. Agrega GEMINI_API_KEY para activarla.";
export const SHARP_MISSING_MESSAGE = "El servidor no tiene la librería de imágenes (sharp). Ejecuta `pnpm add sharp` y vuelve a desplegar.";
const ALLOWED_INPUT = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Read the key at call time (not at import) so it can be set in Vercel without a rebuild. */
export function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? key : null;
}

export function isAiPhotoEnabled(): boolean {
  return getGeminiApiKey() !== null;
}

export interface AiPhotoResult {
  processed: ImageFile;
  thumb: ImageFile;
  model: string;
  elapsedMs: number;
}

/**
 * Generate the catalog version of one image (any source: an uploaded original or a draft from the
 * create form). Nothing is stored; the caller shows a comparison and then applies or discards.
 */
export async function generateCatalogPhoto(source: ImageFile, user: ActorUser, meta: { productId?: string | null; imageId?: string | null } = {}): Promise<AiPhotoResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new AppError("INVALID_STATE", AI_DISABLED_MESSAGE);
  if (!ALLOWED_INPUT.has(source.contentType)) throw new AppError("VALIDATION", "Formato de imagen no permitido. Usa JPG, PNG o WebP.");
  const sharp = loadSharp();
  if (!sharp) throw new AppError("INTERNAL", SHARP_MISSING_MESSAGE);

  const started = Date.now();
  let generated;
  try {
    generated = await generateCatalogImage({ data: source.data, mimeType: source.contentType }, { apiKey });
  } catch (err) {
    if (err instanceof GeminiError) throw new AppError(err.kind === "http" && err.status === 429 ? "CONFLICT" : "INVALID_STATE", err.message);
    throw err;
  }

  let processed;
  let thumb;
  try {
    processed = await fitOnWhiteSquare(sharp, generated.data);
    thumb = await makeThumbBuffer(sharp, processed.data);
  } catch (err) {
    console.error("[photos] sharp failed on the AI image", err);
    throw new AppError("INTERNAL", "La IA devolvió una imagen que no se pudo procesar. Intenta de nuevo.");
  }
  const elapsedMs = Date.now() - started;

  await writeAudit(db, {
    userId: user.id,
    action: "product.photo.ai",
    entityType: "product",
    entityId: meta.productId ?? null,
    after: {
      imageId: meta.imageId ?? null,
      model: GEMINI_IMAGE_MODEL,
      elapsedMs,
      inputBytes: source.data.byteLength,
      inputType: source.contentType,
      outputBytes: processed.data.byteLength,
      generatedType: generated.mimeType,
      finishReason: generated.finishReason,
    },
  });

  return {
    processed: { data: processed.data, contentType: processed.contentType },
    thumb: { data: thumb.data, contentType: thumb.contentType },
    model: GEMINI_IMAGE_MODEL,
    elapsedMs,
  };
}

async function loadImageRow(imageId: string) {
  const [row] = await db
    .select({ image: productImages })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(and(eq(productImages.id, imageId), isNull(products.deletedAt)));
  if (!row) throw notFound("La foto");
  return row.image;
}

/** Generate the AI version of a stored image from its original file. */
export async function enhanceProductImageWithAi(imageId: string, user: ActorUser): Promise<AiPhotoResult & { productId: string }> {
  if (!isAiPhotoEnabled()) throw new AppError("INVALID_STATE", AI_DISABLED_MESSAGE);
  const row = await loadImageRow(imageId);
  const file = await getStorage().get(PHOTO_BUCKET, row.originalPath);
  if (!file) throw new AppError("NOT_FOUND", "No se encontró el archivo original de la foto.");
  const result = await generateCatalogPhoto({ data: file.data, contentType: file.contentType }, user, { productId: row.productId, imageId: row.id });
  return { ...result, productId: row.productId };
}

export interface ApplyAiInput {
  ai: ImageFile;
  aiThumb?: ImageFile | null;
}

/** Store the AI files and make them the shown version of the image. The cut-out stays untouched. */
export async function applyAiImage(imageId: string, input: ApplyAiInput, user: ActorUser) {
  const row = await loadImageRow(imageId);
  const storage = getStorage();
  const base = imageBasePath(row.productId, row.id);
  const stamp = newAiStamp();
  const stored: string[] = [];
  const put = async (path: string, file: ImageFile) => {
    await storage.put({ bucket: PHOTO_BUCKET, path, data: file.data, contentType: file.contentType });
    stored.push(path);
    return path;
  };

  try {
    const processedPath = await put(aiImagePath(base, stamp, extensionFor(input.ai.contentType)), input.ai);
    const thumbPath = input.aiThumb ? await put(aiThumbPath(base, stamp, extensionFor(input.aiThumb.contentType)), input.aiThumb) : row.thumbPath;
    const updated = await db.transaction(async (tx) => {
      const [next] = await tx.update(productImages).set({ processedPath, thumbPath, status: "processed" }).where(eq(productImages.id, row.id)).returning();
      await writeAudit(tx, { userId: user.id, action: "product.photo.ai_apply", entityType: "product", entityId: row.productId, before: row, after: next });
      return next;
    });
    // A previous AI version (regeneration) is no longer referenced: remove its files.
    if (isAiImagePath(row.processedPath)) {
      for (const path of [row.processedPath, row.thumbPath]) {
        if (path && path !== updated.processedPath && path !== updated.thumbPath && !candidatePaths(base, "thumb").includes(path)) {
          await storage.delete(PHOTO_BUCKET, path).catch(() => undefined);
        }
      }
    }
    return updated;
  } catch (err) {
    await Promise.all(stored.map((path) => storage.delete(PHOTO_BUCKET, path).catch(() => undefined)));
    throw err;
  }
}

/** "Volver al recorte": point the image back at the browser cut-out (or the original) and delete the AI files. */
export async function revertAiImage(imageId: string, user: ActorUser) {
  const row = await loadImageRow(imageId);
  if (!isAiImagePath(row.processedPath)) throw new AppError("INVALID_STATE", "Esta foto no tiene una versión de IA aplicada.");
  const storage = getStorage();
  const base = imageBasePath(row.productId, row.id);

  const firstExisting = async (paths: string[]) => {
    for (const path of paths) {
      if (await storage.get(PHOTO_BUCKET, path)) return path;
    }
    return null;
  };
  const processedPath = await firstExisting(candidatePaths(base, "processed"));
  const thumbPath = await firstExisting(candidatePaths(base, "thumb"));

  const updated = await db.transaction(async (tx) => {
    const [next] = await tx
      .update(productImages)
      .set({ processedPath, thumbPath, status: processedPath ? "processed" : "original_only" })
      .where(eq(productImages.id, row.id))
      .returning();
    await writeAudit(tx, { userId: user.id, action: "product.photo.ai_revert", entityType: "product", entityId: row.productId, before: row, after: next });
    return next;
  });
  for (const path of [row.processedPath, row.thumbPath]) {
    if (path && path !== updated.processedPath && path !== updated.thumbPath) await storage.delete(PHOTO_BUCKET, path).catch(() => undefined);
  }
  return updated;
}
