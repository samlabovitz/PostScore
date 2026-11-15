// Google Business Profile Performance API → the monthly totals PostScore
// keeps (supabase/gbp-monthly-insights.sql): views by platform and device,
// calls, direction requests, bookings, website clicks, calls by weekday and
// the month's top search terms. Daily numbers are summed here and never
// stored. Plus the numbers the Google Profile tab shows from those rows.
// Pure — no fetch, no database.

/** The daily metrics read for each month. */
export const DAILY_METRICS = [
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "CALL_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "WEBSITE_CLICKS",
  "BUSINESS_BOOKINGS",
  "BUSINESS_FOOD_ORDERS",
  "BUSINESS_CONVERSATIONS",
] as const;
export type DailyMetric = (typeof DAILY_METRICS)[number];

/** How many full months a first connect reads (for "vs last year"). */
export const BACKFILL_MONTHS = 18;
/** Google shows a search term only from this many uses a month. */
export const KEYWORD_THRESHOLD = 15;
/** Below this many views in a month, % changes aren't meaningful. */
export const SMALL_MONTH_VIEWS = 30;

export interface Keyword {
  term: string;
  count: number;
}

/** One stored month (a gbp_monthly_insights row, in the app's own words). */
export interface InsightsMonth {
  /** "2026-10" */
  month: string;
  viewsSearchMobile: number;
  viewsMapsMobile: number;
  viewsSearchDesktop: number;
  viewsMapsDesktop: number;
  calls: number;
  directions: number;
  bookings: number;
  websiteClicks: number;
  /** Messages started from the listing (BUSINESS_CONVERSATIONS). */
  conversations: number;
  foodOrders: number;
  /** Calls by weekday, Sunday first (7 numbers); null when not known. */
  callsByWeekday: number[] | null;
  /** The month's top search terms (only those over Google's threshold). */
  topKeywords: Keyword[] | null;
}

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

/** "2026-10" → { year: 2026, month: 10 }. */
function ym(month: string): { year: number; month: number } {
  const [y, m] = month.split("-").map(Number);
  return { year: y, month: m };
}

