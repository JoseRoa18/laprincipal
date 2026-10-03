import { describe, expect, it } from "vitest";
import { hidesExpected } from "./count-visibility";

describe("hidesExpected", () => {
  it("hides only open blind counts that were not revealed", () => {
    expect(hidesExpected({ status: "open", blind: true, revealedAt: null })).toBe(true);
    expect(hidesExpected({ status: "open", blind: true, revealedAt: new Date() })).toBe(false);
    expect(hidesExpected({ status: "open", blind: false, revealedAt: null })).toBe(false);
    expect(hidesExpected({ status: "applied", blind: true, revealedAt: null })).toBe(false);
    expect(hidesExpected({ status: "cancelled", blind: true, revealedAt: null })).toBe(false);
  });
});
