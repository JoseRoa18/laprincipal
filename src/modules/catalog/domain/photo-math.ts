/**
 * Pure image math for the "acabado de estudio" (studio finish) applied to product photos
 * after background removal. No DOM, no canvas: every function works on plain typed arrays so
 * it can run in the browser (photo-pipeline.ts) and be unit-tested in Node.
 *
 * Conventions: `rgba` is interleaved RGBA (4 bytes per pixel, straight alpha), `alpha` is one
 * byte per pixel, images are row-major with width `w` and height `h`. Functions that say
 * "in place" mutate the array they receive.
 */

export type Bytes = Uint8Array | Uint8ClampedArray;

/** Pixels with alpha above this value count as part of the product. */
export const ALPHA_THRESHOLD = 10;
/** Pixels with alpha at or above this value are "solid": used for statistics (levels, white balance). */
export const SOLID_ALPHA = 250;
/** Fraction of the output side occupied by the product's longer dimension. */
export const CATALOG_FILL = 0.82;
/** Connected blobs smaller than this fraction of the product area are removed (specks, dust). */
export const MIN_ISLAND_FRACTION = 0.005;
/** Opacity of the contact shadow under the product. */
export const SHADOW_OPACITY = 0.18;
/** Saturation multiplier (1 = unchanged). Kept subtle so colors stay faithful. */
export const SATURATION_BOOST = 1.08;

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  /** Number of visible pixels (alpha above the threshold). */
  area: number;
}

/** Bounding box of the pixels whose alpha is above `threshold`; null when nothing is visible. */
export function alphaBoundingBox(alpha: Bytes, w: number, h: number, threshold = ALPHA_THRESHOLD): Box | null {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let area = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alpha[row + x] > threshold) {
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1, area };
}

export interface IslandResult {
  /** Blobs cleared because they were smaller than the minimum area. */
  removed: number;
  /** Blobs kept. */
  kept: number;
  /** Visible pixels after cleaning. */
  area: number;
}

/**
 * Clear (alpha = 0) every 4-connected blob of visible pixels whose area is below
 * `minFraction` of the total visible area. Removes the specks the segmentation model leaves
 * around the part. In place.
 */
export function removeSmallIslands(alpha: Bytes, w: number, h: number, threshold = ALPHA_THRESHOLD, minFraction = MIN_ISLAND_FRACTION): IslandResult {
  const n = w * h;
  let total = 0;
  for (let i = 0; i < n; i++) if (alpha[i] > threshold) total++;
  if (total === 0) return { removed: 0, kept: 0, area: 0 };
  const minArea = Math.max(1, Math.ceil(total * minFraction));

  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  let removed = 0;
  let kept = 0;
  let removedPixels = 0;

  for (let start = 0; start < n; start++) {
    if (visited[start] || alpha[start] <= threshold) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      if (x > 0) {
        const j = i - 1;
        if (!visited[j] && alpha[j] > threshold) {
          visited[j] = 1;
          queue[tail++] = j;
        }
      }
      if (x < w - 1) {
        const j = i + 1;
        if (!visited[j] && alpha[j] > threshold) {
          visited[j] = 1;
          queue[tail++] = j;
        }
      }
      if (i >= w) {
        const j = i - w;
        if (!visited[j] && alpha[j] > threshold) {
          visited[j] = 1;
          queue[tail++] = j;
        }
      }
      if (i + w < n) {
        const j = i + w;
        if (!visited[j] && alpha[j] > threshold) {
          visited[j] = 1;
          queue[tail++] = j;
        }
      }
    }
    if (tail < minArea) {
      for (let k = 0; k < tail; k++) alpha[queue[k]] = 0;
      removed++;
      removedPixels += tail;
    } else {
      kept++;
    }
  }
  return { removed, kept, area: total - removedPixels };
}

/** Shrink the mask by `radius` pixels (separable min filter, edge-replicated). In place. */
export function erodeAlpha(alpha: Bytes, w: number, h: number, radius = 1): void {
  if (radius <= 0 || w === 0 || h === 0) return;
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k < 0 ? 0 : x + k >= w ? w - 1 : x + k;
        const v = alpha[row + xx];
        if (v < m) m = v;
      }
      tmp[row + x] = m;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 255;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k < 0 ? 0 : y + k >= h ? h - 1 : y + k;
        const v = tmp[yy * w + x];
        if (v < m) m = v;
      }
      alpha[y * w + x] = m;
    }
  }
}

/**
 * Soften the mask edge with a box blur of the given radius, repeated `passes` times
 * (two passes of radius 1 approximate a Gaussian of about 1 px). In place.
 */
