/**
 * Browser-side photo pipeline (no server involved):
 * camera/file → downscale to 1600 px JPEG → background removal (@imgly/background-removal)
 * → "acabado de estudio": clean mask (specks removed, edge eroded 1 px and feathered), auto-levels,
 *   gentle gray-world white balance, +8 % saturation, mild unsharp mask
 * → pure white 1200×1200 WebP with the part centered at 82 % of the side and a soft contact shadow
 * → 300×300 thumbnail.
 *
 * The image math lives in `domain/photo-math.ts` (pure, unit-tested); this file only handles
 * decoding, canvases (OffscreenCanvas when available) and encoding.
 */

import {
  alphaBoundingBox,
  applyColorAdjustments,
  buildLevelsLut,
  CATALOG_FILL,
  catalogLayout,
  channelMeans,
  contactShadowGeometry,
  erodeAlpha,
  featherAlpha,
  grayWorldGains,
  levelsFromHistogram,
  luminanceHistogram,
  removeSmallIslands,
  SATURATION_BOOST,
  unsharpMask,
  type ShadowGeometry,
} from "../domain/photo-math";

export const MAX_SIDE = 1600;
export const PROCESSED_SIZE = 1200;
export const THUMB_SIZE = 300;
export const PROCESS_TIMEOUT_MS = 60_000;
/** Transparent pixels kept around the crop so the feathered edge is never clipped. */
const EDGE_PAD = 4;

type Decoded = ImageBitmap | HTMLImageElement;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

async function decode(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      /* fall back to <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

function sizeOf(src: Decoded): { w: number; h: number } {
  if (src instanceof HTMLImageElement) return { w: src.naturalWidth, h: src.naturalHeight };
  return { w: src.width, h: src.height };
}

function release(src: Decoded) {
  if ("close" in src && typeof src.close === "function") src.close();
}

/** OffscreenCanvas keeps the work off the DOM (and off the main-thread layout) when the browser has it. */
function createCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function context2d(canvas: AnyCanvas, options?: CanvasRenderingContext2DSettings): Ctx2D {
  const ctx = (canvas as HTMLCanvasElement).getContext("2d", options) as Ctx2D | null;
  if (!ctx) throw new Error("Canvas no disponible");
  return ctx;
}

function canvasToBlob(canvas: AnyCanvas, type: string, quality?: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))), type, quality);
  });
}

/** WebP when the browser can encode it (Safari < 16 cannot); JPEG otherwise. */
async function encodeWebp(canvas: AnyCanvas, quality: number): Promise<Blob> {
  const blob = await canvasToBlob(canvas, "image/webp", quality);
  if (blob.type === "image/webp") return blob;
  return canvasToBlob(canvas, "image/jpeg", 0.9);
}

/** Resize so the long side is at most `maxSide`, painted on white, exported as JPEG. */
export async function downscaleImage(file: Blob, maxSide = MAX_SIDE, quality = 0.9): Promise<Blob> {
  const src = await decode(file);
  try {
    const { w, h } = sizeOf(src);
    if (!w || !h) throw new Error("La imagen está vacía");
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = createCanvas(cw, ch);
    const ctx = context2d(canvas);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, cw, ch);
    return await canvasToBlob(canvas, "image/jpeg", quality);
  } finally {
    release(src);
  }
}

function squareThumbFromCanvas(source: AnyCanvas | Decoded, sw: number, sh: number, size: number): Promise<Blob> {
  const side = Math.min(sw, sh);
  const sx = Math.floor((sw - side) / 2);
  const sy = Math.floor((sh - side) / 2);
  const canvas = createCanvas(size, size);
  const ctx = context2d(canvas);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  return encodeWebp(canvas, 0.85);
}

/** Center-cropped square thumbnail of any image. */
export async function makeThumb(source: Blob, size = THUMB_SIZE): Promise<Blob> {
  const src = await decode(source);
  try {
    const { w, h } = sizeOf(src);
    return await squareThumbFromCanvas(src, w, h, size);
  } finally {
    release(src);
  }
}

