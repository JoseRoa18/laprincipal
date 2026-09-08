import { describe, expect, it } from "vitest";
import { aiImagePath, aiThumbPath, candidatePaths, imageBasePath, isAiImagePath, newAiStamp } from "./photo-paths";

describe("photo paths", () => {
  const base = imageBasePath("p1", "i1");

  it("builds the AI file names with a stamp", () => {
    const stamp = newAiStamp(1_700_000_000_000);
    expect(stamp).toBe((1_700_000_000_000).toString(36));
    expect(aiImagePath(base, stamp)).toBe(`products/p1/i1-ai-${stamp}.webp`);
    expect(aiThumbPath(base, stamp)).toBe(`products/p1/i1-ai-${stamp}-thumb.webp`);
    expect(aiImagePath(base, stamp, "jpg")).toBe(`products/p1/i1-ai-${stamp}.jpg`);
  });

  it("detects AI versions and not the cut-out, the original or the AI thumbnail", () => {
    expect(isAiImagePath("products/p1/i1-ai-abc123.webp")).toBe(true);
    expect(isAiImagePath("products/p1/i1-ai-abc123.jpg")).toBe(true);
    expect(isAiImagePath("products/p1/i1-processed.webp")).toBe(false);
    expect(isAiImagePath("products/p1/i1-original.jpg")).toBe(false);
    expect(isAiImagePath("products/p1/i1-ai-abc123-thumb.webp")).toBe(false);
    expect(isAiImagePath(null)).toBe(false);
    expect(isAiImagePath("")).toBe(false);
  });

  it("lists the candidate cut-out and thumbnail paths in probe order", () => {
    expect(candidatePaths(base, "processed")).toEqual(["products/p1/i1-processed.webp", "products/p1/i1-processed.jpg", "products/p1/i1-processed.png"]);
    expect(candidatePaths(base, "thumb")[0]).toBe("products/p1/i1-thumb.webp");
  });
});
