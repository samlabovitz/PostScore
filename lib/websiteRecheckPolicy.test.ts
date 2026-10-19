import { describe, expect, test } from "vitest";
import { isFullScan, websiteCheckChanges, websiteRecheckAvailability, websiteScoreOf } from "./websiteRecheckPolicy";
import type { CheckResult, ScoreBreakdown } from "./scoring";

const check = (id: string, earned: number | null, max = 6, confidence: CheckResult["confidence"] = "VERIFIED") =>
  ({ id, label: id, earnedPoints: earned, maxPoints: max, confidence, explanation: "" }) as unknown as CheckResult;
const breakdown = (checks: CheckResult[], website: number | null = 60, version = "v1"): ScoreBreakdown =>
  ({ scoringVersion: version, total: 70, grade: "C", checks, categories: [{ id: "website", relativeScore: website }] }) as unknown as ScoreBreakdown;

describe("3 website re-checks per business per local day", () => {
  const NY = "America/New_York";
  test("counts only today's re-checks in the business's time zone", () => {
    const now = new Date("2026-10-19T15:00:00Z"); // 11 am in New York
    expect(websiteRecheckAvailability([], now, NY)).toEqual({ used: 0, left: 3, allowed: true });
    const today = ["2026-10-19T13:00:00Z", "2026-10-19T14:00:00Z"];
    expect(websiteRecheckAvailability(today, now, NY)).toEqual({ used: 2, left: 1, allowed: true });
    // 11 pm yesterday in New York (03:00 UTC today) is yesterday.
    expect(websiteRecheckAvailability([...today, "2026-10-19T03:00:00Z"], now, NY).used).toBe(2);
    expect(websiteRecheckAvailability([...today, "2026-10-19T14:30:00Z"], now, NY)).toEqual({ used: 3, left: 0, allowed: false });
  });

  test("a re-check isn't a full scan (the daily full re-scan ignores it)", () => {
    expect(isFullScan({ scanKind: "website_recheck" })).toBe(false);
    expect(isFullScan({})).toBe(true);
    expect(isFullScan(null)).toBe(true);
  });
});

describe("what changed", () => {
  test("status moves and whole-point changes, biggest first; non-website checks ignored", () => {
    const before = breakdown([check("website.content_depth", 3), check("website.https", 0, 4), check("website.social_links", 2), check("listing.hours", 0)]);
    const after = breakdown([check("website.content_depth", 6), check("website.https", 4, 4), check("website.social_links", 2), check("listing.hours", 5)], 72);
    const changes = websiteCheckChanges(before, after);
    expect(changes.map((c) => [c.checkId, c.from, c.to, c.points])).toEqual([
      ["website.https", "needs_work", "done", 4],
      ["website.content_depth", "needs_work", "done", 3],
    ]);
    expect(websiteScoreOf(after)).toBe(72);
  });

  test("couldn't check → done is a status move with no invented points", () => {
    const changes = websiteCheckChanges(breakdown([check("website.performance_mobile", null, 10, "NOT_FOUND")]), breakdown([check("website.performance_mobile", 10, 10)]));
    expect(changes).toEqual([expect.objectContaining({ from: "couldnt_check", to: "done", points: 0 })]);
  });

  test("nothing changed → empty", () => {
    const b = breakdown([check("website.https", 4, 4)]);
    expect(websiteCheckChanges(b, b)).toEqual([]);
    expect(websiteCheckChanges(null, b)).toEqual([]);
  });
});
