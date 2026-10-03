import { describe, expect, it } from "vitest";
import { isTrivialPin, lockMessage, lockMinutes, PIN_REQUESTER_POLICY } from "./throttle";

describe("throttle policy", () => {
  it("makes each consecutive lock four times longer, up to a day", () => {
    expect([0, 1, 2, 3, 4, 9].map((n) => lockMinutes(PIN_REQUESTER_POLICY, n))).toEqual([15, 60, 240, 960, 1440, 1440]);
  });

  it("tells how long to wait", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    expect(lockMessage(new Date("2026-10-03T12:14:10Z"), now)).toBe("Demasiados intentos fallidos. Intenta de nuevo en 15 min.");
    expect(lockMessage(new Date("2026-10-03T16:00:00Z"), now)).toBe("Demasiados intentos fallidos. Intenta de nuevo en 4 h.");
  });

  it("flags PINs anyone would try first", () => {
    for (const pin of ["0000", "1111", "1234", "4321", "123456", "987654"]) expect(isTrivialPin(pin)).toBe(true);
    for (const pin of ["2580", "1357", "7391", "120934"]) expect(isTrivialPin(pin)).toBe(false);
  });
});
