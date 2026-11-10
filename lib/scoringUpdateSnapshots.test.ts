import { describe, expect, test } from "vitest";

// A scoring update (scripts/rescore-all.ts: a re-score of the saved data
// with new scoring code) is PostScore's change, never the owner's: it
// isn't a gain or loss in "Since your last scan" or history, never uses
// up the daily re-scan or moves "last scan", and the Competitors page
// ranks the owner by their latest saved score (the real Colorful Yun Nan
// case: the score card said 80, the Competitors page the older 77).

import { isFullScan, isFullScanKind, isScoringUpdate } from "@/lib/websiteRecheckPolicy";
import { historyRows, type HistoryScan } from "@/lib/scoreHistory";
import { scoreChangeSinceLastScan } from "@/lib/overviewTiles";
import { groupSavedScans, rankPoint, withLatestOwnerScore, type SavedScanRow } from "@/lib/savedCompetitorScans";
import { forCompetitorComparison, scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";

describe("a scoring update is PostScore's change", () => {
  test("isScoringUpdate: a re-score of the same version, or a new version; never a guess from a missing version", () => {
    expect(isScoringUpdate("1.15.0", "1.15.0", "scoring_update")).toBe(true);
    expect(isScoringUpdate("1.13.1", "1.15.0", null)).toBe(true);
    expect(isScoringUpdate("1.15.0", "1.15.0", null)).toBe(false);
    expect(isScoringUpdate("1.15.0", "1.15.0", "website_recheck")).toBe(false);
    expect(isScoringUpdate(null, "1.15.0", null)).toBe(false);
  });

  test("never a full scan: the daily re-scan limit and “last scan” skip it (and website re-checks)", () => {
    expect(isFullScanKind("scoring_update")).toBe(false);
    expect(isFullScanKind("website_recheck")).toBe(false);
    expect(isFullScanKind(null)).toBe(true);
    expect(isFullScan({ scanKind: "scoring_update" })).toBe(false);
    expect(isFullScan({})).toBe(true);
  });

  test("Overview score card: “PostScore updated how it scores”, never a delta — even on the same version", () => {
    expect(scoreChangeSinceLastScan([{ total: 80, scoring_version: "1.15.0", scan_kind: "scoring_update" }, { total: 77, scoring_version: "1.15.0" }])).toEqual({ kind: "scoring_updated" });
    // The next real scan after it is the owner's own change again.
    expect(scoreChangeSinceLastScan([{ total: 82, scoring_version: "1.15.0" }, { total: 80, scoring_version: "1.15.0", scan_kind: "scoring_update" }])).toEqual({ kind: "delta", delta: 2 });
  });

  test("history: the scoring-update row has no gain or loss; the scans around it do", () => {
    const scan = (id: string, createdAt: string, total: number, scanKind: string | null = null): HistoryScan => ({ id, total, grade: "B", createdAt, scoringVersion: "1.15.0", scanKind, categories: null });
    const rows = historyRows([scan("a", "2026-11-01T14:00:00Z", 79), scan("b", "2026-11-05T14:00:00Z", 77), scan("u", "2026-11-10T02:00:00Z", 80, "scoring_update"), scan("c", "2026-11-11T14:00:00Z", 81)], "all", new Date("2026-11-12T00:00:00Z"));
    expect(rows.map((r) => [r.id, r.changeFromPrevious, r.scoringUpdated])).toEqual([
      ["c", 1, false],
      ["u", null, true],
      ["b", -2, false],
      ["a", null, false],
    ]);
  });
});

describe("Competitors: the owner on their latest saved score, like for like", () => {
  const strong = scoreBusiness(scoringInput());
  const weaker = scoreBusiness(scoringInput({ rating: 3.4, reviewCount: 6 }));
  const row = (name: string, isSubject: boolean, total: number): SavedScanRow => ({
    scan_id: "s1", created_at: "2026-10-17T17:25:32Z", is_subject: isSubject, place_id: name, name, address: null,
    distance_meters: isSubject ? null : 400, rating: 4.6, review_count: 50, has_website: true, total, grade: "B",
    scoring_version: "1.13.1", breakdown_json: weaker, price_level: null, photo_count: 10,
  });
  const scan = groupSavedScans([row("Colorful Yun Nan", true, 77), row("Rival A", false, 85), row("Rival B", false, 79)])[0];

  test("number, rank and chart dot follow the latest saved score; competitors keep theirs", () => {
    expect(rankPoint(scan)).toMatchObject({ rank: 3, score: 77 });
    const latest = { ...strong, scanKind: "scoring_update" as const };
    const updated = withLatestOwnerScore(scan, latest, "en");
    const comparable = forCompetitorComparison(strong);
    const owner = updated.entries.find((e) => e.isSubject)!;
    expect(owner.total).toBe(comparable.total);
    // Like for like: no "No broken links or dead pages" — competitors aren't link-checked.
    expect(owner.breakdown!.checks.some((c) => c.id === "website.links")).toBe(false);
    expect(updated.entries.filter((e) => !e.isSubject).map((e) => e.total)).toEqual([85, 79]);
    expect(rankPoint(updated)).toMatchObject({ rank: 1, score: comparable.total });
    expect(updated.entries[0].isSubject).toBe(true);
  });

  test("no saved score (or no owner row): the scan is unchanged", () => {
    expect(withLatestOwnerScore(scan, null, "en")).toBe(scan);
    const noOwner = groupSavedScans([row("Rival A", false, 85)])[0];
    expect(withLatestOwnerScore(noOwner, strong, "en")).toBe(noOwner);
  });
});
