import { describe, expect, test } from "vitest";
import {
  dailyPoints,
  groupOverlappingMarkers,
  hasEnoughForLine,
  historyRows,
  inRange,
  parseChartCategories,
  summarizeRange,
  versionMarkerIndexes,
  zoomedDomain,
  type HistoryScan,
} from "./scoreHistory";
import { calendarDaysAgo, zonedDayKey } from "./i18n/format";

const NOW = new Date("2026-10-16T16:00:00.000Z"); // noon in New York

function scan(id: string, createdAt: string, total: number, scoringVersion: string | null = "1.9.0"): HistoryScan {
  return { id, total, grade: total >= 80 ? "B" : total >= 70 ? "C" : "D", createdAt, scoringVersion, categories: null };
}

describe("one point per day (the day's latest scan)", () => {
  test("Sep 7 ×4 becomes one point carrying the latest score and the count", () => {
    const scans = [
      scan("a", "2026-09-07T14:00:00Z", 70),
      scan("b", "2026-09-07T15:00:00Z", 73),
      scan("c", "2026-09-07T18:00:00Z", 74),
      scan("d", "2026-09-07T21:30:00Z", 76),
      scan("e", "2026-09-08T14:00:00Z", 75),
    ];
    const points = dailyPoints(scans);
    expect(points.map((p) => [p.dayKey, p.total, p.scansThatDay])).toEqual([
      ["2026-09-07", 76, 4],
      ["2026-09-08", 75, 1],
    ]);
  });

  test("days are business-local (New York), not UTC: 11pm ET on the 7th stays on the 7th", () => {
    // 2026-09-08T03:00Z is 11pm on Sep 7 in New York.
    const points = dailyPoints([scan("a", "2026-09-07T14:00:00Z", 70), scan("b", "2026-09-08T03:00:00Z", 72)]);
    expect(points).toHaveLength(1);
    expect(points[0].total).toBe(72);
  });

  test("input order doesn't matter", () => {
    const points = dailyPoints([scan("b", "2026-09-08T14:00:00Z", 75), scan("a", "2026-09-07T14:00:00Z", 70)]);
    expect(points.map((p) => p.dayKey)).toEqual(["2026-09-07", "2026-09-08"]);
  });
});

describe("range filtering", () => {
  const scans = [
    scan("old", "2025-09-01T14:00:00Z", 60),
    scan("y", "2026-03-01T14:00:00Z", 65),
    scan("q", "2026-08-01T14:00:00Z", 70),
    scan("m", "2026-10-01T14:00:00Z", 72),
    scan("w", "2026-10-15T14:00:00Z", 74),
  ];
  test("30 days / 90 days / 1 year / all time", () => {
    expect(inRange(scans, "30d", NOW).map((s) => s.id)).toEqual(["m", "w"]);
    expect(inRange(scans, "90d", NOW).map((s) => s.id)).toEqual(["q", "m", "w"]);
    expect(inRange(scans, "1y", NOW).map((s) => s.id)).toEqual(["y", "q", "m", "w"]);
    expect(inRange(scans, "all", NOW)).toHaveLength(5);
  });
});

describe("empty state", () => {
  test("fewer than two days of scans can't draw a line — even with several scans on one day", () => {
    expect(hasEnoughForLine(dailyPoints([]))).toBe(false);
    expect(hasEnoughForLine(dailyPoints([scan("a", "2026-10-15T14:00:00Z", 70), scan("b", "2026-10-15T18:00:00Z", 71)]))).toBe(false);
    expect(hasEnoughForLine(dailyPoints([scan("a", "2026-10-14T14:00:00Z", 70), scan("b", "2026-10-15T18:00:00Z", 71)]))).toBe(true);
  });
});

describe("scoring-version markers", () => {
  test("a marker wherever the saved version changed between plotted days", () => {
    const points = dailyPoints([
      scan("a", "2026-10-01T14:00:00Z", 76, "1.7.0"),
      scan("b", "2026-10-05T14:00:00Z", 75, "1.7.0"),
      scan("c", "2026-10-12T14:00:00Z", 74, "1.8.0"),
      scan("d", "2026-10-16T14:00:00Z", 71, "1.9.0"),
    ]);
    expect(versionMarkerIndexes(points)).toEqual([2, 3]);
  });

  test("a missing version is never guessed as a change", () => {
    const points = dailyPoints([
      scan("a", "2026-10-01T14:00:00Z", 76, "1.7.0"),
      scan("b", "2026-10-05T14:00:00Z", 75, null),
      scan("c", "2026-10-12T14:00:00Z", 74, "1.8.0"),
    ]);
    expect(versionMarkerIndexes(points)).toEqual([]);
  });
});

