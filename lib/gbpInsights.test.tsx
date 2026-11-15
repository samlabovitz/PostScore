import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// Day 22B step 2: Google's monthly numbers. Everything here runs on saved
// sample API JSON (lib/fixtures/gbp-performance/) — no live Google calls.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/actions/gbpCustomerDetails", () => ({ applyCustomerDetailsAction: vi.fn(), loadCustomerDetailsEditorAction: vi.fn(), undoCustomerDetailsAction: vi.fn() }));
vi.mock("@/app/actions/gbpWebsiteLink", () => ({ openWebsiteLinkFix: vi.fn(), applyWebsiteLinkFix: vi.fn(), undoWebsiteLinkFix: vi.fn() }));
vi.mock("@/app/actions/gbpProfileEdits", () => ({ openProfileEdits: vi.fn(async () => ({ status: "error" })), applyProfileEditAction: vi.fn(), undoProfileEditAction: vi.fn() }));
vi.mock("@/app/actions/gbpInsights", () => ({ syncGoogleNumbers: vi.fn(async () => ({ status: "busy" })) }));
vi.mock("@/app/actions/gbpOrderLink", () => ({ openOrderLink: vi.fn(async () => ({ status: "error" })), applyOrderLinkAction: vi.fn(), undoOrderLinkAction: vi.fn() }));
const tokens = vi.hoisted(() => ({ calls: [] as string[], refreshed: false }));
vi.mock("@/lib/gbpTokens.server", () => ({
  getValidAccessTokenWithClient: vi.fn(async () => ({ status: "ok", accessToken: tokens.refreshed ? "fresh-token" : "stale-token" })),
  markGbpReconnect: vi.fn(async () => {
    tokens.refreshed = true;
    tokens.calls.push("refresh");
    return { status: "error", reason: "failed" };
  }),
}));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { GoogleProfileTab, type GoogleProfileTabProps } from "@/components/gbp/GoogleProfileTab";
import { parseAverageVisit } from "@/lib/averageVisit";
import { conversionRate, monotonePath, per100Change, rateChart, rateTrend } from "@/lib/googleProfileTab";
import {
  actions,
  addMonths,
  audience,
  callsByDays,
  computerViews,
  fromRow,
  insightsStateFor,
  leftOnTable,
  roundMoney,
  worthRange,
  isSmallMonth,
  lastFullMonth,
  mapsViews,
  monthlyTotals,
  monthRange,
  percentsTo100,
  phoneViews,
  searchViews,
  takeaway,
  toRow,
  topKeywords,
  totalViews,
  worth,
  type InsightsMonth,
  type KeywordsResponse,
  type MultiDailyResponse,
} from "./gbpInsights";
import { dailyMetricsUrl, keywordsUrl, monthsToSync, runInsightsFetchWithClient } from "./gbpInsights.server";
import { checkRange, percentText } from "./gbpInsightsCheck";

const fixture = <T,>(name: string): T => JSON.parse(readFileSync(`lib/fixtures/gbp-performance/${name}`, "utf8")) as T;
const DAILY = fixture<MultiDailyResponse>("daily-2026-08-to-10.json");
const KEYWORDS = fixture<KeywordsResponse>("keywords-2026-10.json");

const month = (m: string, views: [number, number, number, number], over: Partial<InsightsMonth> = {}): InsightsMonth => ({
  month: m,
  viewsSearchMobile: views[0],
  viewsMapsMobile: views[1],
  viewsSearchDesktop: views[2],
  viewsMapsDesktop: views[3],
  calls: 10,
  directions: 5,
  bookings: 2,
  websiteClicks: 3,
  conversations: 0,
  foodOrders: 0,
  callsByWeekday: null,
  topKeywords: null,
  ...over,
});

