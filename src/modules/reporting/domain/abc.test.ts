import { describe, expect, it } from "vitest";
import { classifyAbc } from "./abc";

describe("classifyAbc", () => {
  it("splits A/B/C by cumulative revenue share", () => {
    const cls = classifyAbc([
      { id: "a", revenue: 800 },
      { id: "b", revenue: 150 },
      { id: "c", revenue: 40 },
      { id: "d", revenue: 10 },
      { id: "e", revenue: 0 },
    ]);
    expect(cls.get("a")).toBe("A");
    expect(cls.get("b")).toBe("B");
    expect(cls.get("c")).toBe("C");
    expect(cls.get("d")).toBe("C");
    expect(cls.get("e")).toBe("C");
  });

  it("keeps the top seller in A even when it holds all the revenue", () => {
    const cls = classifyAbc([
      { id: "only", revenue: "600.0000" },
      { id: "none", revenue: 0 },
    ]);
    expect(cls.get("only")).toBe("A");
    expect(cls.get("none")).toBe("C");
  });

  it("returns C for everything when nothing sold", () => {
    const cls = classifyAbc([
      { id: "x", revenue: 0 },
      { id: "y", revenue: 0 },
    ]);
    expect([...cls.values()]).toEqual(["C", "C"]);
  });

  it("classifies the item that crosses the 80 % line as A", () => {
    // 50 + 35 = 85 %: the second item starts at 50 % (< 80 %) so it is still A.
    const cls = classifyAbc([
      { id: "p", revenue: 50 },
      { id: "q", revenue: 35 },
      { id: "r", revenue: 15 },
    ]);
    expect(cls.get("p")).toBe("A");
    expect(cls.get("q")).toBe("A");
    expect(cls.get("r")).toBe("B"); // starts at 85 % (< 95 %)
  });
});