export function featherAlpha(alpha: Bytes, w: number, h: number, radius = 1, passes = 2): void {
  if (radius <= 0 || w === 0 || h === 0) return;
  const tmp = new Uint8Array(w * h);
  const div = 2 * radius + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += alpha[row + (k < 0 ? 0 : k >= w ? w - 1 : k)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = Math.round(sum / div);
        const xOut = x - radius < 0 ? 0 : x - radius;
        const xIn = x + radius + 1 >= w ? w - 1 : x + radius + 1;
        sum += alpha[row + xIn] - alpha[row + xOut];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += tmp[(k < 0 ? 0 : k >= h ? h - 1 : k) * w + x];
      for (let y = 0; y < h; y++) {
        alpha[y * w + x] = Math.round(sum / div);
        const yOut = y - radius < 0 ? 0 : y - radius;
        const yIn = y + radius + 1 >= h ? h - 1 : y + radius + 1;
        sum += tmp[yIn * w + x] - tmp[yOut * w + x];
      }
    }
  }
}

/** Rec. 601 luma of an RGB triple, 0–255. */
export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** 256-bin luminance histogram of the solid pixels (alpha >= `solidThreshold`). */
export function luminanceHistogram(rgba: Bytes, alpha: Bytes, solidThreshold = SOLID_ALPHA): Uint32Array {
  const hist = new Uint32Array(256);
  const n = alpha.length;
  for (let i = 0; i < n; i++) {
    if (alpha[i] < solidThreshold) continue;
    const p = i * 4;
    hist[Math.round(luma(rgba[p], rgba[p + 1], rgba[p + 2]))]++;
  }
  return hist;
}

/** Smallest bin whose cumulative count reaches `pct` (0–1) of the histogram total. */
export function percentileFromHistogram(hist: Uint32Array, pct: number): number {
  let total = 0;
  for (let i = 0; i < hist.length; i++) total += hist[i];
  if (total === 0) return 0;
  const target = Math.max(1, Math.ceil(total * pct));
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return hist.length - 1;
}

export interface Levels {
  low: number;
  high: number;
  /** Contrast gain applied, 255 / (high - low). 1 means no change. */
  gain: number;
}

export interface LevelsOptions {
  lowPct?: number;
  highPct?: number;
  /** Maximum contrast gain; the stretch widens symmetrically when the percentiles are too close. */
  maxGain?: number;
  /** Below this percentile spread the image is flat (e.g. a white part): no stretch at all. */
  minRange?: number;
  /** Below this many solid pixels the statistics are meaningless: no stretch. */
  minPixels?: number;
}

export const IDENTITY_LEVELS: Levels = { low: 0, high: 255, gain: 1 };

/**
 * Auto-levels: map the 1st–99th luminance percentiles of the product to 0–255,
 * with the gain capped so noisy or flat photos are not over-stretched.
 */
export function levelsFromHistogram(hist: Uint32Array, options: LevelsOptions = {}): Levels {
  const { lowPct = 0.01, highPct = 0.99, maxGain = 1.6, minRange = 32, minPixels = 100 } = options;
  let total = 0;
  for (let i = 0; i < hist.length; i++) total += hist[i];
  if (total < minPixels) return IDENTITY_LEVELS;
  let low = percentileFromHistogram(hist, lowPct);
  let high = percentileFromHistogram(hist, highPct);
  if (high - low < minRange) return IDENTITY_LEVELS;
  if (low <= 0 && high >= 255) return IDENTITY_LEVELS;
  let gain = 255 / (high - low);
  if (gain > maxGain) {
    const half = 255 / maxGain / 2;
    const mid = (low + high) / 2;
    low = Math.round(mid - half);
    high = Math.round(mid + half);
    if (low < 0) {
      high -= low;
      low = 0;
    }
    if (high > 255) {
      low -= high - 255;
      high = 255;
    }
    low = Math.max(0, low);
    gain = 255 / (high - low);
  }
  return { low, high, gain };
}

/** Lookup table that maps [low, high] to [0, 255] linearly, clamped. */
export function buildLevelsLut(low: number, high: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const range = Math.max(1, high - low);
  for (let v = 0; v < 256; v++) lut[v] = Math.round(((v - low) * 255) / range);
  return lut;
}

export interface ChannelMeans {
  r: number;
  g: number;
  b: number;
  count: number;
}

