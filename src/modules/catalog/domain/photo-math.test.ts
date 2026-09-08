import { describe, expect, it } from "vitest";
import {
  alphaBoundingBox,
  applyColorAdjustments,
  boxBlurRgba,
  buildLevelsLut,
  catalogLayout,
  channelMeans,
  contactShadowGeometry,
  erodeAlpha,
  featherAlpha,
  grayWorldGains,
  IDENTITY_LEVELS,
  levelsFromHistogram,
  luminanceHistogram,
  percentileFromHistogram,
  removeSmallIslands,
  unsharpMask,
} from "./photo-math";

/** Alpha mask with a filled rectangle. */
function maskWithRect(w: number, h: number, x0: number, y0: number, rw: number, rh: number, value = 255): Uint8Array {
  const alpha = new Uint8Array(w * h);
  for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) alpha[y * w + x] = value;
  return alpha;
}

/** RGBA image filled with one color; alpha 255 everywhere unless a mask is given. */
function solidImage(w: number, h: number, rgb: [number, number, number], alpha?: Uint8Array): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = rgb[0];
    rgba[i * 4 + 1] = rgb[1];
    rgba[i * 4 + 2] = rgb[2];
    rgba[i * 4 + 3] = alpha ? alpha[i] : 255;
  }
  return rgba;
}

describe("alphaBoundingBox", () => {
  it("finds the box of visible pixels and counts them", () => {
    const alpha = maskWithRect(20, 10, 3, 2, 5, 4);
    expect(alphaBoundingBox(alpha, 20, 10)).toEqual({ minX: 3, minY: 2, maxX: 7, maxY: 5, width: 5, height: 4, area: 20 });
  });

  it("ignores pixels at or below the threshold and returns null for an empty mask", () => {
    const alpha = maskWithRect(8, 8, 1, 1, 3, 3, 10);
    expect(alphaBoundingBox(alpha, 8, 8, 10)).toBeNull();
    expect(alphaBoundingBox(new Uint8Array(64), 8, 8)).toBeNull();
  });
});

describe("removeSmallIslands", () => {
  it("clears specks smaller than the minimum fraction and keeps the product", () => {
    const w = 40;
    const h = 40;
    const alpha = maskWithRect(w, h, 5, 5, 20, 20); // 400 px product
    alpha[38 * w + 38] = 255; // 1 px speck (0.25 % of the visible area: removed)
    alpha[2 * w + 30] = 255;
    alpha[2 * w + 31] = 255;
    alpha[2 * w + 32] = 255; // 3 px blob (404 visible px → minimum is ceil(2.02) = 3: kept)
    const result = removeSmallIslands(alpha, w, h, 10, 0.005);
    expect(result.removed).toBe(1);
    expect(result.kept).toBe(2);
    expect(alpha[38 * w + 38]).toBe(0);
    expect(alpha[2 * w + 30]).toBe(255);
    expect(result.area).toBe(403);
    expect(alphaBoundingBox(alpha, w, h)?.maxX).toBe(32);
  });

  it("uses 4-connectivity: diagonal pixels are separate blobs", () => {
    const w = 10;
    const alpha = maskWithRect(w, 10, 0, 0, 5, 5);
    alpha[5 * w + 5] = 255; // touches the square only diagonally
    const result = removeSmallIslands(alpha, w, 10, 10, 0.05);
    expect(result.removed).toBe(1);
    expect(alpha[5 * w + 5]).toBe(0);
  });

  it("does nothing on an empty mask", () => {
    const alpha = new Uint8Array(16);
    expect(removeSmallIslands(alpha, 4, 4)).toEqual({ removed: 0, kept: 0, area: 0 });
  });
});

