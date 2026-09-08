/**
 * Server-side image post-processing with sharp.
 *
 * sharp is not a direct dependency of this project: it ships as an optional dependency of Next
 * (used for image optimization), so with pnpm it only resolves from Next's own node_modules.
 * `loadSharp()` first tries the project root (works when `pnpm add sharp` has been run) and then
 * Next's real location. It never throws: callers get `null` and show a clear message.
 */

import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export interface SharpMetadata {
  width?: number;
  height?: number;
  format?: string;
  hasAlpha?: boolean;
}

type Background = string | { r: number; g: number; b: number; alpha?: number };

export interface SharpPipeline {
  metadata(): Promise<SharpMetadata>;
  rotate(): SharpPipeline;
  flatten(options?: { background?: Background }): SharpPipeline;
  trim(options?: { background?: Background; threshold?: number }): SharpPipeline;
  resize(options: { width?: number; height?: number; fit?: "inside" | "cover" | "contain" | "fill"; background?: Background; withoutEnlargement?: boolean }): SharpPipeline;
  extend(options: { top: number; bottom: number; left: number; right: number; background?: Background }): SharpPipeline;
  webp(options?: { quality?: number; effort?: number }): SharpPipeline;
  png(options?: { compressionLevel?: number }): SharpPipeline;
  jpeg(options?: { quality?: number }): SharpPipeline;
  toBuffer(): Promise<Buffer>;
}

export interface SharpCreate {
  create: { width: number; height: number; channels: 3 | 4; background: Background };
}

export type SharpFactory = ((input?: Buffer | Uint8Array | SharpCreate, options?: { failOn?: "none" | "truncated" | "error" | "warning"; limitInputPixels?: number | boolean }) => SharpPipeline) & {
  versions?: Record<string, string>;
};

const globalForSharp = globalThis as unknown as { __sharpModule?: SharpFactory | null };

function tryRequire(from: string): SharpFactory | null {
  try {
    const req = createRequire(from);
    const mod = req("sharp") as SharpFactory | { default?: SharpFactory };
    const factory = (typeof mod === "function" ? mod : mod.default) as SharpFactory | undefined;
    return typeof factory === "function" ? factory : null;
  } catch {
    return null;
  }
}

/** Resolve sharp at runtime; cached per process. Returns null when it cannot be loaded. */
export function loadSharp(): SharpFactory | null {
  if (globalForSharp.__sharpModule !== undefined) return globalForSharp.__sharpModule;
  const root = process.cwd();
  let sharp = tryRequire(path.join(root, "package.json"));
  if (!sharp) {
    try {
      const nextPkg = realpathSync(path.join(root, "node_modules", "next", "package.json"));
      sharp = tryRequire(nextPkg);
    } catch {
      sharp = null;
    }
  }
  if (!sharp) console.warn("[photos] sharp no está disponible; la mejora con IA queda deshabilitada (ejecuta `pnpm add sharp`).");
  globalForSharp.__sharpModule = sharp;
  return sharp;
}

export const SERVER_PROCESSED_SIZE = 1200;
export const SERVER_THUMB_SIZE = 300;
export const SERVER_WEBP_QUALITY = 85;
/** Same framing as the browser pipeline: the product's longer side spans 82 % of the square. */
export const SERVER_CATALOG_FILL = 0.82;

export interface FitResult {
  data: Buffer;
  contentType: "image/webp";
  width: number;
  height: number;
}

/** Integer margins that center a `dw`×`dh` box inside a `size` square. */
export function centerMargins(dw: number, dh: number, size: number): { top: number; bottom: number; left: number; right: number } {
  const left = Math.floor((size - dw) / 2);
  const top = Math.floor((size - dh) / 2);
  return { top, bottom: size - dh - top, left, right: size - dw - left };
}

/** Size of a `w`×`h` image scaled so its longer side equals `size * fill` (at least 1 px). */
export function fitDimensions(w: number, h: number, size: number, fill: number): { width: number; height: number } {
  const sw = Math.max(1, w);
  const sh = Math.max(1, h);
  const target = Math.max(1, Math.round(size * fill));
  const scale = target / Math.max(sw, sh);
  return { width: Math.max(1, Math.round(sw * scale)), height: Math.max(1, Math.round(sh * scale)) };
}

/**
 * Normalize a generated image to the catalog format: trim the white margins, scale the product to
 * 82 % of the side, center it on a pure white 1200×1200 canvas and encode WebP q85.
 */
export async function fitOnWhiteSquare(sharp: SharpFactory, input: Buffer, size = SERVER_PROCESSED_SIZE, fill = SERVER_CATALOG_FILL): Promise<FitResult> {
  const flat = await sharp(input, { failOn: "none" }).rotate().flatten({ background: "#ffffff" }).png().toBuffer();
  let trimmed = flat;
  try {
    trimmed = await sharp(flat).trim({ background: "#ffffff", threshold: 24 }).png().toBuffer();
  } catch {
    trimmed = flat; // uniform image or trim unsupported: keep as is
  }
  const meta = await sharp(trimmed).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const dims = fitDimensions(w, h, size, fill);
  const margins = centerMargins(dims.width, dims.height, size);
  const data = await sharp(trimmed)
    .resize({ width: dims.width, height: dims.height, fit: "fill" })
    .extend({ ...margins, background: "#ffffff" })
    .webp({ quality: SERVER_WEBP_QUALITY })
    .toBuffer();
  return { data, contentType: "image/webp", width: size, height: size };
}

/** Center-cropped square thumbnail (WebP q85). */
export async function makeThumbBuffer(sharp: SharpFactory, input: Buffer, size = SERVER_THUMB_SIZE): Promise<FitResult> {
  const data = await sharp(input, { failOn: "none" }).resize({ width: size, height: size, fit: "cover" }).webp({ quality: SERVER_WEBP_QUALITY }).toBuffer();
  return { data, contentType: "image/webp", width: size, height: size };
}

/** Solid-color PNG, used by smoke scripts to produce a sample image without a camera. */
export async function solidPng(sharp: SharpFactory, width: number, height: number, background: Background): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
}