/** Mean of each color channel over the solid pixels. */
export function channelMeans(rgba: Bytes, alpha: Bytes, solidThreshold = SOLID_ALPHA): ChannelMeans {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const n = alpha.length;
  for (let i = 0; i < n; i++) {
    if (alpha[i] < solidThreshold) continue;
    const p = i * 4;
    r += rgba[p];
    g += rgba[p + 1];
    b += rgba[p + 2];
    count++;
  }
  if (count === 0) return { r: 0, g: 0, b: 0, count: 0 };
  return { r: r / count, g: g / count, b: b / count, count };
}

export interface Gains {
  r: number;
  g: number;
  b: number;
}

export interface GrayWorldOptions {
  /** Each channel gain is clamped to [1/maxGain, maxGain]. */
  maxGain?: number;
  /** Fraction of the full gray-world correction to apply (0–1). */
  strength?: number;
  /** Mean chroma (max - min of the channel means) up to which the full strength applies. */
  chromaFull?: number;
  /** Mean chroma from which no correction applies (the part itself is colorful, not the light). */
  chromaNone?: number;
}

/**
 * Gentle gray-world white balance: pull the channel means toward their average.
 * Limited in strength and clamped, and faded out for colorful parts (a red housing is not a
 * color cast). Neutral input returns unit gains.
 */
export function grayWorldGains(means: ChannelMeans, options: GrayWorldOptions = {}): Gains {
  const { maxGain = 1.1, strength = 0.5, chromaFull = 20, chromaNone = 60 } = options;
  if (means.count === 0) return { r: 1, g: 1, b: 1 };
  const gray = (means.r + means.g + means.b) / 3;
  if (gray < 1) return { r: 1, g: 1, b: 1 };
  const chroma = Math.max(means.r, means.g, means.b) - Math.min(means.r, means.g, means.b);
  const fade = chromaNone <= chromaFull ? 1 : Math.min(1, Math.max(0, (chromaNone - chroma) / (chromaNone - chromaFull)));
  const s = strength * fade;
  const lo = 1 / maxGain;
  const gain = (mean: number) => {
    const raw = mean < 1 ? 1 : gray / mean;
    const g = 1 + (raw - 1) * s;
    return g < lo ? lo : g > maxGain ? maxGain : g;
  };
  return { r: gain(means.r), g: gain(means.g), b: gain(means.b) };
}

export interface ColorAdjustments {
  lut?: Bytes;
  gains?: Gains;
  /** 1 = unchanged; 1.08 = +8 % saturation. */
  saturation?: number;
}

/** Apply levels (LUT), channel gains and a saturation factor to every visible pixel. In place. */
export function applyColorAdjustments(rgba: Bytes, adjust: ColorAdjustments): void {
  const { lut, gains, saturation = 1 } = adjust;
  const gr = gains?.r ?? 1;
  const gg = gains?.g ?? 1;
  const gb = gains?.b ?? 1;
  const doGains = gr !== 1 || gg !== 1 || gb !== 1;
  const doSat = saturation !== 1;
  if (!lut && !doGains && !doSat) return;
  const n = rgba.length;
  for (let p = 0; p < n; p += 4) {
    if (rgba[p + 3] === 0) continue;
    let r = rgba[p];
    let g = rgba[p + 1];
    let b = rgba[p + 2];
    if (lut) {
      r = lut[r];
      g = lut[g];
      b = lut[b];
    }
    if (doGains) {
      r = clamp255(r * gr);
      g = clamp255(g * gg);
      b = clamp255(b * gb);
    }
    if (doSat) {
      const y = luma(r, g, b);
      r = clamp255(y + (r - y) * saturation);
      g = clamp255(y + (g - y) * saturation);
      b = clamp255(y + (b - y) * saturation);
    }
    rgba[p] = Math.round(r);
    rgba[p + 1] = Math.round(g);
    rgba[p + 2] = Math.round(b);
  }
}

/** Separable box blur of interleaved 4-channel data (edge-replicated). Returns a new array. */
export function boxBlurRgba(src: Bytes, w: number, h: number, radius = 1, passes = 1): Uint8ClampedArray {
  const a = new Uint8ClampedArray(src);
  if (radius <= 0 || w === 0 || h === 0) return a;
  const b = new Uint8ClampedArray(src.length);
  const div = 2 * radius + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += a[row + (k < 0 ? 0 : k >= w ? w - 1 : k) * 4 + c];
        for (let x = 0; x < w; x++) {
          b[row + x * 4 + c] = Math.round(sum / div);
          const xOut = x - radius < 0 ? 0 : x - radius;
          const xIn = x + radius + 1 >= w ? w - 1 : x + radius + 1;
          sum += a[row + xIn * 4 + c] - a[row + xOut * 4 + c];
        }
      }
    }
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += b[((k < 0 ? 0 : k >= h ? h - 1 : k) * w + x) * 4 + c];
        for (let y = 0; y < h; y++) {
          a[(y * w + x) * 4 + c] = Math.round(sum / div);
          const yOut = y - radius < 0 ? 0 : y - radius;
          const yIn = y + radius + 1 >= h ? h - 1 : y + radius + 1;
          sum += b[(yIn * w + x) * 4 + c] - b[(yOut * w + x) * 4 + c];
        }
      }
    }
  }
  // `a` holds the result after each full pass; `b` is scratch.
  return a;
}