describe("Google's responses → monthly totals (no daily rows kept)", () => {
  test("the daily series summed per month; a day with no value is 0; days outside the range are ignored", () => {
    const rows = monthlyTotals(DAILY, ["2026-09", "2026-10"]);
    expect(rows.map((r) => r.month)).toEqual(["2026-09", "2026-10"]);
    const oct = rows[1];
    // Worked out independently from the fixture's own rules.
    expect(oct).toMatchObject({ viewsSearchMobile: 449, viewsMapsMobile: 186, viewsSearchDesktop: 78, viewsMapsDesktop: 6, calls: 36, directions: 10, websiteClicks: 7, bookings: 2 });
    // August is in the response but not asked for.
    expect(rows.find((r) => r.month === "2026-08")).toBeUndefined();
  });

  test("calls by weekday, from the daily calls before they're summed (Sunday first)", () => {
    const oct = monthlyTotals(DAILY, ["2026-10"])[0];
    expect(oct.callsByWeekday).toEqual([0, 0, 8, 8, 10, 5, 5]);
    expect(oct.callsByWeekday!.reduce((a, b) => a + b, 0)).toBe(oct.calls);
    expect(callsByDays([oct])).toEqual({ groups: { midweek: 26, weekend: 10, sunMon: 0 }, top: "midweek" });
  });

  test("search terms: real counts only, biggest first (terms under Google's threshold are left out)", () => {
    expect(topKeywords([KEYWORDS], 5)).toEqual([
      { term: "hair salon tarrytown", count: 212 },
      { term: "hair express", count: 140 },
      { term: "balayage near me", count: 61 },
      { term: "hair color sleepy hollow", count: 23 },
      { term: "curly cut", count: 18 },
    ]);
    expect(topKeywords([KEYWORDS]).some((k) => k.term === "blowout sleepy hollow")).toBe(false);
    expect(topKeywords([{}])).toEqual([]);
  });

  test("rows round-trip: what's saved is exactly the monthly totals", () => {
    const oct = { ...monthlyTotals(DAILY, ["2026-10"])[0], topKeywords: topKeywords([KEYWORDS], 5) };
    const row = toRow("b1", oct, "2026-11-01T06:00:00Z");
    expect(row.month).toBe("2026-10-01");
    expect(Object.keys(row).sort()).toEqual(["bookings", "business_id", "calls", "calls_by_weekday", "conversations", "directions", "fetched_at", "food_orders", "month", "top_keywords", "views_maps_desktop", "views_maps_mobile", "views_search_desktop", "views_search_mobile", "website_clicks"]);
    expect(fromRow(row)).toEqual(oct);
  });

  test("the request URLs: every metric and the whole month range in one call; one month of search terms", () => {
    const url = new URL(dailyMetricsUrl("locations/123", ["2025-05", "2026-10"]));
    expect(url.pathname).toBe("/v1/locations/123:fetchMultiDailyMetricsTimeSeries");
    expect(url.searchParams.getAll("dailyMetrics")).toContain("BUSINESS_IMPRESSIONS_DESKTOP_MAPS");
    expect(url.searchParams.getAll("dailyMetrics")).toHaveLength(10);
    expect(url.searchParams.getAll("dailyMetrics")).toEqual(expect.arrayContaining(["BUSINESS_CONVERSATIONS", "BUSINESS_FOOD_ORDERS"]));
    expect([url.searchParams.get("dailyRange.start_date.month"), url.searchParams.get("dailyRange.start_date.day"), url.searchParams.get("dailyRange.end_date.month"), url.searchParams.get("dailyRange.end_date.day")]).toEqual(["5", "1", "10", "31"]);
    const kw = new URL(keywordsUrl("locations/123", "2026-02"));
    expect(kw.pathname).toBe("/v1/locations/123/searchkeywords/impressions/monthly");
    expect([kw.searchParams.get("monthlyRange.start_month.month"), kw.searchParams.get("monthlyRange.end_month.month")]).toEqual(["2", "2"]);
  });

  test("months: the last full month, the 18 for a backfill, and the year before", () => {
    expect(lastFullMonth(new Date("2026-11-01T06:00:00Z"))).toBe("2026-10");
    expect(lastFullMonth(new Date("2027-01-15T12:00:00Z"))).toBe("2026-12");
    const eighteen = monthRange("2026-10", 18);
    expect([eighteen[0], eighteen[17], eighteen.length]).toEqual(["2025-05", "2026-10", 18]);
    expect(addMonths("2026-10", -12)).toBe("2025-10");
  });
});

