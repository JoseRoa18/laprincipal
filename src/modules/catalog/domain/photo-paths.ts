/**
 * Storage path conventions for product photos (bucket `product-photos`):
 *
 *   products/<productId>/<imageId>-original.jpg          camera/file image, downscaled
 *   products/<productId>/<imageId>-processed.webp|jpg    browser cut-out on white ("recorte")
 *   products/<productId>/<imageId>-thumb.webp|jpg        300 px thumbnail of the chosen version
 *   products/<productId>/<imageId>-ai-<stamp>.webp       AI catalog version (Gemini + sharp)
 *   products/<productId>/<imageId>-ai-<stamp>-thumb.webp its thumbnail
 *
 * `product_images.processed_path` points at either the cut-out or the AI version; the cut-out
 * files are never overwritten, so "Volver al recorte" only has to switch the pointer back.
 * The stamp makes every AI file a new URL (public files are served as immutable).
 */

export const IMAGE_EXTENSIONS = ["webp", "jpg", "png"] as const;

const AI_PROCESSED_RE = /-ai-[a-z0-9]+\.(?:webp|jpe?g|png)$/i;

export function imageBasePath(productId: string, imageId: string): string {
  return `products/${productId}/${imageId}`;
}

/** Base36 timestamp used to version AI files. */
export function newAiStamp(now = Date.now()): string {
  return now.toString(36);
}

export function aiImagePath(base: string, stamp: string, ext = "webp"): string {
  return `${base}-ai-${stamp}.${ext}`;
}

export function aiThumbPath(base: string, stamp: string, ext = "webp"): string {
  return `${base}-ai-${stamp}-thumb.${ext}`;
}

/** True when the path is an AI catalog version (not the browser cut-out nor the original). */
export function isAiImagePath(path: string | null | undefined): boolean {
  return Boolean(path) && AI_PROCESSED_RE.test(path as string);
}

/** Candidate paths of the browser cut-out / thumbnail for an image, in probe order. */
export function candidatePaths(base: string, suffix: "processed" | "thumb"): string[] {
  return IMAGE_EXTENSIONS.map((ext) => `${base}-${suffix}.${ext}`);
}
