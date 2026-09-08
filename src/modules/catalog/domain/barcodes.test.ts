import { describe, expect, it } from "vitest";
import {
  detectBarcodeType,
  ean13CheckDigit,
  generateInternalBarcode,
  isValidBarcodeText,
  isValidEan13,
  isValidUpc,
  normalizeBarcode,
  parseInternalSequence,
  upcCheckDigit,
} from "./barcodes";

describe("ean13CheckDigit", () => {
  it("computes the GS1 check digit", () => {
    expect(ean13CheckDigit("400638133393")).toBe(1); // 4006381333931
    expect(ean13CheckDigit("590123412345")).toBe(7); // 5901234123457
    expect(ean13CheckDigit("200000000001")).toBe(5);
  });

  it("rejects inputs that are not 12 digits", () => {
    expect(() => ean13CheckDigit("12345")).toThrow();
    expect(() => ean13CheckDigit("40063813339A")).toThrow();
  });

  it("validates full codes", () => {
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("4006381333932")).toBe(false);
    expect(isValidEan13("400638133393")).toBe(false);
  });
});

describe("upc", () => {
  it("computes and validates UPC-A check digits", () => {
    expect(upcCheckDigit("03600029145")).toBe(2);
    expect(isValidUpc("036000291452")).toBe(true);
    expect(isValidUpc("036000291453")).toBe(false);
  });
});

describe("generateInternalBarcode", () => {
  it("builds 20 + 10-digit sequence + check digit", () => {
    expect(generateInternalBarcode(1)).toBe("2000000000015");
    expect(generateInternalBarcode(1)).toHaveLength(13);
    expect(isValidEan13(generateInternalBarcode(1))).toBe(true);
    expect(isValidEan13(generateInternalBarcode(123456))).toBe(true);
    expect(generateInternalBarcode(123456).startsWith("200000123456")).toBe(true);
  });

  it("rejects out-of-range sequences", () => {
    expect(() => generateInternalBarcode(0)).toThrow();
    expect(() => generateInternalBarcode(1.5)).toThrow();
    expect(() => generateInternalBarcode(10_000_000_000)).toThrow();
  });

  it("round-trips the sequence", () => {
    for (const n of [1, 42, 999, 123456, 9_999_999_999]) {
      expect(parseInternalSequence(generateInternalBarcode(n))).toBe(n);
    }
    expect(parseInternalSequence("4006381333931")).toBeNull();
    expect(parseInternalSequence("2000000000016")).toBeNull();
  });
});

describe("detectBarcodeType", () => {
  it("detects EAN-13, UPC-A and falls back to Code 128", () => {
    expect(detectBarcodeType("4006381333931")).toBe("EAN13");
    expect(detectBarcodeType("036000291452")).toBe("UPC");
    expect(detectBarcodeType("EMB-123")).toBe("CODE128");
    expect(detectBarcodeType("4006381333932")).toBe("CODE128");
  });

  it("normalizes and validates typed codes", () => {
    expect(normalizeBarcode(" 4006 3813 33931 ")).toBe("4006381333931");
    expect(isValidBarcodeText("ABC-123")).toBe(true);
    expect(isValidBarcodeText("AB")).toBe(false);
    expect(isValidBarcodeText("con espacio")).toBe(false);
    expect(isValidBarcodeText("ñandú")).toBe(false);
  });
});
