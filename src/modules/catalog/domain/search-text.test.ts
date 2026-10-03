import { describe, expect, it } from "vitest";
import { buildSearchText, compactCode, normalizeSearch, searchPatterns } from "./search-text";

describe("normalizeSearch", () => {
  it("lower-cases, strips accents and collapses spaces", () => {
    expect(normalizeSearch("  Refrigeración   Embraco ")).toBe("refrigeracion embraco");
    expect(normalizeSearch("Ñandú")).toBe("nandu");
  });

  it("compacts codes", () => {
    expect(compactCode("EMB-123 A")).toBe("emb123a");
  });
});

describe("buildSearchText", () => {
  it("includes every searchable field, normalized", () => {
    const text = buildSearchText({
      name: "Compresor Embraco 1/3 HP",
      sku: "EMB-123",
      brandName: "Embraco",
      categoryName: "Compresores",
      equivalenceCodes: ["FFI12HBX", null],
      compatibilities: [{ applianceType: "Nevera", brand: "Mabe", model: "RMS-400" }],
      barcodes: ["7591234567890"],
    });
    expect(text).toContain("compresor embraco 1/3 hp");
    expect(text).toContain("emb-123");
    expect(text).toContain("emb123");
    expect(text).toContain("compresores");
    expect(text).toContain("ffi12hbx");
    expect(text).toContain("nevera mabe rms-400");
    expect(text).toContain("rms400");
    expect(text).toContain("7591234567890");
  });

  it("skips empty values and duplicates", () => {
    const text = buildSearchText({ name: "Relé", sku: "RELE", brandName: null, equivalenceCodes: ["rele", "RELE"] });
    expect(text).toBe("rele");
  });
});

describe("searchPatterns", () => {
  it("splits the search into words that must all appear, in any order", () => {
    expect(searchPatterns("Compresor  1/3")).toEqual(["%compresor%", "%1/3%"]);
    expect(searchPatterns("TÉRMOSTATO mabe")).toEqual(["%termostato%", "%mabe%"]);
  });

  it("matches % and _ literally", () => {
    expect(searchPatterns("50% off_x")).toEqual([String.raw`%50\%%`, String.raw`%off\_x%`]);
  });
});
