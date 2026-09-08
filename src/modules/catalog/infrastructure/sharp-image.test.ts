import { describe, expect, it } from "vitest";
import { centerMargins, fitDimensions, fitOnWhiteSquare, loadSharp, makeThumbBuffer, solidPng } from "./sharp-image";

describe("server framing math", () => {
  it("scales the longer side to 82 % of the square", () => {
    expect(fitDimensions(1000, 500, 1200, 0.82)).toEqual({ width: 984, height: 492 });
    expect(fitDimensions(300, 900, 1200, 0.82)).toEqual({ width: 328, height: 984 });
    expect(fitDimensions(0, 0, 1200, 0.82)).toEqual({ width: 984, height: 984 });
  });

  it("centers with integer margins that add up to the canvas", () => {
    const m = centerMargins(984, 492, 1200);
    expect(m).toEqual({ top: 354, bottom: 354, left: 108, right: 108 });
    const odd = centerMargins(985, 491, 1200);
    expect(odd.left + odd.right + 985).toBe(1200);
    expect(odd.top + odd.bottom + 491).toBe(1200);
    expect(Math.abs(odd.left - odd.right)).toBeLessThanOrEqual(1);
  });
});

// sharp is an optional dependency of Next; these run only where it can be loaded.
const sharp = loadSharp();

describe.skipIf(!sharp)("sharp post-processing", () => {
  it("fits a generated image on a white 1200×1200 WebP and builds a thumbnail", async () => {
    const s = sharp!;
    // A 400×200 scene: white margins around a 200×100 dark gray "part".
    const part = await solidPng(s, 200, 100, "#404040");
    const scene = await s(part).extend({ top: 50, bottom: 50, left: 100, right: 100, background: "#ffffff" }).png().toBuffer();

    const fitted = await fitOnWhiteSquare(s, scene);
    expect(fitted.contentType).toBe("image/webp");
    const meta = await s(fitted.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(1200);

    // Trimming the white again must leave the part spanning 82 % of the side (984×492).
    const cropped = await s(await s(fitted.data).png().toBuffer())
      .trim({ background: "#ffffff", threshold: 24 })
      .png()
      .toBuffer();
    const cmeta = await s(cropped).metadata();
    expect(cmeta.width).toBe(984);
    expect(cmeta.height).toBe(492);

    const thumb = await makeThumbBuffer(s, fitted.data);
    const tmeta = await s(thumb.data).metadata();
    expect(tmeta.width).toBe(300);
    expect(tmeta.height).toBe(300);
    expect(tmeta.format).toBe("webp");
  });
});