describe("Phase A: interactions, the empty-state rule, the check script's math", () => {
  test("interactions = calls + directions + website clicks + bookings + messages + food orders (Google's own sum)", () => {
    const m = month("2026-10", [400, 200, 80, 24], { calls: 31, directions: 27, websiteClicks: 14, bookings: 11, conversations: 4, foodOrders: 2 });
    expect(actions(m)).toBe(89);
    expect(conversionRate(actions(m), totalViews(m))).toBe(12.6);
    // Messages and food orders come from their own daily series.
    const parsed = monthlyTotals({ multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [
      { dailyMetric: "BUSINESS_CONVERSATIONS", timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 3 }, value: "2" }, { date: { year: 2026, month: 10, day: 9 }, value: "1" }] } },
      { dailyMetric: "BUSINESS_FOOD_ORDERS", timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 3 }, value: "5" }] } },
      { dailyMetric: "BUSINESS_BOOKINGS", timeSeries: { datedValues: [{ date: { year: 2026, month: 10, day: 3 }, value: "1" }] } },
    ] }] }, ["2026-10"])[0];
    expect([parsed.conversations, parsed.foodOrders, parsed.bookings, actions(parsed)]).toEqual([3, 5, 1, 9]);
  });

  test("the live Hair Express numbers (Jun 1 – Nov 14, 2026) add up the way Google's Performance screen does", () => {
    // What Google returned in the live check, by metric.
    const by = { BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 351, BUSINESS_CONVERSATIONS: 0, BUSINESS_IMPRESSIONS_MOBILE_MAPS: 749, BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 171, CALL_CLICKS: 159, BUSINESS_BOOKINGS: 0, WEBSITE_CLICKS: 170, BUSINESS_DIRECTION_REQUESTS: 326, BUSINESS_FOOD_ORDERS: 0, BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 1820 };
    const m = month("2026-11", [by.BUSINESS_IMPRESSIONS_MOBILE_SEARCH, by.BUSINESS_IMPRESSIONS_MOBILE_MAPS, by.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH, by.BUSINESS_IMPRESSIONS_DESKTOP_MAPS], { calls: 159, directions: 326, websiteClicks: 170, bookings: 0, conversations: 0, foodOrders: 0 });
    expect(totalViews(m)).toBe(3091);
    expect(actions(m)).toBe(655);
    expect(percentsTo100([1820, 749, 351, 171])).toEqual([59, 24, 11, 6]);
  });

  test("the empty state depends only on whether the last full month is stored — never on when Google was connected", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    // Connected today, 18 months stored → numbers.
    expect(insightsStateFor(monthRange("2026-10", 18), null, now)).toBe("ready");
    expect(insightsStateFor(["2026-10"], null, now)).toBe("ready");
    // Nothing stored (or only older months) → load them now.
    expect(insightsStateFor([], null, now)).toBe("sync");
    expect(insightsStateFor(["2026-08", "2026-09"], "2026-11-01T00:00:00Z", now)).toBe("sync");
    // A sync in the last 6 hours found Google had nothing → the true empty state.
    expect(insightsStateFor([], "2026-11-15T10:00:00Z", now)).toBe("none");
  });

  test("which months a sync reads: all 18 when nothing is stored, else only the missing ones", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    expect(monthsToSync([], now)).toHaveLength(18);
    expect(monthsToSync([], now)[17]).toBe("2026-10");
    expect(monthsToSync(["2026-07", "2026-08"], now)).toEqual(["2026-09", "2026-10"]);
    expect(monthsToSync(["2026-10"], now)).toEqual([]);
  });

  test("check-insights: the range ends yesterday at the latest, compared with the same dates a year earlier", () => {
    const r = checkRange("2026-06", "2026-11", new Date("2026-11-15T12:00:00Z"));
    expect(r.label).toBe("2026-06-01 … 2026-11-14");
    expect(r.lastYearLabel).toBe("2025-06-01 … 2025-11-14");
    expect(checkRange("2026-06", "2026-10", new Date("2026-11-15T12:00:00Z")).label).toBe("2026-06-01 … 2026-10-31");
    expect(percentText(3091, 3536)).toBe("−12.6%");
    expect(percentText(655, 513)).toBe("+27.7%");
    expect(percentText(5, 0)).toBe("no comparison");
  });

  test("“Who saw you”: interactions and their change vs the same months last year", () => {
    const year = monthRange("2026-10", 18).map((m, i) => month(m, [100, 50, 20, 10], i < 12 ? { calls: 5, directions: 5, websiteClicks: 0, bookings: 0 } : { calls: 6, directions: 6, websiteClicks: 0, bookings: 0 }));
    const a = audience(year)!;
    expect(a.interactions).toBe(72);
    expect(a.interactionsVsLastYear).toBe(20);
    expect(audience(year.slice(-6))!.interactionsVsLastYear).toBeNull();
  });
});