describe("erodeAlpha and featherAlpha", () => {
  it("erodes one pixel from every edge of a solid square", () => {
    const alpha = maskWithRect(12, 12, 3, 3, 6, 6);
    erodeAlpha(alpha, 12, 12, 1);
    expect(alphaBoundingBox(alpha, 12, 12, 0)).toMatchObject({ minX: 4, minY: 4, maxX: 7, maxY: 7 });
    expect(alpha[5 * 12 + 5]).toBe(255);
  });

  it("feathers the edge into a ramp while the interior stays solid", () => {
    const w = 16;
    const alpha = maskWithRect(w, w, 4, 4, 8, 8);
    featherAlpha(alpha, w, w, 1, 2);
    const center = alpha[8 * w + 8];
    const edge = alpha[8 * w + 4];
    const outside = alpha[8 * w + 2];
    const farOutside = alpha[8 * w + 0];
    expect(center).toBe(255);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
    expect(outside).toBeGreaterThan(0);
    expect(outside).toBeLessThan(edge);
    expect(farOutside).toBe(0);
  });

  it("keeps a fully solid mask solid (edge replication, no darkening at the borders)", () => {
    const alpha = new Uint8Array(25).fill(255);
    featherAlpha(alpha, 5, 5, 1, 2);
    expect(Array.from(alpha).every((v) => v === 255)).toBe(true);
    erodeAlpha(alpha, 5, 5, 1);
    expect(Array.from(alpha).every((v) => v === 255)).toBe(true);
  });
});

describe("levels", () => {
  it("computes percentiles from a histogram", () => {
    const hist = new Uint32Array(256);
    hist[40] = 10;
    hist[100] = 80;
    hist[200] = 10;
    expect(percentileFromHistogram(hist, 0.01)).toBe(40);
    expect(percentileFromHistogram(hist, 0.5)).toBe(100);
    expect(percentileFromHistogram(hist, 0.99)).toBe(200);
    expect(percentileFromHistogram(new Uint32Array(256), 0.5)).toBe(0);
  });

  it("stretches the 1–99 % range and caps the gain", () => {
    // 1 000 pixels: exactly 1 % at 60 and 2 % at 220, so the 1st percentile is 60 and the 99th is 220.
    const hist = new_hist([
      [60, 10],
      [80, 490],
      [180, 480],
      [220, 20],
    ]);
    const levels = levelsFromHistogram(hist, { maxGain: 3 });
    expect(levels.low).toBe(60);
    expect(levels.high).toBe(220);
    expect(levels.gain).toBeCloseTo(255 / 160, 5);

    const capped = levelsFromHistogram(hist, { maxGain: 1.2 });
    expect(capped.gain).toBeCloseTo(1.2, 2);
    expect(Math.abs(capped.high - capped.low - 255 / 1.2)).toBeLessThanOrEqual(1);
    expect(capped.low).toBeGreaterThanOrEqual(0);
    expect(capped.high).toBeLessThanOrEqual(255);
    // the capped window stays centered on the original one
    expect((capped.low + capped.high) / 2).toBeCloseTo(140, 0);
  });

  it("leaves flat, tiny or already full-range images alone", () => {
    expect(levelsFromHistogram(new_hist([[120, 1000]]))).toEqual(IDENTITY_LEVELS);
    expect(levelsFromHistogram(new_hist([[10, 20]]))).toEqual(IDENTITY_LEVELS);
    expect(
      levelsFromHistogram(
        new_hist([
          [0, 500],
          [255, 500],
        ]),
      ),
    ).toEqual(IDENTITY_LEVELS);
  });

  it("builds a monotonic LUT hitting 0 and 255 at the ends", () => {
    const lut = buildLevelsLut(50, 200);
    expect(lut[0]).toBe(0);
    expect(lut[50]).toBe(0);
    expect(lut[200]).toBe(255);
    expect(lut[255]).toBe(255);
    expect(lut[125]).toBe(Math.round((75 * 255) / 150));
    for (let v = 1; v < 256; v++) expect(lut[v]).toBeGreaterThanOrEqual(lut[v - 1]);
  });

  it("only counts solid pixels in the histogram", () => {
    const alpha = new Uint8Array([255, 255, 100, 0]);
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 100, 40, 40, 40, 0]);
    const hist = luminanceHistogram(rgba, alpha);
    expect(hist[255]).toBe(1);
    expect(hist[0]).toBe(1);
    expect(hist[128]).toBe(0);
    expect(hist[40]).toBe(0);
  });

  function new_hist(entries: Array<[number, number]>): Uint32Array {
    const hist = new Uint32Array(256);
    for (const [bin, count] of entries) hist[bin] = count;
    return hist;
  }
});

