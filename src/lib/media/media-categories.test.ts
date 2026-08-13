import { describe, expect, it } from "vitest";
import { aggregateCategoryCounts } from "./media-categories";

describe("aggregateCategoryCounts", () => {
  it("returns zeroed counts for no rows", () => {
    expect(aggregateCategoryCounts([])).toEqual({
      byId: {},
      uncategorized: 0,
      total: 0,
    });
  });

  it("counts per category and uncategorized", () => {
    const result = aggregateCategoryCounts([
      { category_id: "a" },
      { category_id: "a" },
      { category_id: "b" },
      { category_id: null },
      { category_id: null },
    ]);
    expect(result.byId).toEqual({ a: 2, b: 1 });
    expect(result.uncategorized).toBe(2);
    expect(result.total).toBe(5);
  });

  it("treats empty-string ids as uncategorized", () => {
    const result = aggregateCategoryCounts([
      { category_id: "" },
      { category_id: "x" },
    ]);
    expect(result.uncategorized).toBe(1);
    expect(result.byId).toEqual({ x: 1 });
  });
});
