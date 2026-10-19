import { describe, expect, test } from "vitest";
import {
  AREA_SEARCH_CACHE_DAYS,
  SEARCH_DEMAND_EXAMPLE,
  areaSearchCacheKey,
  bucketDaily,
  funnelOf,
  isAreaCacheFresh,
  isBrandedKeyword,
  keywordTrend,
  parseInsightsValue,
  seoTips,
  topKeywords,
  visibilityShare,
  type DailyMetricPoint,
  type SearchKeyword,
} from "./searchDemand";

const kw = (keyword: string, ...values: Array<number | null>): SearchKeyword => ({
  keyword,
  months: values.map((v, i) => ({ month: `2026-0${1 + i}`, count: v === null ? { kind: "fewer_than", threshold: 15 } : { kind: "exact", value: v } })),
});

describe("Google's InsightsValue", () => {
  test("exact values and the '<15' threshold, never a made-up number", () => {
    expect(parseInsightsValue({ value: "123" })).toEqual({ kind: "exact", value: 123 });
    expect(parseInsightsValue({ threshold: "15" })).toEqual({ kind: "fewer_than", threshold: 15 });
    expect(parseInsightsValue({})).toBeNull();
    expect(parseInsightsValue({ value: "abc" })).toBeNull();
    expect(parseInsightsValue(null)).toBeNull();
  });
});

describe("funnel", () => {
  const points: DailyMetricPoint[] = [
    { date: "2026-09-14", metric: "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", value: 100 }, // Monday
    { date: "2026-09-15", metric: "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", value: 50 },
    { date: "2026-09-20", metric: "CALL_CLICKS", value: 3 }, // Sunday, same week
    { date: "2026-09-21", metric: "WEBSITE_CLICKS", value: 4 }, // next Monday
    { date: "2026-09-21", metric: "BUSINESS_DIRECTION_REQUESTS", value: 5 },
    { date: "2026-10-01", metric: "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", value: 10 },
  ];

  test("weekly buckets start on Monday", () => {
    const weeks = bucketDaily(points, "weekly");
    expect(weeks.map((w) => [w.start, w.end])).toEqual([
      ["2026-09-14", "2026-09-20"],
      ["2026-09-21", "2026-09-27"],
      ["2026-09-28", "2026-10-04"],
    ]);
    expect(weeks[0]).toMatchObject({ views: { search: 100, maps: 50 }, calls: 3 });
  });

  test("monthly buckets and conversion = actions ÷ views", () => {
    const [sep, oct] = bucketDaily(points, "monthly");
    expect([sep.start, sep.end, oct.start]).toEqual(["2026-09-01", "2026-09-30", "2026-10-01"]);
    expect(funnelOf(sep)).toEqual({ views: 150, actions: 12, conversion: 12 / 150 });
  });

  test("no views → no conversion rate (never 0%)", () => {
    const [week] = bucketDaily([{ date: "2026-09-14", metric: "CALL_CLICKS", value: 2 }], "weekly");
    expect(funnelOf(week).conversion).toBeNull();
  });
});

describe("keywords", () => {
  test("top 10 by the latest month; hidden counts sort below every exact count", () => {
    const list = [kw("a", 5, 20), kw("b", 1, null), kw("c", 1, 300), ...Array.from({ length: 10 }, (_, i) => kw(`z${i}`, 1, 16 + i))];
    const top = topKeywords(list);
    expect(top).toHaveLength(10);
    expect(top[0].keyword).toBe("c");
    expect(top.map((k) => k.keyword)).not.toContain("b");
  });

  test("trend only between two exact months", () => {
    expect(keywordTrend(kw("x", 100, 130))).toBe("up");
    expect(keywordTrend(kw("x", 100, 80))).toBe("down");
    expect(keywordTrend(kw("x", 100, 105))).toBe("flat");
    expect(keywordTrend(kw("x", null, 105))).toBeNull();
    expect(keywordTrend(kw("x", 105))).toBeNull();
  });

  test("branded search = every distinctive word of the name", () => {
    expect(isBrandedKeyword("modern liquors newark", "Modern Liquors")).toBe(true);
    expect(isBrandedKeyword("liquors near me", "Modern Liquors")).toBe(false);
  });
});

describe("area searches", () => {
  test("cache key per business type + city, fresh for 30 days", () => {
    expect(areaSearchCacheKey("liquor_store", " Newark ", "DE")).toBe("liquor_store|newark|de");
    const now = new Date("2026-10-19T00:00:00Z");
    expect(AREA_SEARCH_CACHE_DAYS).toBe(30);
    expect(isAreaCacheFresh("2026-09-20T00:00:00Z", now)).toBe(true);
    expect(isAreaCacheFresh("2026-09-18T00:00:00Z", now)).toBe(false);
  });

  test("visibility share: a single estimate, a range from ranges, capped at 100", () => {
    expect(visibilityShare(500, [{ keyword: "a", volume: { kind: "estimate", value: 1000 } }])).toEqual({ low: 50, high: 50 });
    expect(visibilityShare(500, [{ keyword: "a", volume: { kind: "range", low: 1000, high: 10000 } }])).toEqual({ low: 5, high: 50 });
    expect(visibilityShare(5000, [{ keyword: "a", volume: { kind: "estimate", value: 1000 } }])).toEqual({ low: 100, high: 100 });
    expect(visibilityShare(0, [{ keyword: "a", volume: { kind: "estimate", value: 1000 } }])).toBeNull();
    expect(visibilityShare(500, [])).toBeNull();
  });
});

describe("SEO tips", () => {
  test("tied to real keywords: missing 'wine', name-heavy, top keyword", () => {
    const tips = seoTips({
      keywords: [kw("modern liquors", 400, 600), kw("liquor store near me", 100, 200)],
      area: [
        { keyword: "liquor store near me", volume: { kind: "estimate", value: 3000 } },
        { keyword: "wine store newark de", volume: { kind: "estimate", value: 900 } },
      ],
      businessName: "Modern Liquors",
      city: "Newark",
      region: "DE",
    });
    expect(tips).toHaveLength(3);
    expect(tips[0]).toEqual({ kind: "missing_term", term: "wine", searchedAs: "wine store newark de", link: "website_services" });
    expect(tips[1]).toEqual({ kind: "branded_heavy", percent: 75, link: "listing_categories" });
    expect(tips[2]).toEqual({ kind: "use_top_keyword", keyword: "liquor store near me", link: "website_content" });
  });

  test("no data → no tips", () => {
    expect(seoTips({ keywords: [], area: [], businessName: "X", city: null })).toEqual([]);
  });

  test("the example is marked as an example and yields the 'wine' tip", () => {
    expect(SEARCH_DEMAND_EXAMPLE.example).toBe(true);
    const tips = seoTips({ ...SEARCH_DEMAND_EXAMPLE, area: SEARCH_DEMAND_EXAMPLE.area!.searches });
    expect(tips[0]).toMatchObject({ kind: "missing_term", term: "wine" });
  });
});