describe("the numbers on the tab", () => {
  test("conversion rate = (calls + directions + bookings + website clicks) ÷ total views, 1 decimal; 0 views → none", () => {
    const m = month("2026-10", [400, 200, 80, 24], { calls: 31, directions: 27, bookings: 11, websiteClicks: 14 });
    expect(totalViews(m)).toBe(704);
    expect(actions(m)).toBe(83);
    expect(conversionRate(actions(m), totalViews(m))).toBe(11.8);
    expect(conversionRate(actions(month("2026-10", [0, 0, 0, 0])), 0)).toBeNull();
  });

  test("the totals are sums of the four view columns", () => {
    const m = month("2026-10", [1820, 749, 351, 171]);
    expect(totalViews(m)).toBe(3091);
    expect([mapsViews(m), searchViews(m), phoneViews(m), computerViews(m)]).toEqual([920, 2171, 2569, 522]);
    expect(mapsViews(m) + searchViews(m)).toBe(totalViews(m));
    expect(phoneViews(m) + computerViews(m)).toBe(totalViews(m));
  });

  test("percentages always add up to 100", () => {
    expect(percentsTo100([1820, 749, 351, 171])).toEqual([59, 24, 11, 6]);
    expect(percentsTo100([1, 1, 1])).toEqual([34, 33, 33]);
    expect(percentsTo100([2, 2, 2, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(percentsTo100([0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
  });

  test("“vs the same months last year”: only when all 6 of last year's months are stored", () => {
    const year = monthRange("2026-10", 18).map((m, i) => month(m, i < 12 ? [100, 50, 20, 10] : [90, 40, 20, 10]));
    const a = audience(year)!;
    // 6 × 160 now vs 6 × 180 a year ago.
    expect(a.total).toBe(960);
    expect(a.vsLastYear).toBe(-11.1);
    expect(a.rows.map((r) => r.percent).reduce((x, y) => x + y, 0)).toBe(100);
    // Missing one of last year's months → no pill.
    expect(audience(year.filter((m) => m.month !== "2025-07"))!.vsLastYear).toBeNull();
    // Only the last 6 months stored → no pill.
    expect(audience(year.slice(-6))!.vsLastYear).toBeNull();
    expect(audience([])).toBeNull();
  });

  test("the takeaway: from the biggest of phone / Maps / Search, fixed wording", () => {
    expect(takeaway([1820, 749, 351, 171])).toEqual({ kind: "phone", percent: 83 });
    expect(takeaway([100, 300, 100, 300])).toEqual({ kind: "maps", percent: 75 });
    expect(takeaway([50, 0, 400, 50])).toEqual({ kind: "search", percent: 90 });
  });

  test("small numbers: under 30 views a month, % changes are replaced", () => {
    expect(isSmallMonth(month("2026-10", [10, 5, 3, 1]))).toBe(true);
    expect(isSmallMonth(month("2026-10", [20, 6, 3, 1]))).toBe(false);
    expect(audience([month("2026-10", [10, 5, 3, 1])])!.small).toBe(true);
  });

  test("what it could be worth: actions × the owner's average visit; nothing without one", () => {
    expect(worth(83, 45)).toBe(3735);
    expect(worth(83, null)).toBeNull();
    expect(worth(83, 0)).toBeNull();
    expect(parseAverageVisit("$45")).toBe(45);
    expect(parseAverageVisit("1,200.50")).toBe(1200.5);
    expect(parseAverageVisit("")).toBeNull();
    expect(parseAverageVisit("abc")).toBe("invalid");
    expect(parseAverageVisit("0")).toBe("invalid");
    expect(parseAverageVisit("45.555")).toBe("invalid");
  });
});

// ---------------------------------------------------------------------------
// Fetching: one failure never loses what's stored
// ---------------------------------------------------------------------------

function fakeAdmin(connected = true) {
  const writes: Array<{ table: string; op: string; rows: unknown }> = [];
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain,
      eq: chain,
      order: chain,
      limit: chain,
      range: chain,
      maybeSingle: async () => ({ data: table === "gbp_connections" ? { status: connected ? "connected" : "disconnected", google_location_id: "locations/123", insights_backfilled_at: null } : null, error: null }),
      upsert: async (rows: unknown) => {
        writes.push({ table, op: "upsert", rows });
        return { error: null };
      },
      update: (rows: unknown) => {
        writes.push({ table, op: "update", rows });
        return { eq: async () => ({ error: null }) };
      },
      delete: () => {
        writes.push({ table, op: "delete", rows: null });
        return { eq: async () => ({ error: null }) };
      },
    });
    return b;
  };
  return { admin: { from: builder } as never, writes };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("fetching and saving", () => {
  test("saves only monthly totals, and the newest month's search terms", async () => {
    tokens.refreshed = false;
    const { admin, writes } = fakeAdmin();
    const fetchImpl = vi.fn(async (url: string) => (String(url).includes("searchkeywords") ? json(KEYWORDS) : json(DAILY))) as unknown as typeof fetch;
    const run = await runInsightsFetchWithClient(admin, "b1", ["2026-09", "2026-10"], fetchImpl, new Date("2026-11-01T06:00:00Z"));
    expect(run).toEqual({ status: "ok", months: 2 });
    const saved = writes.filter((w) => w.op === "upsert").flatMap((w) => w.rows as Array<{ month: string; top_keywords?: unknown }>);
    expect(saved.map((r) => r.month).sort()).toEqual(["2026-09-01", "2026-10-01"]);
    expect(saved.find((r) => r.month === "2026-10-01")!.top_keywords).toHaveLength(6);
    // September's stored search terms aren't touched.
    expect("top_keywords" in saved.find((r) => r.month === "2026-09-01")!).toBe(false);
    expect(writes.some((w) => w.op === "delete")).toBe(false);
  });

  test("a failed fetch writes nothing, so the stored months stay as they were", async () => {
    tokens.refreshed = false;
    const { admin, writes } = fakeAdmin();
    const fetchImpl = vi.fn(async () => json({ error: { status: "UNAVAILABLE" } }, 503)) as unknown as typeof fetch;
    const run = await runInsightsFetchWithClient(admin, "b1", ["2026-10"], fetchImpl);
    expect(run).toEqual({ status: "failed", step: "performance 503 UNAVAILABLE" });
    expect(writes).toEqual([]);
  });

  test("a 401: refresh first and try once more — never a token deletion", async () => {
    tokens.refreshed = false;
    tokens.calls = [];
    const { admin, writes } = fakeAdmin();
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get("authorization") ?? "";
      seen.push(auth);
      if (auth.includes("stale-token")) return json({ error: { status: "UNAUTHENTICATED" } }, 401);
      return String(url).includes("searchkeywords") ? json(KEYWORDS) : json(DAILY);
    }) as unknown as typeof fetch;
    const run = await runInsightsFetchWithClient(admin, "b1", ["2026-10"], fetchImpl);
    expect(tokens.calls).toEqual(["refresh"]);
    expect(seen[0]).toContain("stale-token");
    expect(seen.slice(1).every((a) => a.includes("fresh-token"))).toBe(true);
    expect(run).toEqual({ status: "ok", months: 1 });
    expect(writes.some((w) => w.table === "gbp_tokens")).toBe(false);
  });

  test("search terms that fail to load don't blank the stored ones", async () => {
    tokens.refreshed = false;
    const { admin, writes } = fakeAdmin();
    const fetchImpl = vi.fn(async (url: string) => (String(url).includes("searchkeywords") ? json({}, 500) : json(DAILY))) as unknown as typeof fetch;
    expect(await runInsightsFetchWithClient(admin, "b1", ["2026-10"], fetchImpl)).toEqual({ status: "ok", months: 1 });
    const rows = writes.flatMap((w) => w.rows as Array<Record<string, unknown>>);
    expect(rows.every((r) => !("top_keywords" in r))).toBe(true);
  });

  test("not connected: nothing read, nothing written", async () => {
    const { admin, writes } = fakeAdmin(false);
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await runInsightsFetchWithClient(admin, "b1", ["2026-10"], fetchImpl)).toEqual({ status: "skipped", reason: "not_connected" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The tab with real numbers
// ---------------------------------------------------------------------------

const BASE: GoogleProfileTabProps = {
  businessId: "b1",
  connected: true,
  practice: false,
  needsReconnect: false,
  canStart: true,
  result: null,
  business: { name: "Hair express on Broadway", address: null },
  listing: { rating: 5, reviewCount: 30, photoCount: 12, phone: null, website: null, category: "Hair salon", openingHours: null, googleMapsUri: null },
  checks: [],
  website: null,
  replyCounts: null,
  messagingOn: null,
  saved: null,
  lastScanAt: null,
};
const render = (props: Partial<GoogleProfileTabProps>, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      <GbpEditProvider value={{ premium: true, connected: true, undo: null, canEdit: true }}>
        <GoogleProfileTab {...BASE} {...props} />
      </GbpEditProvider>
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

/** 18 real months: last year a little busier; the last month 704 views and 83 actions. */
const REAL = monthRange("2026-10", 18).map((m, i) =>
  m === "2026-10"
    ? month(m, [415, 169, 78, 42], { calls: 31, directions: 27, bookings: 11, websiteClicks: 14, callsByWeekday: [2, 1, 5, 6, 5, 6, 6], topKeywords: topKeywords([KEYWORDS]) })
    : m === "2026-09"
      ? month(m, [401, 163, 75, 41], { calls: 25, directions: 24, bookings: 7, websiteClicks: 13 })
      : month(m, i < 12 ? [600, 250, 110, 60] : [380, 150, 70, 40])
);

describe("the tab: real numbers replace the empty states", () => {
  test("section 1: the rate, the change line, the KPI tiles with ▲/▼, the next-update pill", () => {
    const words = text(render({ insights: REAL }));
    expect(words).toContain("11.8%");
    // Both months' own ratios, never just one %, and the change in points.
    expect(words).toContain("October: 11.8% · 83 of 704 people");
    expect(words).toContain("September: 10.1% · 69 of 680 people ▲ 2 more customers per 100 people than the month before");
    expect(words).toMatch(/Calls 31 ▲6 vs Sep/);
    expect(words).toMatch(/Website clicks 14 ▲1 vs Sep/);
    expect(words).toContain("October 2026 · compared with September");
    expect(words).toMatch(/Updates on the 1st of every month · next: Dec 1/);
    expect(words).not.toContain("Your conversion rate appears after");
    expect(words).not.toContain("Sample data");
  });

  test("no average visit: a link to Settings instead of a made-up number; with one: the estimate", () => {
    const none = render({ insights: REAL, averageVisit: null });
    expect(text(none)).toContain("Set your average visit in Settings to see this");
    expect(none).toContain('href="/business/b1/settings#average-visit"');
    expect(text(none)).not.toMatch(/≈ \$/);
    const set = text(render({ insights: REAL, averageVisit: 45 }));
    expect(set).toContain("Google brought you about $1,250–$3,750 last month");
    expect(set).toContain("83 customer actions × $45 average visit, if a third to all of them became visits.");
    // October is the best of the 6 months here: no amount, the matched line.
    expect(set).toContain("You matched your best month. Keep the levers going.");
  });

  test("section 2: “Who saw you” as a table vs last year, devices with % adding to 100, which days they call", () => {
    const html = render({ insights: REAL });
    const words = text(html);
    expect(words).toMatch(/Who saw you May–Oct 2026 vs May–Oct 2025/);
    expect(html).toContain('data-testid="google-tab-who-table"');
    expect(words).not.toContain("people viewed your listing");
    expect(words).toMatch(/Views [\d,]+ [\d,]+ ▼ \d+%/);
    expect(words).toContain("Counted the way Google counts views.");
    const percents = Array.from(html.matchAll(/data-testid="google-tab-device-[a-zA-Z]+"[\s\S]*?· (\d+)%/g)).map((m) => Number(m[1]));
    expect(percents).toHaveLength(4);
    expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
    expect(words).toMatch(/\d+% on a phone/);
    expect(words).toContain("Most calls come midweek, so answer the phone or set voicemail with your booking link.");
    // Without last year's months: "—" and "Not enough history", no takeaway.
    const short = text(render({ insights: REAL.slice(-6) }));
    expect(short).toMatch(/Views [\d,]+ — Not enough history/);
    expect(short).not.toContain("than last year");
  });

  test("Phase B: section 2 — no “Where they saw you”; left: Who saw you then Which days they call; right: Devices; every card says its period; devices add up to the Who saw you total", () => {
    const html = render({ insights: REAL });
    const words = text(html);
    expect(words).not.toContain("Where they saw you");
    expect(html).not.toContain("google-tab-where");
    const at = (id: string) => html.indexOf(`data-testid="${id}"`);
    expect(at("google-tab-who")).toBeLessThan(at("google-tab-days"));
    expect(at("google-tab-days")).toBeLessThan(at("google-tab-devices"));
    // Left column holds who + days; the right column is the devices card at full height.
    expect(html).toMatch(/<div class="flex flex-col gap-3[^"]*"><div class="rounded-xl border border-paper-line p-3" data-testid="google-tab-who">/);
    expect(html).toMatch(/class="flex flex-col rounded-xl border border-paper-line p-3 h-full" data-testid="google-tab-devices"/);
    // Periods: the funnel's month; the rest the real months ("May–Oct 2026").
    expect(words).toMatch(/From views to customers October 2026/);
    for (const title of ["Who saw you", "Which days they call", "Devices and platforms", "Interactions by month"]) expect(words).toMatch(new RegExp(`${title} May–Oct 2026`));
    // The four device rows add up to the Who saw you total.
    const total = Number(words.match(/Views ([\d,]+) /)![1].replace(/,/g, ""));
    const parts = Array.from(html.matchAll(/data-testid="google-tab-device-[a-zA-Z]+"[\s\S]*?<b[^>]*>([\d,]+) ·/g)).map((m) => Number(m[1].replace(/,/g, "")));
    expect(parts).toHaveLength(4);
    expect(parts.reduce((x, y) => x + y, 0)).toBe(total);
  });

  test("section 3: the top 5 search terms with counts and Google's threshold line", () => {
    const words = text(render({ insights: REAL }));
    expect(words).toMatch(/1 hair salon tarrytown 212 2 hair express 140 3 balayage near me 61 4 hair color sleepy hollow 23 5 curly cut 18/);
    expect(words).toContain("Google shows search terms used at least 15 times a month.");
    expect(words).not.toContain("blowout");
  });

  test("small numbers: the numbers stay, the % change becomes a plain note", () => {
    const small = [month("2026-09", [10, 5, 3, 2], { calls: 1, directions: 1, bookings: 0, websiteClicks: 0 }), month("2026-10", [12, 6, 4, 2], { calls: 3, directions: 1, bookings: 0, websiteClicks: 1 })];
    const words = text(render({ insights: small }));
    expect(words).toContain("October: 20.8% · 5 of 24 people");
    expect(words).toContain("September: 10.0% · 2 of 20 people Small numbers swing a lot month to month.");
    expect(words).not.toMatch(/points/);
  });

  test("no data: the empty states stay; practice mode keeps its sample (3,091 people, ▼ 13.4%)", () => {
    const empty = text(render({ insights: [], insightsState: "none" }));
    expect(empty).toContain("Google hasn't shared numbers for your listing yet. They usually appear within a few days.");
    expect(empty).not.toContain("first full month");
    // Nothing stored yet: loading, then the page refreshes.
    const loading = render({ insights: [], insightsState: "sync" });
    expect(text(loading)).toContain("Loading your Google numbers…");
    expect(loading).toContain('data-sync="loading"');
    const practice = text(render({ practice: true, connected: false, insights: [] }));
    expect(practice).toMatch(/Views 3,091 3,569 ▼ 13%/);
    expect(practice).toContain("Google Search on a phone 1,820 · 59%");
    expect(practice).toContain("Google Maps on a computer 171 · 6%");
    expect(practice).toContain("83% on a phone");
  });

  test("the change line: down is red “▼ 3 fewer customers per 100 people than the month before” (Hair Express, Sep 24.6% → Oct 21.6%)", () => {
    const hx = [month("2026-09", [366, 135, 73, 20], { calls: 26, directions: 74, websiteClicks: 46, bookings: 0 }), month("2026-10", [437, 150, 85, 32], { calls: 30, directions: 72, websiteClicks: 50, bookings: 0 })];
    const html = render({ insights: hx });
    expect(text(html)).toContain("October: 21.6% · 152 of 704 people");
    expect(text(html)).toContain("September: 24.6% · 146 of 594 people ▼ 3 fewer customers per 100 people than the month before");
    expect(html).toContain('data-testid="google-tab-points" data-dir="down"');
    expect(text(render({ insights: hx }, "es"))).toContain("septiembre: 24,6 % · 146 de 594 personas ▼ 3 clientes menos por cada 100 personas que el mes anterior");
  });

  test("what it could be worth: a range (a third to all of the actions) and what's left on the table at the best rate", () => {
    // Range math + rounding: $50 steps, $100 above $5,000.
    expect(roundMoney(1260)).toBe(1250);
    expect(roundMoney(3735)).toBe(3750);
    expect(roundMoney(5340)).toBe(5300);
    expect(worthRange(152, 45)).toEqual({ low: 2300, high: 6800 });
    expect(worthRange(152, null)).toBeNull();
    expect(worthRange(0, 45)).toBeNull();
    // Hair Express: Oct 152 of 704 (21.6%); best of May–Oct is Sep 146 of 594 (24.6%).
    const hx = [
      month("2026-05", [226, 148, 61, 41], { calls: 28, directions: 63, websiteClicks: 0, bookings: 0 }),
      month("2026-06", [218, 132, 46, 35], { calls: 26, directions: 40, websiteClicks: 0, bookings: 0 }),
      month("2026-07", [280, 137, 54, 42], { calls: 38, directions: 64, websiteClicks: 0, bookings: 0 }),
      month("2026-08", [387, 152, 64, 25], { calls: 34, directions: 50, websiteClicks: 55, bookings: 0 }),
      month("2026-09", [366, 135, 73, 20], { calls: 26, directions: 74, websiteClicks: 46, bookings: 0 }),
      month("2026-10", [437, 150, 85, 32], { calls: 30, directions: 72, websiteClicks: 50, bookings: 0 }),
    ];
    // round(704 × 146/594) − 152 = 173 − 152 = 21 more customers; × $45 = $945 → $950.
    expect(leftOnTable(hx, 45)).toEqual({ kind: "missed", best: { month: "2026-09", rate: 24.6 }, extra: 21, missed: 950 });
    const words = text(render({ insights: hx, averageVisit: 45 }));
    expect(words).toContain("Left on the table: ≈ $950");
    expect(words).toContain("At your best rate (September, 24.6%), the same 704 viewers would have meant about 21 more customers. The levers above are how you get there.");
    expect(render({ insights: hx, averageVisit: 45 })).toContain('href="#google-tab-levers"');
    expect(render({ insights: hx, averageVisit: 45 })).toContain('title="Not every call or direction request becomes a sale. Change your average visit in Settings."');
    // The best month is last month → matched, no amount.
    expect(leftOnTable(hx.slice(0, 5), 45)).toEqual({ kind: "matched" });
    // Months under 30 views never count as "best".
    const tiny = [month("2026-09", [10, 5, 3, 2], { calls: 10, directions: 5, websiteClicks: 0, bookings: 0 }), ...hx.slice(-1)];
    expect(leftOnTable(tiny, 45)).toEqual({ kind: "matched" });
    // No average visit: the Settings link stays.
    expect(text(render({ insights: hx, averageVisit: null }))).toContain("Set your average visit in Settings to see this");
    expect(text(render({ insights: hx, averageVisit: 45 }, "es"))).toContain("Google le trajo unos");
  });

  test("the change per 100 people: the three cases and the rounding (never “points” or “%”)", () => {
    expect(per100Change(21.6, 24.6)).toEqual({ dir: "down", count: 3 });
    expect(per100Change(24.6, 21.6)).toEqual({ dir: "up", count: 3 });
    expect(per100Change(10.3, 10.0)).toEqual({ dir: "same", count: 0 });
    expect(per100Change(10.4, 10.0)).toEqual({ dir: "same", count: 0 });
    expect(per100Change(10.5, 10.0)).toEqual({ dir: "up", count: 1 });
    expect(per100Change(11.4, 10.0)).toEqual({ dir: "up", count: 1 });
    expect(per100Change(11.5, 10.0)).toEqual({ dir: "up", count: 2 });
    const same = [month("2026-09", [400, 200, 80, 20], { calls: 50, directions: 20, websiteClicks: 0, bookings: 0 }), month("2026-10", [400, 200, 80, 20], { calls: 51, directions: 21, websiteClicks: 0, bookings: 0 })];
    const words = text(render({ insights: same }));
    expect(words).toContain("About the same as the month before");
    expect(text(render({ insights: same }, "es"))).toContain("Más o menos igual que el mes anterior");
    expect(words).not.toMatch(/points|per 100 people than the month before.*%/);
  });

  test("the 6-month chart: 0-based scale, a month under every point, the latest labelled, best month, tooltips", () => {
    const hx = [
      month("2026-05", [226, 148, 61, 41], { calls: 28, directions: 63, websiteClicks: 0, bookings: 0 }),
      month("2026-06", [218, 132, 46, 35], { calls: 26, directions: 40, websiteClicks: 0, bookings: 0 }),
      month("2026-07", [280, 137, 54, 42], { calls: 38, directions: 64, websiteClicks: 0, bookings: 0 }),
      month("2026-08", [387, 152, 64, 25], { calls: 34, directions: 50, websiteClicks: 55, bookings: 0 }),
      month("2026-09", [366, 135, 73, 20], { calls: 26, directions: 74, websiteClicks: 46, bookings: 0 }),
      month("2026-10", [437, 150, 85, 32], { calls: 30, directions: 72, websiteClicks: 50, bookings: 0 }),
    ];
    const chart = rateChart(rateTrend(hx), 84)!;
    expect(chart.points.map((p) => p.rate)).toEqual([19.1, 15.3, 19.9, 22.1, 24.6, 21.6]);
    expect(chart.yMax).toBe(30);
    expect(chart.grid).toEqual([0, 15, 30]);
    expect(chart.best).toEqual({ month: "2026-09", rate: 24.6 });
    expect(chart.segments).toHaveLength(1);
    const html = render({ insights: hx });
    const box = html.slice(html.indexOf('data-testid="google-tab-trend"'));
    expect(text(box)).toMatch(/^.*?May–Oct 2026 Best: Sep 24\.6%/);
    for (const m of ["May", "Jun", "Jul", "Aug", "Sep", "Oct"]) expect(text(box)).toContain(m);
    expect(box).toContain("0%");
    expect(box).toContain("30%");
    expect(box).toContain('aria-label="Conversion rate, last 6 months: May 19.1%, Jun 15.3%, Jul 19.9%, Aug 22.1%, Sep 24.6%, Oct 21.6%"');
    expect(box).toContain('title="Sep: 24.6% · 146 of 594 people"');
    expect(box.match(/data-testid="google-tab-trend-latest"/g)).toHaveLength(1);
    // The change line sits on its own line under the two month lines.
    expect(html).toMatch(/146 of 594 people<\/p><p><span data-testid="google-tab-points"/);
    // Spanish month names.
    expect(text(render({ insights: hx }, "es"))).toMatch(/Mejor: sept\.? 24,6/);
  });

  test("the chart: a missing month is a gap (not a zero); one month is a single dot; all-zero months sit on 0%", () => {
    const gap = rateChart([{ month: "2026-05", rate: 10 }, { month: "2026-06", rate: 12 }, { month: "2026-07", rate: null }, { month: "2026-08", rate: 14 }, { month: "2026-09", rate: 15 }, { month: "2026-10", rate: 16 }], 84)!;
    expect(gap.segments).toHaveLength(2);
    expect(gap.points[2]).toMatchObject({ rate: null, y: null });
    const one = rateChart([{ month: "2026-10", rate: 21.6 }], 84)!;
    expect(one.segments).toHaveLength(0);
    expect(one.points[0]).toMatchObject({ x: 50 });
    expect(one.yMax).toBe(30);
    const zeros = rateChart(["05", "06", "07", "08", "09", "10"].map((m) => ({ month: `2026-${m}`, rate: 0 })), 84)!;
    expect(zeros.yMax).toBe(10);
    expect(zeros.points.every((p) => p.y === 84)).toBe(true);
    expect(rateChart([{ month: "2026-10", rate: null }], 84)).toBeNull();
    // The curve never overshoots: every control point stays between its ends' heights.
    expect(monotonePath([{ x: 0, y: 10 }, { x: 50, y: 0 }, { x: 100, y: 0 }])).toMatch(/^M0,10 C/);
  });

  test("Spanish (usted)", () => {
    const words = text(render({ insights: REAL, averageVisit: null }, "es"));
    expect(words).toContain("Quién lo vio");
    expect(words).toContain("Clientes por cada 100 personas que lo vieron");
    expect(words).toContain("en un teléfono");
    expect(words).toContain("Contado como Google cuenta las vistas.");
    expect(words).toContain("Indique su visita promedio en Configuración para ver esto");
    expect(words).toContain("Google muestra los términos de búsqueda usados al menos 15 veces al mes.");
  });
});
