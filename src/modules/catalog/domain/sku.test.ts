import { describe, expect, it } from "vitest";
import { formatSku, isValidSku, normalizeSku, parseSkuSequence } from "./sku";

describe("sku", () => {
  it("formats sequential SKUs with the LP- prefix and six digits", () => {
    expect(formatSku(1)).toBe("LP-000001");
    expect(formatSku(123456)).toBe("LP-123456");
    expect(formatSku(1234567)).toBe("LP-1234567");
    expect(() => formatSku(0)).toThrow();
  });

  it("parses the sequence back only from generated SKUs", () => {
    expect(parseSkuSequence("LP-000042")).toBe(42);
    expect(parseSkuSequence("EMB-123")).toBeNull();
    expect(parseSkuSequence("LP-")).toBeNull();
  });

  it("normalizes custom SKUs", () => {
    expect(normalizeSku("  emb 123 ")).toBe("EMB-123");
    expect(normalizeSku("")).toBeNull();
    expect(normalizeSku(undefined)).toBeNull();
    expect(isValidSku("EMB-123.A_1")).toBe(true);
    expect(isValidSku("-BAD")).toBe(false);
    expect(isValidSku("BAD SKU")).toBe(false);
  });
});