function drawContactShadow(ctx: Ctx2D, g: ShadowGeometry) {
  // A radial gradient drawn under a non-uniform scale becomes a soft-edged ellipse;
  // no `filter` needed, so it renders the same on every browser.
  ctx.save();
  ctx.translate(g.cx, g.cy);
  ctx.scale(g.rx, g.ry);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  grad.addColorStop(0, `rgba(0,0,0,${g.opacity})`);
  grad.addColorStop(0.55, `rgba(0,0,0,${g.opacity * 0.6})`);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

export interface CompositeOptions {
  /** Output side in pixels. */
  size?: number;
  /** Fraction of the side taken by the product's longer dimension. */
  fill?: number;
  /** Soft contact shadow under the product. */
  shadow?: boolean;
  /** Levels, white balance, saturation and sharpening on the product pixels. */
  studio?: boolean;
}

export interface CompositeResult {
  processed: Blob;
  thumb: Blob;
  /** Fraction of the frame occupied by the detected object (0–1); low values suggest a bad cut-out. */
  coverage: number;
  /** Specks removed from the mask. */
  islandsRemoved: number;
}

/**
 * Paint a transparent cut-out as a catalog photo: clean the mask, apply the studio finish to
 * the product pixels, center it on pure white at 82 % of the side with a soft contact shadow.
 * Also builds the thumbnail.
 */
export async function compositeOnWhite(transparent: Blob, options: CompositeOptions = {}): Promise<CompositeResult> {
  const { size = PROCESSED_SIZE, fill = CATALOG_FILL, shadow = true, studio = true } = options;
  const src = await decode(transparent);
  try {
    const { w: sw, h: sh } = sizeOf(src);
    if (!sw || !sh) throw new Error("La imagen está vacía");
    // Work at ≤ 1600 px (the original already is; this guards other inputs) to keep phones responsive.
    const workScale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * workScale));
    const h = Math.max(1, Math.round(sh * workScale));
    const work = createCanvas(w, h);
    const wctx = context2d(work, { willReadFrequently: true });
    wctx.imageSmoothingQuality = "high";
    wctx.drawImage(src, 0, 0, w, h);
    const data = wctx.getImageData(0, 0, w, h).data;

    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
    const islands = removeSmallIslands(alpha, w, h);
    const box = alphaBoundingBox(alpha, w, h);
    const coverage = box ? box.area / (w * h) : 0;

    const out = createCanvas(size, size);
    const octx = context2d(out);
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, size, size);
    octx.imageSmoothingQuality = "high";

    if (!box) {
      // Nothing detected: keep the whole frame, centered with the same framing.
      const layout = catalogLayout(w, h, size, fill);
      octx.drawImage(work, 0, 0, w, h, layout.dx, layout.dy, layout.dw, layout.dh);
    } else {
      // Crop the product (plus a transparent pad) into its own buffer: every filter below runs on it only.
      const rx = Math.max(0, box.minX - EDGE_PAD);
      const ry = Math.max(0, box.minY - EDGE_PAD);
      const rw = Math.min(w, box.maxX + EDGE_PAD + 1) - rx;
      const rh = Math.min(h, box.maxY + EDGE_PAD + 1) - ry;
      const region = new Uint8ClampedArray(rw * rh * 4);
      const regionAlpha = new Uint8Array(rw * rh);
      for (let y = 0; y < rh; y++) {
        const srcStart = (ry + y) * w + rx;
        region.set(data.subarray(srcStart * 4, (srcStart + rw) * 4), y * rw * 4);
        regionAlpha.set(alpha.subarray(srcStart, srcStart + rw), y * rw);
      }

      if (studio) {
        // Statistics on solid pixels only; the same LUT and gains apply to the whole product.
        const levels = levelsFromHistogram(luminanceHistogram(region, regionAlpha));
        const gains = grayWorldGains(channelMeans(region, regionAlpha));
        applyColorAdjustments(region, { lut: levels.gain !== 1 ? buildLevelsLut(levels.low, levels.high) : undefined, gains, saturation: SATURATION_BOOST });
      }
      // Matte choke: drop the outermost pixel ring (where the old background bleeds in) and feather 1–2 px.
      erodeAlpha(regionAlpha, rw, rh, 1);
      featherAlpha(regionAlpha, rw, rh, 1, 2);
      for (let i = 0; i < rw * rh; i++) region[i * 4 + 3] = regionAlpha[i];
      if (studio) unsharpMask(region, rw, rh);

      const regionCanvas = createCanvas(rw, rh);
      context2d(regionCanvas).putImageData(new ImageData(region, rw, rh), 0, 0);

      const layout = catalogLayout(box.width, box.height, size, fill);
      if (shadow) drawContactShadow(octx, contactShadowGeometry(layout));
      const s = layout.scale;
      octx.drawImage(regionCanvas, 0, 0, rw, rh, layout.dx - (box.minX - rx) * s, layout.dy - (box.minY - ry) * s, rw * s, rh * s);
    }

    const processed = await encodeWebp(out, 0.85);
    const thumb = await squareThumbFromCanvas(out, size, size, THUMB_SIZE);
    return { processed, thumb, coverage, islandsRemoved: islands.removed };
  } finally {
    release(src);
  }
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
}

export interface RemovalProgress {
  stage: "download" | "compute";
  percent: number;
}

/**
 * Run @imgly/background-removal in the browser (model downloaded from its CDN on first use).
 * Rejects with Error("timeout") after `timeoutMs`; the caller then keeps the original.
 */
export async function removeBackgroundWithTimeout(blob: Blob, onProgress: (p: RemovalProgress) => void, timeoutMs = PROCESS_TIMEOUT_MS): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  const model = isMobileDevice() ? "isnet_quint8" : "isnet_fp16";
  const work = removeBackground(blob, {
    model,
    output: { format: "image/png", quality: 1 },
    progress: (key, current, total) => {
      onProgress({ stage: key.startsWith("fetch") ? "download" : "compute", percent: total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0 });
    },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function extensionFor(blob: Blob): string {
  if (blob.type === "image/webp") return "webp";
  if (blob.type === "image/png") return "png";
  return "jpg";
}

/** Decode a base64 payload (server action result) into a Blob. */
export function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