export function addMonths(month: string, n: number): string {
  const { year, month: m } = ym(month);
  const i = year * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** The last full month before `now` (UTC; Google's data is per day). */
export function lastFullMonth(now: Date): string {
  return addMonths(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`, -1);
}

/** The `count` full months ending with `last`, oldest first. */
export function monthRange(last: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(last, i - (count - 1)));
}

/** The month's first and last day as Google's Date objects. */
export function monthBounds(month: string): { start: { year: number; month: number; day: number }; end: { year: number; month: number; day: number } } {
  const { year, month: m } = ym(month);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { start: { year, month: m, day: 1 }, end: { year, month: m, day: lastDay } };
}

// ---------------------------------------------------------------------------
// Parsing Google's responses
// ---------------------------------------------------------------------------

interface DatedValue {
  date?: { year?: number; month?: number; day?: number };
  value?: string | number;
}
export interface MultiDailyResponse {
  multiDailyMetricTimeSeries?: Array<{
    dailyMetricTimeSeries?: Array<{ dailyMetric?: string; timeSeries?: { datedValues?: DatedValue[] } }>;
  }>;
}
export interface KeywordsResponse {
  searchKeywordsCounts?: Array<{ searchKeyword?: string; insightsValue?: { value?: string | number; threshold?: string | number } }>;
  nextPageToken?: string;
}

const num = (v: string | number | undefined): number => {
  const n = typeof v === "number" ? v : v === undefined ? 0 : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** Google's daily series summed into one row per month (only the months
 * inside the range that Google answered for). A day with no value is 0. */
export function monthlyTotals(res: MultiDailyResponse, months: string[]): InsightsMonth[] {
  const wanted = new Set(months);
  const rows = new Map<string, InsightsMonth>();
  const row = (month: string) => {
    let r = rows.get(month);
    if (!r) {
      r = { month, viewsSearchMobile: 0, viewsMapsMobile: 0, viewsSearchDesktop: 0, viewsMapsDesktop: 0, calls: 0, directions: 0, bookings: 0, websiteClicks: 0, conversations: 0, foodOrders: 0, callsByWeekday: [0, 0, 0, 0, 0, 0, 0], topKeywords: null };
      rows.set(month, r);
    }
    return r;
  };
  for (const group of res.multiDailyMetricTimeSeries ?? []) {
    for (const series of group.dailyMetricTimeSeries ?? []) {
      const metric = series.dailyMetric as DailyMetric | undefined;
      for (const dv of series.timeSeries?.datedValues ?? []) {
        const d = dv.date;
        if (!d?.year || !d.month || !d.day) continue;
        const month = `${d.year}-${String(d.month).padStart(2, "0")}`;
        if (!wanted.has(month)) continue;
        const r = row(month);
        const v = num(dv.value);
        switch (metric) {
          case "BUSINESS_IMPRESSIONS_MOBILE_SEARCH":
            r.viewsSearchMobile += v;
            break;
          case "BUSINESS_IMPRESSIONS_MOBILE_MAPS":
            r.viewsMapsMobile += v;
            break;
          case "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH":
            r.viewsSearchDesktop += v;
            break;
          case "BUSINESS_IMPRESSIONS_DESKTOP_MAPS":
            r.viewsMapsDesktop += v;
            break;
          case "CALL_CLICKS":
            r.calls += v;
            // The weekday, from the daily series before it's summed.
            r.callsByWeekday![new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()] += v;
            break;
          case "BUSINESS_DIRECTION_REQUESTS":
            r.directions += v;
            break;
          case "WEBSITE_CLICKS":
            r.websiteClicks += v;
            break;
          case "BUSINESS_BOOKINGS":
            r.bookings += v;
            break;
          case "BUSINESS_FOOD_ORDERS":
            r.foodOrders += v;
            break;
          case "BUSINESS_CONVERSATIONS":
            r.conversations += v;
            break;
        }
      }
    }
  }
  return months.filter((m) => rows.has(m)).map((m) => rows.get(m)!);
}

/** The month's search terms with real counts, biggest first. Terms Google
 * hides under its threshold ("fewer than 15") are left out. */
export function topKeywords(pages: KeywordsResponse[], max = 10): Keyword[] {
  const out: Keyword[] = [];
  for (const p of pages)
    for (const k of p.searchKeywordsCounts ?? []) {
      const term = k.searchKeyword?.trim();
      const count = k.insightsValue?.value !== undefined ? num(k.insightsValue.value) : 0;
      if (term && count > 0) out.push({ term, count });
    }
  return out.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term)).slice(0, max);
}

// ---------------------------------------------------------------------------
// What the tab shows
// ---------------------------------------------------------------------------

export function totalViews(m: InsightsMonth): number {
  return m.viewsSearchMobile + m.viewsMapsMobile + m.viewsSearchDesktop + m.viewsMapsDesktop;
}
export function mapsViews(m: InsightsMonth): number {
  return m.viewsMapsMobile + m.viewsMapsDesktop;
}
export function searchViews(m: InsightsMonth): number {
  return m.viewsSearchMobile + m.viewsSearchDesktop;
}
export function phoneViews(m: InsightsMonth): number {
  return m.viewsSearchMobile + m.viewsMapsMobile;
}
export function computerViews(m: InsightsMonth): number {
  return m.viewsSearchDesktop + m.viewsMapsDesktop;
}
/** Google's "interactions": calls + direction requests + website clicks +
 * bookings + messages + food orders. The conversion rate and every
 * "customer actions" number use this. */
export function actions(m: InsightsMonth): number {
  return m.calls + m.directions + m.websiteClicks + m.bookings + m.conversations + m.foodOrders;
}

/** Whole percentages that add up to exactly 100 (largest remainder);
 * all zeros when the total is 0. */
export function percentsTo100(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rest: r - Math.floor(r) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

export type AudienceRow = "searchPhone" | "mapsPhone" | "searchComputer" | "mapsComputer";
export const AUDIENCE_ROWS: readonly AudienceRow[] = ["searchPhone", "mapsPhone", "searchComputer", "mapsComputer"];

export interface Audience {
  /** People who viewed the listing over the window (Google's own count). */
  total: number;
  /** % vs the same months a year earlier, one decimal; null: not all of last year's months are known. */
  vsLastYear: number | null;
  /** Interactions over the same window, and their % vs last year. */
  interactions: number;
  interactionsVsLastYear: number | null;
  rows: Array<{ id: AudienceRow; count: number; percent: number }>;
  takeaway: { kind: "phone" | "maps" | "search"; percent: number };
  /** Too few views for a % change to mean much. */
  small: boolean;
}

/** "Who saw you" over the last `window` months ending with the newest row:
 * the total, the four platform/device rows (percentages adding to 100),
 * the same months last year when every one of them is stored, and the
 * fixed takeaway from the biggest group. null with no months. */
export function audience(months: InsightsMonth[], window = 6): Audience | null {
  if (months.length === 0) return null;
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const last = sorted[sorted.length - 1].month;
  const byMonth = new Map(sorted.map((m) => [m.month, m]));
  const current = monthRange(last, window).map((m) => byMonth.get(m)).filter((m): m is InsightsMonth => !!m);
  if (current.length === 0) return null;
  const sum = (f: (m: InsightsMonth) => number, list: InsightsMonth[]) => list.reduce((a, m) => a + f(m), 0);
  const counts = [sum((m) => m.viewsSearchMobile, current), sum((m) => m.viewsMapsMobile, current), sum((m) => m.viewsSearchDesktop, current), sum((m) => m.viewsMapsDesktop, current)];
  const total = counts.reduce((a, b) => a + b, 0);
  const percents = percentsTo100(counts);
  const lastYear = monthRange(addMonths(last, -12), window).map((m) => byMonth.get(m));
  const haveLastYear = lastYear.every((m): m is InsightsMonth => !!m);
  const lastYearTotal = haveLastYear ? sum(totalViews, lastYear as InsightsMonth[]) : null;
  const interactions = sum(actions, current);
  const lastYearInteractions = haveLastYear ? sum(actions, lastYear as InsightsMonth[]) : null;
  return {
    total,
    vsLastYear: percentChange(total, lastYearTotal),
    interactions,
    interactionsVsLastYear: percentChange(interactions, lastYearInteractions),
    rows: AUDIENCE_ROWS.map((id, i) => ({ id, count: counts[i], percent: percents[i] })),
    takeaway: takeaway(counts),
    small: total < SMALL_MONTH_VIEWS || (lastYearTotal !== null && lastYearTotal < SMALL_MONTH_VIEWS),
  };
}

/** % change, one decimal; null without a real base. */
export function percentChange(now: number, before: number | null): number | null {
  return before !== null && before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null;
}

/** The fixed takeaway line: from the biggest of phone / Maps / Search. */
export function takeaway(counts: number[]): Audience["takeaway"] {
  const [sp, mp, sc, mc] = counts;
  const total = sp + mp + sc + mc;
  if (total <= 0) return { kind: "phone", percent: 0 };
  const phone = (sp + mp) / total;
  const maps = (mp + mc) / total;
  const search = (sp + sc) / total;
  const kind = phone >= maps && phone >= search ? "phone" : maps > search ? "maps" : "search";
  return { kind, percent: Math.round((kind === "phone" ? phone : kind === "maps" ? maps : search) * 100) };
}

/** The tab's practice-mode sample (the mockup's numbers). */
export const SAMPLE_AUDIENCE: Audience = {
  total: 3091,
  vsLastYear: -13.4,
  interactions: 655,
  interactionsVsLastYear: 24.5,
  rows: [
    { id: "searchPhone", count: 1820, percent: 59 },
    { id: "mapsPhone", count: 749, percent: 24 },
    { id: "searchComputer", count: 351, percent: 11 },
    { id: "mapsComputer", count: 171, percent: 6 },
  ],
  takeaway: { kind: "phone", percent: 83 },
  small: false,
};

/** Calls by part of the week (the mockup's three groups) over the given
 * months, and the group with the most calls; null when unknown. */
export type CallDays = "midweek" | "weekend" | "sunMon";
export function callsByDays(months: InsightsMonth[]): { groups: Record<CallDays, number>; top: CallDays } | null {
  const week = [0, 0, 0, 0, 0, 0, 0];
  let any = false;
  for (const m of months)
    if (m.callsByWeekday && m.callsByWeekday.length === 7) {
      any = true;
      m.callsByWeekday.forEach((v, i) => (week[i] += v));
    }
  if (!any || week.every((v) => v === 0)) return null;
  // Sunday first: Tue–Thu, Fri–Sat, Sun–Mon.
  const groups: Record<CallDays, number> = { midweek: week[2] + week[3] + week[4], weekend: week[5] + week[6], sunMon: week[0] + week[1] };
  const top = (Object.keys(groups) as CallDays[]).reduce((a, b) => (groups[b] > groups[a] ? b : a), "midweek");
  return { groups, top };
}

/** What the tab shows for a connected business: "ready" when the last full
 * month is stored (never based on when it connected); "none" when a sync
 * in the last 6 hours found Google had nothing for it; else "sync" (the
 * tab loads the missing months and refreshes). */
export type InsightsState = "ready" | "sync" | "none";
export const RECENT_SYNC_MS = 6 * 60 * 60 * 1000;
export function insightsStateFor(storedMonths: string[], syncedAt: string | null, now: Date): InsightsState {
  if (storedMonths.includes(lastFullMonth(now))) return "ready";
  const at = syncedAt ? Date.parse(syncedAt) : NaN;
  return Number.isFinite(at) && now.getTime() - at < RECENT_SYNC_MS ? "none" : "sync";
}

/** "Small numbers swing a lot month to month": below SMALL_MONTH_VIEWS. */
export function isSmallMonth(m: InsightsMonth | null | undefined): boolean {
  return !!m && totalViews(m) < SMALL_MONTH_VIEWS;
}

/** "What that could be worth": actions × the owner's average visit. */
export function worth(actionCount: number, averageVisit: number | null | undefined): number | null {
  if (averageVisit === null || averageVisit === undefined || !Number.isFinite(averageVisit) || averageVisit <= 0) return null;
  return Math.round(actionCount * averageVisit);
}

/** Money shown as an estimate: to the nearest $50, or $100 above $5,000. */
export function roundMoney(v: number): number {
  return v > 5000 ? Math.round(v / 100) * 100 : Math.round(v / 50) * 50;
}

/** "Google brought you about ${low}–${high}": if a third to all of the
 * month's customer actions became visits, at the owner's average visit. */
export function worthRange(actionCount: number, averageVisit: number | null | undefined): { low: number; high: number } | null {
  if (averageVisit === null || averageVisit === undefined || !Number.isFinite(averageVisit) || averageVisit <= 0 || actionCount <= 0) return null;
  return { low: roundMoney(Math.round(actionCount / 3) * averageVisit), high: roundMoney(actionCount * averageVisit) };
}

/** "Left on the table": last month's viewers at the best rate of the last 6
 * months (only months with at least SMALL_MONTH_VIEWS views count). The
 * best month being last month → "matched". null without a usable month. */
export type LeftOnTable = { kind: "matched" } | { kind: "missed"; best: { month: string; rate: number }; extra: number; missed: number | null };
export function leftOnTable(months: InsightsMonth[], averageVisit: number | null | undefined): LeftOnTable | null {
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const last = sorted[sorted.length - 1];
  if (!last || totalViews(last) < SMALL_MONTH_VIEWS) return null;
  const window = new Set(monthRange(last.month, 6));
  const rateOf = (m: InsightsMonth) => actions(m) / totalViews(m);
  const candidates = sorted.filter((m) => window.has(m.month) && totalViews(m) >= SMALL_MONTH_VIEWS);
  const best = candidates.reduce((a, b) => (rateOf(b) > rateOf(a) ? b : a), last);
  if (best.month === last.month) return { kind: "matched" };
  const extra = Math.round(totalViews(last) * rateOf(best)) - actions(last);
  if (extra <= 0) return { kind: "matched" };
  const hasAvg = averageVisit !== null && averageVisit !== undefined && Number.isFinite(averageVisit) && averageVisit > 0;
  return { kind: "missed", best: { month: best.month, rate: Math.round(rateOf(best) * 1000) / 10 }, extra, missed: hasAvg ? roundMoney(extra * (averageVisit as number)) : null };
}

/** "May–Oct 2026" (or "Nov 2025–Apr 2026") for the 6 months ending `last`. */
export function sixMonthSpan(last: string): { from: string; to: string } {
  return { from: addMonths(last, -5), to: last };
}

// ---------------------------------------------------------------------------
// Rows ↔ the app
// ---------------------------------------------------------------------------

export interface InsightsRow {
  business_id?: string;
  /** "2026-10-01" */
  month: string;
  views_search_mobile: number;
  views_maps_mobile: number;
  views_search_desktop: number;
  views_maps_desktop: number;
  calls: number;
  directions: number;
  bookings: number;
  website_clicks: number;
  conversations?: number;
  food_orders?: number;
  calls_by_weekday: number[] | null;
  top_keywords: Keyword[] | null;
  fetched_at?: string;
}

export function toRow(businessId: string, m: InsightsMonth, fetchedAt: string): InsightsRow {
  return {
    business_id: businessId,
    month: `${m.month}-01`,
    views_search_mobile: m.viewsSearchMobile,
    views_maps_mobile: m.viewsMapsMobile,
    views_search_desktop: m.viewsSearchDesktop,
    views_maps_desktop: m.viewsMapsDesktop,
    calls: m.calls,
    directions: m.directions,
    bookings: m.bookings,
    website_clicks: m.websiteClicks,
    conversations: m.conversations,
    food_orders: m.foodOrders,
    calls_by_weekday: m.callsByWeekday,
    top_keywords: m.topKeywords,
    fetched_at: fetchedAt,
  };
}

export function fromRow(r: InsightsRow): InsightsMonth {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  return {
    month: String(r.month).slice(0, 7),
    viewsSearchMobile: n(r.views_search_mobile),
    viewsMapsMobile: n(r.views_maps_mobile),
    viewsSearchDesktop: n(r.views_search_desktop),
    viewsMapsDesktop: n(r.views_maps_desktop),
    calls: n(r.calls),
    directions: n(r.directions),
    bookings: n(r.bookings),
    websiteClicks: n(r.website_clicks),
    conversations: n(r.conversations),
    foodOrders: n(r.food_orders),
    callsByWeekday: Array.isArray(r.calls_by_weekday) && r.calls_by_weekday.length === 7 ? r.calls_by_weekday.map(n) : null,
    topKeywords: Array.isArray(r.top_keywords) ? r.top_keywords.filter((k) => k && typeof k.term === "string").map((k) => ({ term: k.term, count: n(k.count) })) : null,
  };
}
