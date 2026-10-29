import { describe, expect, test } from "vitest";
import { shortName, DISPLAY_NAME_MAX } from "@/lib/displayName";
import { reviewGoalText } from "@/lib/reviewGoal";

// Long names (a keyword-stuffed Google listing) shortened for display with
// "…" — the stored name never changes.

const STUFFED = "Hair Extension Sew ins Weave Microlinks Hair Extensions Tape in Crochet Box Braids Wigs White Plains Peekskill Yonkers";

describe("long business names", () => {
  test("over 40 characters: cut on a word with '…'; short names untouched", () => {
    const s = shortName(STUFFED);
    expect(s.length).toBeLessThanOrEqual(DISPLAY_NAME_MAX);
    expect(s).toBe("Hair Extension Sew ins Weave Microlinks…");
    expect(shortName("Hair and Makeup Lounge by Angela")).toBe("Hair and Makeup Lounge by Angela");
    expect(shortName("Law Offices of Hal M. Garfinkel LLC | Chicago Criminal Attorney")).toBe("Law Offices of Hal M. Garfinkel LLC…");
    expect(shortName(null)).toBe("");
  });

  test("the review goal line uses the short name", () => {
    const goal = { kind: "beat", average: 60, leader: { name: STUFFED, reviewCount: 142 }, ownCount: 30, gap: 112, nextUp: null, runnerUp: null } as never;
    const text = JSON.stringify(reviewGoalText(goal, "hair salons nearby", "en"));
    expect(text).toContain("Hair Extension Sew ins Weave Microlinks…");
    expect(text).not.toContain("Yonkers");
  });
});
