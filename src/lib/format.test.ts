import { describe, expect, it } from "vitest";
import { parseLocalizedNumber } from "./format";

describe("parseLocalizedNumber", () => {
  it("reads es-VE thousands and comma decimals", () => {
    expect(parseLocalizedNumber("52.000")).toBe("52000");
    expect(parseLocalizedNumber("1.234.567")).toBe("1234567");
    expect(parseLocalizedNumber("1.234,56")).toBe("1234.56");
    expect(parseLocalizedNumber("0,125")).toBe("0.125");
    expect(parseLocalizedNumber("12,5")).toBe("12.5");
  });

  it("reads dot decimals", () => {
    expect(parseLocalizedNumber("12.50")).toBe("12.50");
    expect(parseLocalizedNumber("1.5")).toBe("1.5");
    expect(parseLocalizedNumber("1,234.56")).toBe("1234.56");
  });

  it("never reads a leading zero group as thousands", () => {
    expect(parseLocalizedNumber("0.125")).toBe("0.125");
    expect(parseLocalizedNumber("0.250")).toBe("0.250");
    expect(parseLocalizedNumber("-0.500")).toBe("-0.500");
  });

  it("reads a dot as decimal when the groups are not valid thousands", () => {
    expect(parseLocalizedNumber("1234.567")).toBe("1234.567");
    expect(parseLocalizedNumber("12.3456")).toBe("12.3456");
  });

  it("handles plain, empty and invalid input", () => {
    expect(parseLocalizedNumber("  42 ")).toBe("42");
    expect(parseLocalizedNumber("-3")).toBe("-3");
    expect(parseLocalizedNumber("")).toBeNull();
    expect(parseLocalizedNumber("-")).toBeNull();
    expect(parseLocalizedNumber("abc")).toBeNull();
  });
});
