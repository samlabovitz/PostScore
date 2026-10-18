import { describe, expect, test } from "vitest";
import { checkStatus, compareMetric, computeGaps, entryScore, heroSummary, isFullScored, metricValue, METRICS, rankBy } from "./competitorComparison";
import type { SavedCompetitorEntry, SavedCompetitorScan } from "./savedCompetitorScans";
import { breakdownFromChecks, type CheckResult, type ScoreBreakdown } from "./scoring";


// The engine's own shape: a check that couldn't be done has no points and
// an uncertain confidence, so the engine leaves it out.
function check(id: string, earned: number | null, max: number): CheckResult {
  return {
    id,
    label: id,
    category: id.split(".")[0] as CheckResult["category"],
    maxPoints: max,
    earnedPoints: earned,
    confidence: earned === null ? "UNCERTAIN" : "VERIFIED",
    explanation: "",
    meta: null,
  };
}
function entry(
  name: string,
  opts: {
    owner?: boolean;
    total: number;
    rating: number | null;
    reviews: number | null;
    photos: number | null;
    hours?: boolean;
    phone?: boolean;
    website?: boolean | null;
    distance?: number;
  }
): SavedCompetitorEntry {
  const yes = (b: boolean | undefined, max: number) => (b === false ? 0 : max);
  const checks = [
    check("visibility.rating", opts.rating === null ? null : opts.rating * 2, 10),
    check("visibility.review_count", opts.reviews === null ? null : Math.min(10, opts.reviews / 15), 10),
    check("completeness.phone", yes(opts.phone, 2), 2),
    check("completeness.address", 2, 2),
    check("completeness.hours", yes(opts.hours, 3), 3),
    check("completeness.website_link", opts.website ? 2 : 0, 2),
    check("completeness.categories", 1, 1),
    check("completeness.photos", opts.photos === null ? null : Math.min(4, opts.photos / 2.5), 4),
    check("completeness.business_status", 1, 1),
    check("website.has_website", opts.website === null ? null : opts.website ? 4 : 0, 4),
    check("website.https", opts.owner ? 6 : null, 6),
  ];
  return {
    placeId: name,
    name,
    isSubject: !!opts.owner,
    address: null,
    distanceMeters: opts.owner ? null : opts.distance ?? 1000,
    rating: opts.rating,
    reviewCount: opts.reviews,
    hasWebsite: opts.website ?? null,
    total: opts.total,
    grade: "C",
    scoringVersion: "1.9.0",
    breakdown: { ...breakdownFromChecks(checks), total: opts.total, grade: "C", scoringVersion: "1.9.0" } as ScoreBreakdown,
    priceLevel: null,
    photoCount: opts.photos,
    websiteUrl: opts.website ? "https://example.com" : null,
  };
}

// Modern Liquors-like: strong rating, few reviews, every listing field.
const OWNER = entry("Modern Liquors", { owner: true, total: 71, rating: 4.5, reviews: 15, photos: 10, website: true });
const SCAN: SavedCompetitorScan = {
  scanId: "s",
  createdAt: "2026-10-16T13:00:00Z",
  entries: [
    entry("Main Street Liquors", { total: 88, rating: 4.7, reviews: 104, photos: 10, phone: false, website: true, distance: 639 }),
    entry("Park N Shop", { total: 80, rating: 4.5, reviews: 107, photos: 10, website: false, distance: 1652 }),
    entry("Peddler's", { total: 79, rating: 4.4, reviews: 131, photos: 10, website: false, distance: 770 }),
    OWNER,
    entry("Newark Discount", { total: 60, rating: 3.8, reviews: 60, photos: 5, website: false, distance: 366 }),
  ],
};

describe("one full PostScore for everyone", () => {
  test("Overall ranks by each business's full PostScore; a category view ranks by that category's own score", () => {
    expect(rankBy(SCAN, "overall").map((r) => [r.entry.name, r.score])).toEqual([
      ["Main Street Liquors", 88],
      ["Park N Shop", 80],
      ["Peddler's", 79],
      ["Modern Liquors", 71],
      ["Newark Discount", 60],
    ]);
    const reviews = rankBy(SCAN, "reviews");
    expect(reviews.map((r) => r.score)).toEqual([...reviews.map((r) => r.score)].sort((x, y) => (y ?? -1) - (x ?? -1)));
    // 4.5★ but only 15 reviews: last on Reviews, even below a 3.8★ store with 60.
    expect(reviews.find((r) => r.entry.isSubject)!.rank).toBe(5);
  });

  test("a category score is the engine's own category score — the same number as the Overview's", () => {
    const website = OWNER.breakdown!.categories.find((c) => c.id === "website")!;
    expect(entryScore(OWNER, "website")).toBe(Math.round(website.relativeScore!));
    expect(entryScore(SCAN.entries[1], "website")).toBe(0); // no website
  });

  test("hero: the owner's PostScore, the local average WITHOUT the owner, #1, radius", () => {
    const h = heroSummary(SCAN, "overall");
    expect(h).toMatchObject({ rank: 4, of: 5, ownerScore: 71, localAverage: 77, topScore: 88, topName: "Main Street Liquors" });
    // (88 + 80 + 79 + 60) / 4 = 76.75 — the owner's 71 is not in it.
    expect(h.radiusMiles).toBeCloseTo(1652 / 1609.344, 3);
    expect(h).not.toHaveProperty("ownerFullScore");
  });

  test("a check that couldn't be done is left out — never 0, and never 100% from just having a site", () => {
    // Competitors in the fixture have no HTTPS result: their only website
    // fact is "has a website", so Website is couldn't-check (null) — not 100%.
    const comp = SCAN.entries[0];
    expect(comp.breakdown!.checks.find((c) => c.id === "website.https")!.earnedPoints).toBeNull();
    expect(entryScore(comp, "website")).toBeNull();
    // The owner has a measured HTTPS check, so its Website score is real.
    expect(entryScore(OWNER, "website")).toBe(100);
  });
});

