import { describe, expect, it } from "vitest";
import {
  addDays,
  dayEndExclusive,
  dayOf,
  dayStart,
  describeRange,
  diffDays,
  eachDay,
  endOfMonth,
  isIsoDay,
  parseDateRange,
  presetRange,
  previousRange,
  startOfWeek,
} from "./date-range";

describe("date-range", () => {
  it("does day arithmetic on yyyy-MM-dd strings", () => {
    expect(addDays("2026-09-08", -29)).toBe("2026-08-10");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-08-10", "2026-09-08")).toBe(29);
    expect(eachDay("2026-09-06", "2026-09-08")).toEqual(["2026-09-06", "2026-09-07", "2026-09-08"]);
    expect(eachDay("2026-09-08", "2026-09-06")).toEqual([]);
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(startOfWeek("2026-09-08")).toBe("2026-09-07"); // Tuesday -> Monday
    expect(startOfWeek("2026-09-06")).toBe("2026-08-31"); // Sunday -> previous Monday
  });

  it("validates ISO days", () => {
    expect(isIsoDay("2026-09-08")).toBe(true);
    expect(isIsoDay("2026-02-30")).toBe(false);
    expect(isIsoDay("08/09/2026")).toBe(false);
    expect(isIsoDay(undefined)).toBe(false);
  });

  it("converts business days to instants in America/Caracas (UTC-4)", () => {
    expect(dayStart("2026-09-08").toISOString()).toBe("2026-09-08T04:00:00.000Z");
    expect(dayEndExclusive("2026-09-08").toISOString()).toBe("2026-09-09T04:00:00.000Z");
    // 01:30 UTC on the 9th is still the 8th in Caracas.
    expect(dayOf(new Date("2026-09-09T01:30:00.000Z"))).toBe("2026-09-08");
    expect(dayOf(new Date("2026-09-09T04:00:00.000Z"))).toBe("2026-09-09");
  });

  it("builds preset ranges and the previous period", () => {
    const today = "2026-09-08";
    expect(presetRange("today", today)).toEqual({ from: today, to: today });
    expect(presetRange("yesterday", today)).toEqual({ from: "2026-09-07", to: "2026-09-07" });
    expect(presetRange("week", today)).toEqual({ from: "2026-09-07", to: today });
    expect(presetRange("month", today)).toEqual({ from: "2026-09-01", to: today });
    expect(presetRange("last_month", today)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(presetRange("last_30", today)).toEqual({ from: "2026-08-10", to: today });
    expect(previousRange({ from: "2026-09-01", to: "2026-09-08" })).toEqual({ from: "2026-08-24", to: "2026-08-31" });
  });

  it("parses search params with sane fallbacks", () => {
    const today = "2026-09-08";
    expect(parseDateRange({}, today)).toEqual({ from: "2026-09-01", to: today, preset: "month" });
    expect(parseDateRange({ preset: "today" }, today)).toEqual({ from: today, to: today, preset: "today" });
    expect(parseDateRange({ from: "2026-08-01", to: "2026-08-15" }, today)).toEqual({ from: "2026-08-01", to: "2026-08-15", preset: "custom" });
    // reversed or invalid dates fall back to the default preset
    expect(parseDateRange({ from: "2026-08-15", to: "2026-08-01" }, today).preset).toBe("month");
    expect(parseDateRange({ from: "nope", to: "2026-08-01" }, today).preset).toBe("month");
    expect(describeRange({ from: "2026-09-01", to: "2026-09-08" })).toBe("Del 01/09/2026 al 08/09/2026");
    expect(describeRange({ from: "2026-09-08", to: "2026-09-08" })).toBe("08/09/2026");
  });
});
