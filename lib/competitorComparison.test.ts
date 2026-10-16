import { describe, expect, test } from "vitest";
import { compareMetric, computeGaps, entryScore, heroSummary, metricValue, METRICS, rankBy } from "./competitorComparison";
import type { SavedCompetitorEntry, SavedCompetitorScan } from "./savedCompetitorScans";
import type { ScoreBreakdown } from "./scoring";

function check(id: string, earned: number | null, max: number) {
  return { id, earnedPoints: earned, maxPoints: max };
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
    breakdown: { total: opts.total, grade: "C", scoringVersion: "1.9.0", categories: [], checks } as unknown as ScoreBreakdown,
    priceLevel: null,
    photoCount: opts.photos,
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

describe("category re-ranking", () => {
  test("Overall ranks by the COMPARABLE score; Reviews and Website re-rank by that category's comparable checks", () => {
    // Same checks for everyone: the owner is #2 here, not #4 as its full
    // PostScore (71, with website checks competitors never get) suggested.
    expect(rankBy(SCAN, "overall").map((r) => [r.entry.name, r.score])).toEqual([
      ["Main Street Liquors", 89],
      ["Modern Liquors", 80],
      ["Peddler's", 61],
      ["Park N Shop", 58],
      ["Newark Discount", 45],
    ]);
    // Website compares only "website listed" (owner's HTTPS etc. never count).
    expect(rankBy(SCAN, "website").slice(0, 2).map((r) => r.entry.name).sort()).toEqual(["Main Street Liquors", "Modern Liquors"]);
    const reviews = rankBy(SCAN, "reviews");
    expect(reviews[0].entry.name).toBe("Peddler's");
    // 4.5★ but only 15 reviews: last on Reviews, even below a 3.8★ store with 60.
    expect(reviews.find((r) => r.entry.isSubject)!.rank).toBe(5);
  });

  test("the owner's full website checks don't inflate its Website score — same checks for everyone", () => {
    expect(entryScore(OWNER, "website")).toBe(100); // has_website only
    expect(entryScore(SCAN.entries[1], "website")).toBe(0);
  });

  test("hero: comparable score, full PostScore for context only, local average WITHOUT the owner, #1, radius", () => {
    const h = heroSummary(SCAN, "overall");
    expect(h).toMatchObject({ rank: 2, of: 5, ownerScore: 80, ownerFullScore: 71, localAverage: 63, topScore: 89, topName: "Main Street Liquors" });
    // (89 + 61 + 58 + 45) / 4 = 63 — the owner's 80 is not in it.
    expect(h.radiusMiles).toBeCloseTo(1652 / 1609.344, 3);
  });
});

describe("fairness: everyone is compared on the same checks", () => {
  test("the owner's extra website checks (e.g. HTTPS, scored only for the owner) never count", () => {
    const withoutExtra = { ...OWNER, breakdown: { ...OWNER.breakdown!, checks: OWNER.breakdown!.checks.filter((c) => c.id !== "website.https") } };
    expect(entryScore(OWNER, "overall")).toBe(entryScore(withoutExtra, "overall"));
    expect(entryScore(OWNER, "overall")).not.toBe(OWNER.total);
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