describe("lead / trail come only from real, sizeable gaps", () => {
  const { leads, trails } = computeGaps(SCAN);

  test("trails on review count (15 vs ~100); leads on having a website (only 1 of 4 do)", () => {
    expect(trails.map((g) => g.metric.checkId)).toContain("visibility.review_count");
    expect(leads.map((g) => g.metric.checkId)).toContain("website.has_website");
  });

  test("'Website link on listing' and 'Has a website' (the same fact for competitors) appear once", () => {
    const ids = [...leads, ...trails].map((g) => g.metric.checkId);
    expect(ids).toContain("website.has_website");
    expect(ids).not.toContain("completeness.website_link");
  });

  test("a small rating difference (4.5 vs 4.35) is not a lead or a trail", () => {
    expect([...leads, ...trails].map((g) => g.metric.checkId)).not.toContain("visibility.rating");
  });

  test("equal values (photos 10 vs ~9) never become a gap", () => {
    expect([...leads, ...trails].map((g) => g.metric.checkId)).not.toContain("completeness.photos");
  });

  test("no gap is ever built from a missing value", () => {
    const missing: SavedCompetitorScan = {
      ...SCAN,
      entries: SCAN.entries.map((e) => (e.isSubject ? { ...e, reviewCount: null, rating: null } : e)),
    };
    const g = computeGaps(missing);
    expect([...g.leads, ...g.trails].map((x) => x.metric.checkId)).not.toContain("visibility.review_count");
    expect([...g.leads, ...g.trails].map((x) => x.metric.checkId)).not.toContain("visibility.rating");
  });
});

describe("'not checked' handling", () => {
  test("a missing value is null — never 0 — and is left out of the average", () => {
    const noPhotos = { ...SCAN.entries[0], photoCount: null };
    const photos = METRICS.find((m) => m.checkId === "completeness.photos")!;
    expect(metricValue(noPhotos, photos)).toBeNull();
    const scan = { ...SCAN, entries: [noPhotos, ...SCAN.entries.slice(1)] };
    const c = compareMetric(scan, photos);
    expect(c.sample).toBe(3); // 4 competitors, one not checked
    expect(c.average).toBeCloseTo((10 + 10 + 5) / 3);
  });

  test("website listed unknown stays unknown", () => {
    const m = METRICS.find((x) => x.checkId === "website.has_website")!;
    expect(metricValue({ ...SCAN.entries[0], hasWebsite: null, breakdown: null }, m)).toBeNull();
  });
});

describe("statuses and the within-1-point rule", () => {
  const fullScored = (e: SavedCompetitorEntry, reason: string | null): SavedCompetitorEntry => {
    const checks = e.breakdown!.checks.map((c) =>
      c.id === "website.has_website" ? { ...c, meta: { fullScore: "1", ...(reason ? { websiteNotChecked: reason } : {}) } } : c
    );
    return { ...e, breakdown: { ...breakdownFromChecks(checks), total: e.total, grade: e.grade ?? "C", scoringVersion: "1.11.0" } as ScoreBreakdown };
  };

  test("tied or within 1 point: the business whose website was fully checked ranks first", () => {
    const blocked = fullScored(entry("Blocked Deli", { total: 95, rating: 4.5, reviews: 50, photos: 5, website: true }), "blocked");
    const checked = { ...OWNER, total: 94 };
    const ranked = rankBy({ scanId: "t", createdAt: "2026-10-18T00:00:00Z", entries: [blocked, checked] }, "overall");
    expect(ranked.map((r) => r.entry.name)).toEqual(["Modern Liquors", "Blocked Deli"]);
    // Two points apart: the score decides.
    const far = rankBy({ scanId: "t", createdAt: "2026-10-18T00:00:00Z", entries: [{ ...blocked, total: 97 }, checked] }, "overall");
    expect(far[0].entry.name).toBe("Blocked Deli");
  });

  test("Not checked yet vs Couldn't check (with the reason) vs Not applicable", () => {
    const legacy = SCAN.entries[0];
    const https = (e: SavedCompetitorEntry) => e.breakdown!.checks.find((c) => c.id === "website.https")!;
    expect(checkStatus(legacy, https(legacy))).toEqual({ kind: "not_checked_yet" });
    const timedOut = fullScored(legacy, "timed_out");
    expect(checkStatus(timedOut, https(timedOut))).toEqual({ kind: "couldnt", reason: "timed_out" });
    const noSite = SCAN.entries[1];
    expect(checkStatus(noSite, https(noSite))).toEqual({ kind: "not_applicable" });
    expect(isFullScored(OWNER)).toBe(true);
  });
});
