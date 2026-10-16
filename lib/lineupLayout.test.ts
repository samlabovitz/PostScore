import { describe, expect, test } from "vitest";
import { estimateLabelWidth, layoutLabels, shortName } from "./lineupLayout";

function overlaps(a: { lane: string; left: number; width: number }, b: { lane: string; left: number; width: number }) {
  return a.lane === b.lane && a.left < b.left + b.width && b.left < a.left + a.width;
}

describe("lineup labels never overlap", () => {
  test("four labels pointing at nearly the same spot on a 343px phone strip", () => {
    const reqs = [
      { key: "you", anchor: 150, width: 60, prefer: "below" as const },
      { key: "top", anchor: 160, width: 140, prefer: "above" as const },
      { key: "low", anchor: 145, width: 140, prefer: "above" as const },
      { key: "avg", anchor: 155, width: 120, prefer: "below" as const },
    ];
    const placed = layoutLabels(reqs, 343);
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) expect(overlaps(placed[i], placed[j])).toBe(false);
    for (const p of placed) {
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.left + p.width).toBeLessThanOrEqual(343);
    }
  });

  test("labels near the edges stay inside the strip", () => {
    const [left, right] = layoutLabels(
      [
        { key: "a", anchor: 2, width: 100, prefer: "above" },
        { key: "b", anchor: 340, width: 100, prefer: "above" },
      ],
      343
    );
    expect(left.left).toBe(0);
    expect(right.left + right.width).toBe(343);
  });

  test("long names are shortened (full name goes in a tooltip)", () => {
    expect(shortName("Creekside Spirits (Discount Liquor Store)")).toBe("Creekside Spiri…");
    expect(shortName("Peddler's")).toBe("Peddler's");
    expect(estimateLabelWidth("#1 Main Street Liquors · 89")).toBeGreaterThan(150);
  });
});