export interface UnsharpOptions {
  /** Fraction of the high-pass detail added back (0.4 = mild). */
  amount?: number;
  radius?: number;
  /** Differences at or below this value are left alone (keeps noise from being amplified). */
  threshold?: number;
}

/**
 * Mild unsharp mask on the visible pixels. The blur is alpha-weighted (premultiplied), so
 * the transparent surroundings never bleed into the product's edge. In place.
 */
export function unsharpMask(rgba: Bytes, w: number, h: number, options: UnsharpOptions = {}): void {
  const { amount = 0.4, radius = 1, threshold = 3 } = options;
  if (amount <= 0 || radius <= 0) return;
  const n = w * h;
  const pm = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const a = rgba[p + 3];
    if (a === 0) continue;
    pm[p] = Math.round((rgba[p] * a) / 255);
    pm[p + 1] = Math.round((rgba[p + 1] * a) / 255);
    pm[p + 2] = Math.round((rgba[p + 2] * a) / 255);
    pm[p + 3] = a;
  }
  const blurred = boxBlurRgba(pm, w, h, radius, 2);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (rgba[p + 3] === 0) continue;
    const ab = blurred[p + 3];
    if (ab === 0) continue;
    for (let c = 0; c < 3; c++) {
      const orig = rgba[p + c];
      const bl = (blurred[p + c] * 255) / ab;
      const diff = orig - bl;
      if (diff > threshold || diff < -threshold) rgba[p + c] = Math.round(clamp255(orig + amount * diff));
    }
  }
}

export interface Layout {
  /** Scale applied to the source crop. */
  scale: number;
  /** Size of the drawn product. */
  dw: number;
  dh: number;
  /** Top-left corner of the drawn product. */
  dx: number;
  dy: number;
  /** Output side. */
  size: number;
}

/**
 * Catalog framing: the product's longer dimension spans `fill` of the square output side and the
 * product is centered, so the margins are uniform on every photo.
 */
export function catalogLayout(boxWidth: number, boxHeight: number, size: number, fill = CATALOG_FILL): Layout {
  const longest = Math.max(1, boxWidth, boxHeight);
  const scale = (size * fill) / longest;
  const dw = boxWidth * scale;
  const dh = boxHeight * scale;
  return { scale, dw, dh, dx: (size - dw) / 2, dy: (size - dh) / 2, size };
}

export interface ShadowGeometry {
  /** Ellipse center. */
  cx: number;
  cy: number;
  /** Ellipse radii. */
  rx: number;
  ry: number;
  opacity: number;
}

export interface ShadowOptions {
  opacity?: number;
  /** Half-width of the ellipse as a fraction of the product width. */
  widthRatio?: number;
  /** Half-height of the ellipse as a fraction of the product width. */
  heightRatio?: number;
  /** How far below the product's bottom edge the ellipse center sits, as a fraction of ry. */
  offsetRatio?: number;
}

/**
 * Soft contact shadow: a flat ellipse centered under the product, sitting just below its
 * bottom edge so it peeks out as a grounded "catalog" shadow. Always stays inside the canvas.
 */
export function contactShadowGeometry(layout: Layout, options: ShadowOptions = {}): ShadowGeometry {
  const { opacity = SHADOW_OPACITY, widthRatio = 0.46, heightRatio = 0.045, offsetRatio = 0.35 } = options;
  const cx = layout.dx + layout.dw / 2;
  const rx = Math.max(2, layout.dw * widthRatio);
  let ry = Math.max(3, layout.dw * heightRatio);
  const bottom = layout.dy + layout.dh;
  let cy = bottom + ry * offsetRatio;
  const maxBottom = layout.size - 1;
  if (cy + ry > maxBottom) {
    ry = Math.max(1, (maxBottom - bottom) / (1 + offsetRatio));
    cy = bottom + ry * offsetRatio;
  }
  return { cx, cy, rx, ry, opacity };
}