describe("white balance", () => {
  it("returns unit gains for neutral gray", () => {
    expect(grayWorldGains({ r: 120, g: 120, b: 120, count: 10 })).toEqual({ r: 1, g: 1, b: 1 });
    expect(grayWorldGains({ r: 0, g: 0, b: 0, count: 0 })).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("cools down a warm cast with limited strength and clamped gains", () => {
    // chroma 20: full strength applies
    const gains = grayWorldGains({ r: 138, g: 128, b: 118, count: 10 }, { strength: 0.5, maxGain: 1.1 });
    expect(gains.r).toBeLessThan(1);
    expect(gains.b).toBeGreaterThan(1);
    expect(gains.g).toBeCloseTo(1, 2);
    // full correction would be gray/mean = 128/138 ≈ 0.928; half strength ≈ 0.964
    expect(gains.r).toBeCloseTo(1 + (128 / 138 - 1) * 0.5, 3);
    expect(gains.b).toBeLessThanOrEqual(1.1);
    expect(gains.r).toBeGreaterThanOrEqual(1 / 1.1);

    // a strong cast is clamped to ±10 %
    const strong = grayWorldGains({ r: 200, g: 120, b: 100, count: 10 }, { strength: 1, chromaNone: 500, chromaFull: 400 });
    expect(strong.r).toBeCloseTo(1 / 1.1, 5);
    expect(strong.b).toBeCloseTo(1.1, 5);

    // between chromaFull and chromaNone the correction fades linearly
    const faded = grayWorldGains({ r: 140, g: 128, b: 116, count: 10 }, { strength: 0.5, chromaFull: 20, chromaNone: 60 });
    expect(faded.r).toBeCloseTo(1 + (128 / 140 - 1) * 0.5 * 0.9, 5);
  });

  it("does not desaturate a colorful part (high chroma fades the correction out)", () => {
    const red = grayWorldGains({ r: 200, g: 60, b: 50, count: 10 });
    expect(red).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("computes channel means over solid pixels only", () => {
    const alpha = new Uint8Array([255, 255, 0]);
    const rgba = new Uint8ClampedArray([100, 50, 0, 255, 200, 150, 100, 255, 0, 0, 0, 0]);
    expect(channelMeans(rgba, alpha)).toEqual({ r: 150, g: 100, b: 50, count: 2 });
  });
});

describe("applyColorAdjustments", () => {
  it("applies LUT, gains and saturation to visible pixels and skips transparent ones", () => {
    const rgba = new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 0]);
    const lut = buildLevelsLut(50, 150);
    applyColorAdjustments(rgba, { lut, gains: { r: 1.1, g: 1, b: 0.9 } });
    // lut[100] = round(50*255/100) = 128 → r 141, g 128, b 115
    expect(Array.from(rgba.slice(0, 3))).toEqual([141, 128, 115]);
    expect(Array.from(rgba.slice(4, 7))).toEqual([100, 100, 100]);
  });

  it("boosts saturation around the luma without changing gray", () => {
    const rgba = new Uint8ClampedArray([200, 100, 100, 255, 90, 90, 90, 255]);
    applyColorAdjustments(rgba, { saturation: 1.08 });
    expect(rgba[0]).toBeGreaterThan(200);
    expect(rgba[1]).toBeLessThan(100);
    expect(Array.from(rgba.slice(4, 7))).toEqual([90, 90, 90]);
  });
});

describe("blur and unsharp mask", () => {
  it("box blur averages neighbours and preserves flat areas", () => {
    const w = 5;
    const src = solidImage(w, 5, [100, 100, 100]);
    src[(2 * w + 2) * 4] = 200; // bright red dot in the middle
    const out = boxBlurRgba(src, w, 5, 1, 1);
    expect(out[(2 * w + 2) * 4]).toBeCloseTo(100 + 100 / 9, -1);
    expect(out[(0 * w + 0) * 4]).toBe(100);
    expect(out[(2 * w + 2) * 4 + 1]).toBe(100);
  });

  it("increases local contrast at an edge and leaves flat regions and transparent pixels alone", () => {
    const w = 12;
    const h = 4;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        const v = x < 6 ? 80 : 160;
        rgba[p] = v;
        rgba[p + 1] = v;
        rgba[p + 2] = v;
        rgba[p + 3] = x === 11 ? 0 : 255;
      }
    }
    unsharpMask(rgba, w, h, { amount: 0.5, radius: 1, threshold: 2 });
    const left = rgba[(1 * w + 5) * 4];
    const right = rgba[(1 * w + 6) * 4];
    expect(left).toBeLessThan(80);
    expect(right).toBeGreaterThan(160);
    expect(rgba[(1 * w + 1) * 4]).toBe(80);
    expect(rgba[(1 * w + 11) * 4]).toBe(160); // transparent: untouched
  });

  it("does not darken the product edge next to transparent black pixels", () => {
    const w = 8;
    const h = 3;
    const rgba = new Uint8ClampedArray(w * h * 4); // transparent black everywhere...
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < 4; x++) {
        const p = (y * w + x) * 4;
        rgba[p] = 200;
        rgba[p + 1] = 200;
        rgba[p + 2] = 200;
        rgba[p + 3] = 255; // ...except a light gray block on the left
      }
    }
    unsharpMask(rgba, w, h, { amount: 0.5, radius: 1, threshold: 2 });
    expect(rgba[(1 * w + 3) * 4]).toBe(200);
  });
});

