import { describe, expect, it } from "vitest";
import { canOpenSale } from "./sale-access";

const sale = { sellerId: "s1", createdById: "s1", day: "2026-10-03" };

describe("canOpenSale", () => {
  it("lets an admin open any sale", () => {
    expect(canOpenSale({ id: "a", role: "admin" }, { ...sale, day: "2025-01-01" }, "2026-10-03")).toBe(true);
  });

  it("lets a seller open only today's sales they made or rang up", () => {
    expect(canOpenSale({ id: "s1", role: "seller" }, sale, "2026-10-03")).toBe(true);
    expect(canOpenSale({ id: "s2", role: "seller" }, { ...sale, createdById: "s2" }, "2026-10-03")).toBe(true);
    expect(canOpenSale({ id: "s1", role: "seller" }, sale, "2026-10-04")).toBe(false);
    expect(canOpenSale({ id: "s3", role: "seller" }, sale, "2026-10-03")).toBe(false);
  });

  it("never lets the warehouse role open sales", () => {
    expect(canOpenSale({ id: "s1", role: "warehouse" }, sale, "2026-10-03")).toBe(false);
  });
});
