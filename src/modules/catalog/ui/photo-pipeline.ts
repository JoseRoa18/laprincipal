/**
 * Browser-side photo pipeline (no server involved):
 * camera/file → downscale to 1600 px JPEG → background removal (@imgly/background-removal)
 * → white 1200×1200 WebP with the part centered → 300×300 thumbnail.
 */

export const MAX_SIDE = 1600;
export const PROCESSED_SIZE = 1200;
export const THUMB_SIZE = 300;
export const MARGIN_PCT = 0.06;
export const ALPHA_THRESHOLD = 10;
export const PROCESS_TIMEOUT_MS = 60_000;

type Decoded = ImageBitmap | HTMLImageElement;

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

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))), type, quality);
  });
}

/** WebP when the browser can encode it (Safari < 16 cannot); JPEG otherwise. */
async function encodeWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
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
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, cw, ch);
    return await canvasToBlob(canvas, "image/jpeg", quality);
  } finally {
    release(src);
  }
}

function squareThumbFromCanvas(source: HTMLCanvasElement | Decoded, sw: number, sh: number, size: number): Promise<Blob> {
  const side = Math.min(sw, sh);
  const sx = Math.floor((sw - side) / 2);
  const sy = Math.floor((sh - side) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
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

export interface CompositeResult {
  processed: Blob;
  thumb: Blob;
  /** Fraction of the frame occupied by the detected object (0–1); low values suggest a bad cut-out. */
  coverage: number;
}

/**
 * Paint a transparent cut-out on pure white: find the bounding box of visible pixels
 * (alpha > 10), add a 6 % margin, center it in a 1200×1200 square. Also builds the thumbnail.
 */
export async function compositeOnWhite(transparent: Blob, size = PROCESSED_SIZE, margin = MARGIN_PCT): Promise<CompositeResult> {
  const src = await decode(transparent);
  try {
    const { w, h } = sizeOf(src);
    const work = document.createElement("canvas");
    work.width = w;
    work.height = h;
    const wctx = work.getContext("2d", { willReadFrequently: true });
    if (!wctx) throw new Error("Canvas no disponible");
    wctx.drawImage(src, 0, 0);
    const data = wctx.getImageData(0, 0, w, h).data;

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    let visible = 0;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (data[row + x * 4 + 3] > ALPHA_THRESHOLD) {
          visible++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) {
      minX = 0;
      minY = 0;
      maxX = w - 1;
      maxY = h - 1;
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const side = Math.max(bw, bh) * (1 + margin * 2);

    const out = document.createElement("canvas");
    out.width = size;
    out.height = size;
    const octx = out.getContext("2d");
    if (!octx) throw new Error("Canvas no disponible");
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, size, size);
    octx.imageSmoothingQuality = "high";
    const scale = size / side;
    const dw = bw * scale;
    const dh = bh * scale;
    octx.drawImage(work, minX, minY, bw, bh, (size - dw) / 2, (size - dh) / 2, dw, dh);

    const processed = await encodeWebp(out, 0.85);
    const thumb = await squareThumbFromCanvas(out, size, size, THUMB_SIZE);
    return { processed, thumb, coverage: visible / (w * h) };
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