describe("catalogLayout", () => {
  it("scales the longer side to the fill fraction and centers with uniform margins", () => {
    const layout = catalogLayout(800, 400, 1200, 0.82);
    expect(layout.dw).toBeCloseTo(984, 5);
    expect(layout.dh).toBeCloseTo(492, 5);
    expect(layout.dx).toBeCloseTo(108, 5);
    expect(layout.dy).toBeCloseTo(354, 5);
    expect(layout.dx).toBeCloseTo(1200 - (layout.dx + layout.dw), 5);
    expect(layout.dy).toBeCloseTo(1200 - (layout.dy + layout.dh), 5);
  });

  it("handles tall crops and upscales small ones", () => {
    const tall = catalogLayout(100, 500, 1200);
    expect(tall.dh).toBeCloseTo(984, 5);
    expect(tall.dw).toBeCloseTo(196.8, 5);
    expect(tall.scale).toBeCloseTo(1.968, 5);
  });
});

describe("contactShadowGeometry", () => {
  it("centers the ellipse under the product just below its bottom edge, inside the canvas", () => {
    const layout = catalogLayout(800, 400, 1200);
    const s = contactShadowGeometry(layout);
    expect(s.cx).toBeCloseTo(600, 5);
    expect(s.cy).toBeGreaterThan(layout.dy + layout.dh);
    expect(s.cy - s.ry).toBeLessThan(layout.dy + layout.dh);
    expect(s.cy + s.ry).toBeLessThan(1200);
    expect(s.rx).toBeCloseTo(984 * 0.46, 5);
    expect(s.rx).toBeLessThan(layout.dw / 2);
    expect(s.opacity).toBe(0.18);
  });

  it("shrinks the ellipse when the product almost touches the bottom", () => {
    const layout = { scale: 1, dw: 1000, dh: 1180, dx: 100, dy: 10, size: 1200 };
    const s = contactShadowGeometry(layout);
    expect(s.cy + s.ry).toBeLessThanOrEqual(1199);
    expect(s.ry).toBeGreaterThan(0);
  });
});