describe("change summary", () => {
  test("first → last, best (latest on a tie), scan count, and 'includes a scoring update'", () => {
    const scans = [
      scan("a", "2026-09-07T14:00:00Z", 74, "1.7.0"),
      scan("b", "2026-09-07T20:00:00Z", 76, "1.7.0"),
      scan("c", "2026-09-20T14:00:00Z", 76, "1.7.0"),
      scan("d", "2026-10-16T14:00:00Z", 71, "1.9.0"),
    ];
    const summary = summarizeRange(dailyPoints(scans), scans.length)!;
    expect(summary).toMatchObject({ first: 76, last: 71, change: -5, includesScoringUpdate: true, scanCount: 4 });
    expect(summary.best).toEqual({ total: 76, createdAt: "2026-09-20T14:00:00Z" });
  });

  test("no scoring update inside the range → no note", () => {
    const scans = [scan("a", "2026-10-01T14:00:00Z", 70), scan("b", "2026-10-10T14:00:00Z", 73)];
    expect(summarizeRange(dailyPoints(scans), 2)!.includesScoringUpdate).toBe(false);
    expect(summarizeRange([], 0)).toBeNull();
  });
});

describe("zoomed y-axis", () => {
  test("a 70–76 history zooms to 60–80 (ticks every 5) instead of 0–100", () => {
    expect(zoomedDomain([70, 76, 72])).toEqual({ min: 60, max: 80, ticks: [60, 65, 70, 75, 80] });
  });
  test("a wide spread uses ticks every 10", () => {
    expect(zoomedDomain([40, 95])).toEqual({ min: 30, max: 100, ticks: [30, 40, 50, 60, 70, 80, 90, 100] });
  });
  test("never goes below 0 or above 100", () => {
    expect(zoomedDomain([98, 100])).toMatchObject({ max: 100 });
    expect(zoomedDomain([0, 3])).toMatchObject({ min: 0 });
  });
});

describe("scan history rows", () => {
  test("newest first; change from the scan before (even one outside the range); 'Scoring updated' tag", () => {
    const scans = [
      scan("old", "2026-06-01T14:00:00Z", 70, "1.6.0"),
      scan("a", "2026-09-07T14:00:00Z", 74, "1.7.0"),
      scan("b", "2026-10-16T14:00:00Z", 71, "1.9.0"),
    ];
    const rows = historyRows(scans, "90d", NOW);
    expect(rows.map((r) => [r.id, r.changeFromPrevious, r.scoringUpdated])).toEqual([
      ["b", -3, true],
      ["a", 4, true],
    ]);
    expect(historyRows(scans, "all", NOW).at(-1)).toMatchObject({ id: "old", changeFromPrevious: null, scoringUpdated: false });
  });
});

describe("saved category scores", () => {
  test("maps the engine's categories to Google listing / Website / Reviews with points of weight", () => {
    const cats = parseChartCategories([
      { id: "visibility", relativeScore: 86.76, weight: 40 },
      { id: "completeness", relativeScore: 100, weight: 30 },
      { id: "website", relativeScore: 81.6, weight: 30 },
    ])!;
    expect(cats.listing).toEqual({ percent: 100, points: 30, weight: 30 });
    expect(cats.reviews.points).toBe(34.7);
    expect(cats.website.points).toBe(24.5);
  });
  test("anything missing → null (the 'By category' toggle hides)", () => {
    expect(parseChartCategories(null)).toBeNull();
    expect(parseChartCategories([{ id: "website", relativeScore: 80, weight: 30 }])).toBeNull();
  });
});

describe("shared date helpers", () => {
  test("zonedDayKey and calendarDaysAgo use New York calendar days", () => {
    expect(zonedDayKey("2026-10-16T03:00:00Z")).toBe("2026-10-15");
    expect(calendarDaysAgo("2026-10-16T13:00:00Z", NOW)).toBe(0);
    expect(calendarDaysAgo("2026-10-16T03:00:00Z", NOW)).toBe(1);
    expect(calendarDaysAgo("2026-10-12T14:00:00Z", NOW)).toBe(4);
  });
});

describe("overlapping 'Scoring updated' labels", () => {
  test("markers closer than one label's width share a label; far-apart ones keep their own", () => {
    expect(groupOverlappingMarkers([100, 140, 400], 110)).toEqual([[0, 1], [2]]);
    expect(groupOverlappingMarkers([100, 300, 500], 110)).toEqual([[0], [1], [2]]);
    expect(groupOverlappingMarkers([100, 150, 205], 110)).toEqual([[0, 1, 2]]); // within one label of the group's first
    expect(groupOverlappingMarkers([100, 150, 215], 110)).toEqual([[0, 1], [2]]);
    expect(groupOverlappingMarkers([], 110)).toEqual([]);
  });
});
