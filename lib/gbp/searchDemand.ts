// Search demand: what people searched to find a business on Google, how
// many saw the listing and how many acted, plus estimated searches in the
// business's area. Plan and sources: docs/search-demand.md.
//
// Nothing here calls an API yet. The Google Business Profile connection
// isn't live, so the page shows a locked preview built from
// SEARCH_DEMAND_EXAMPLE (always rendered with an "Example" watermark),
// and these types are what the Performance API and the area-search
// provider will be mapped into once it is. Pure: no I/O, no React.

/** Google hides small keyword counts: the API returns `{ threshold: "15" }`
 * instead of a value, meaning "fewer than 15". */
export const GOOGLE_KEYWORD_THRESHOLD = 15;

/** One Business Profile Performance API count: exact, or only known to be
 * below Google's threshold. A "fewer_than" count is never shown as a
 * number. */
export type InsightsCount = { kind: "exact"; value: number } | { kind: "fewer_than"; threshold: number };

/** Maps the API's InsightsValue (`{ value: "123" }` or `{ threshold: "15" }`,
 * both int64 strings). Null when neither is a real number. */
export function parseInsightsValue(v: { value?: string; threshold?: string } | null | undefined): InsightsCount | null {
  if (!v) return null;
  if (v.value !== undefined) {
    const n = Number(v.value);
    return Number.isFinite(n) && n >= 0 ? { kind: "exact", value: n } : null;
  }
  if (v.threshold !== undefined) {
    const n = Number(v.threshold);
    return Number.isFinite(n) && n > 0 ? { kind: "fewer_than", threshold: n } : null;
  }
  return null;
}

/** A keyword's count for one calendar month ("2026-09"). */
export interface KeywordMonth {
  month: string;
  count: InsightsCount;
}

/** A search term that showed the listing (searchkeywords.impressions.monthly),
 * months oldest → newest. */
export interface SearchKeyword {
  keyword: string;
  months: KeywordMonth[];
}

/** The daily metrics PostScore reads (fetchMultiDailyMetricsTimeSeries). */
export const PERFORMANCE_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
] as const;
export type PerformanceMetric = (typeof PERFORMANCE_METRICS)[number];

export interface DailyMetricPoint {
  /** "YYYY-MM-DD", the business's own calendar day (Google reports it so). */
  date: string;
  metric: PerformanceMetric;
  value: number;
}

export type Granularity = "weekly" | "monthly";

/** Listing views and actions over one week or month. */
export interface FunnelPeriod {
  /** First and last day, "YYYY-MM-DD". */
  start: string;
  end: string;
  views: { search: number; maps: number };
  calls: number;
  websiteClicks: number;
  directions: number;
}

function emptyPeriod(start: string, end: string): FunnelPeriod {
  return { start, end, views: { search: 0, maps: 0 }, calls: 0, websiteClicks: 0, directions: 0 };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday-start week, or calendar month, containing `date` (UTC-safe:
 * the date string is already the business's local day). */
function bucketBounds(date: string, granularity: Granularity): { start: string; end: string } {
  const d = new Date(`${date}T00:00:00Z`);
  if (granularity === "monthly") {
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    return { start: isoDay(start), end: isoDay(end) };
  }
  const offset = (d.getUTCDay() + 6) % 7;
  const start = new Date(d.getTime() - offset * 86_400_000);
  return { start: isoDay(start), end: isoDay(new Date(start.getTime() + 6 * 86_400_000)) };
}

/** Sums daily points into weekly or monthly periods, oldest → newest. */
export function bucketDaily(points: DailyMetricPoint[], granularity: Granularity): FunnelPeriod[] {
  const byStart = new Map<string, FunnelPeriod>();
  for (const p of points) {
    if (!Number.isFinite(p.value) || p.value < 0) continue;
    const { start, end } = bucketBounds(p.date, granularity);
    const period = byStart.get(start) ?? emptyPeriod(start, end);
    byStart.set(start, period);
    switch (p.metric) {
      case "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH":
      case "BUSINESS_IMPRESSIONS_MOBILE_SEARCH":
        period.views.search += p.value;
        break;
      case "BUSINESS_IMPRESSIONS_DESKTOP_MAPS":
      case "BUSINESS_IMPRESSIONS_MOBILE_MAPS":
        period.views.maps += p.value;
        break;
      case "CALL_CLICKS":
        period.calls += p.value;
        break;
      case "WEBSITE_CLICKS":
        period.websiteClicks += p.value;
        break;
      case "BUSINESS_DIRECTION_REQUESTS":
        period.directions += p.value;
        break;
    }
  }
  return Array.from(byStart.values()).sort((a, b) => a.start.localeCompare(b.start));
}

export interface Funnel {
  views: number;
  actions: number;
  /** actions ÷ views, 0–1; null when there were no views. */
  conversion: number | null;
}

export function funnelOf(p: FunnelPeriod): Funnel {
  const views = p.views.search + p.views.maps;
  const actions = p.calls + p.websiteClicks + p.directions;
  return { views, actions, conversion: views > 0 ? actions / views : null };
}

function latestCount(k: SearchKeyword): InsightsCount | null {
  return k.months.at(-1)?.count ?? null;
}

/** Sort weight: exact counts by size, then every "fewer than" below them. */
function weight(c: InsightsCount | null): number {
  if (!c) return -2;
  return c.kind === "exact" ? c.value : -1;
}

/** The `n` keywords with the most impressions in the latest month. */
export function topKeywords(keywords: SearchKeyword[], n = 10): SearchKeyword[] {
  return [...keywords]
    .sort((a, b) => weight(latestCount(b)) - weight(latestCount(a)) || a.keyword.localeCompare(b.keyword))
    .slice(0, n);
}

export type Trend = "up" | "down" | "flat";

/** Latest month vs the month before, only when both are exact counts
 * (a hidden "fewer than 15" can't be compared). Within ±10% is flat. */
export function keywordTrend(k: SearchKeyword): Trend | null {
  const [prev, last] = k.months.slice(-2).map((m) => m.count);
  if (!prev || !last || prev.kind !== "exact" || last.kind !== "exact") return null;
  if (prev.value === 0) return last.value > 0 ? "up" : "flat";
  const change = (last.value - prev.value) / prev.value;
  return change > 0.1 ? "up" : change < -0.1 ? "down" : "flat";
}

// --- Area search volume (not from the Business Profile API) -------------

/** Keyword Planner gives ranges ("1K–10K") to accounts without ad spend;
 * DataForSEO gives one estimated number. Both are estimates. */
export type AreaVolume = { kind: "range"; low: number; high: number } | { kind: "estimate"; value: number };

export type AreaSearchSource = "google_keyword_planner" | "dataforseo";

export interface AreaSearch {
  keyword: string;
  /** Estimated monthly searches in the city. */
  volume: AreaVolume;
}

/** One cached lookup: shared by every business of the same type in the
 * same city, refreshed after AREA_SEARCH_CACHE_DAYS. */
export interface AreaSearchSet {
  source: AreaSearchSource;
  businessType: string;
  city: string;
  region: string | null;
  fetchedAt: string;
  searches: AreaSearch[];
}

export const AREA_SEARCH_CACHE_DAYS = 30;

/** "liquor_store|newark|de" — the cache row key. */
export function areaSearchCacheKey(businessType: string, city: string, region: string | null): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return [norm(businessType), norm(city), norm(region ?? "")].join("|");
}

export function isAreaCacheFresh(fetchedAt: string, now: Date = new Date()): boolean {
  const age = now.getTime() - new Date(fetchedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < AREA_SEARCH_CACHE_DAYS * 86_400_000;
}

/** The share of estimated area searches the listing showed up for, as a
 * whole-percent range (low = high when the source gives single numbers).
 * Rough by design — listing views include searches for the business's
 * own name and from outside the city — so the UI always labels it an
 * estimate. Null when there's nothing to compare. */
export function visibilityShare(monthlyListingViews: number, area: AreaSearch[]): { low: number; high: number } | null {
  if (!(monthlyListingViews > 0) || area.length === 0) return null;
  let low = 0;
  let high = 0;
  for (const s of area) {
    if (s.volume.kind === "range") {
      low += s.volume.low;
      high += s.volume.high;
    } else {
      low += s.volume.value;
      high += s.volume.value;
    }
  }
  if (high <= 0) return null;
  const pct = (v: number) => Math.min(100, Math.round((monthlyListingViews / v) * 100));
  // More searches → smaller share, so the high volume gives the low share.
  return { low: pct(high), high: low > 0 ? pct(low) : 100 };
}

// --- Tips ----------------------------------------------------------------

/** Where a tip's link goes: a real check row on the Website page or the
 * Overview (anchors from lib/postaiLinks checkAnchorId). */
export const TIP_LINKS = {
  website_services: { path: "/website", anchor: "check-services_presence" },
  website_content: { path: "/website", anchor: "check-content_depth" },
  listing_categories: { path: "", anchor: "check-categories" },
  listing_hours: { path: "", anchor: "check-hours" },
} as const;
export type TipLink = keyof typeof TIP_LINKS;

export type SeoTip =
  /** A word people search for nearby that never brought up the listing. */
  | { kind: "missing_term"; term: string; searchedAs: string; link: TipLink }
  /** Most impressions come from people who already know the name. */
  | { kind: "branded_heavy"; percent: number; link: TipLink }
  /** The listing's best non-name keyword, to repeat on the website. */
  | { kind: "use_top_keyword"; keyword: string; link: TipLink }
  /** "Near me" searches favor complete, open listings. */
  | { kind: "near_me"; searchedAs: string; link: TipLink };

// Words that don't name a product or service.
const GENERIC = new Set([
  "near", "me", "best", "top", "open", "now", "cheap", "local", "nearby", "closest", "the", "a", "an", "in", "of", "for",
  "and", "&", "to", "on", "at", "store", "stores", "shop", "shops", "place", "places", "cerca", "de", "mi", "la", "el",
  "los", "las", "en", "y", "tienda", "mejor", "abierto",
]);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9&]+/)
    .filter(Boolean);
}

/** Words of a search that name what's being looked for (not place, not filler). */
function productTerms(search: string, placeWords: Set<string>): string[] {
  return words(search).filter((w) => w.length > 2 && !GENERIC.has(w) && !placeWords.has(w));
}

function nameTokens(name: string): string[] {
  return words(name).filter((w) => w.length > 2 && !GENERIC.has(w));
}

/** A search for the business by name: it contains every distinctive word of the name. */
export function isBrandedKeyword(keyword: string, businessName: string): boolean {
  const tokens = nameTokens(businessName);
  if (tokens.length === 0) return false;
  const kw = new Set(words(keyword));
  return tokens.every((t) => kw.has(t));
}

function areaVolumeMid(v: AreaVolume): number {
  return v.kind === "range" ? (v.low + v.high) / 2 : v.value;
}

/** Up to 3 tips, each tied to a real keyword or area search in `input`;
 * none when there's no data. */
export function seoTips(input: {
  keywords: SearchKeyword[];
  area: AreaSearch[];
  businessName: string;
  city: string | null;
  region?: string | null;
}): SeoTip[] {
  const tips: SeoTip[] = [];
  const placeWords = new Set([...words(input.city ?? ""), ...words(input.region ?? "")]);
  const listingWords = new Set(input.keywords.flatMap((k) => words(k.keyword)));
  const area = [...input.area].sort((a, b) => areaVolumeMid(b.volume) - areaVolumeMid(a.volume));

  for (const s of area) {
    const missing = productTerms(s.keyword, placeWords).find((w) => !listingWords.has(w));
    if (missing) {
      tips.push({ kind: "missing_term", term: missing, searchedAs: s.keyword, link: "website_services" });
      break;
    }
  }

  let branded = 0;
  let total = 0;
  for (const k of input.keywords) {
    const c = latestCount(k);
    if (c?.kind !== "exact") continue;
    total += c.value;
    if (isBrandedKeyword(k.keyword, input.businessName)) branded += c.value;
  }
  if (total > 0 && branded / total >= 0.5) {
    tips.push({ kind: "branded_heavy", percent: Math.round((branded / total) * 100), link: "listing_categories" });
  }

  const top = topKeywords(input.keywords).find(
    (k) => latestCount(k)?.kind === "exact" && !isBrandedKeyword(k.keyword, input.businessName)
  );
  if (top) tips.push({ kind: "use_top_keyword", keyword: top.keyword, link: "website_content" });

  const nearMe = area.find((s) => /\bnear me\b|\bcerca de mi\b/.test(words(s.keyword).join(" ")));
  if (nearMe) tips.push({ kind: "near_me", searchedAs: nearMe.keyword, link: "listing_hours" });

  return tips.slice(0, 3);
}

// --- What the page renders ------------------------------------------------

export interface SearchDemandData {
  /** True only for SEARCH_DEMAND_EXAMPLE: the UI then watermarks every
   * card "Example". Real data is never marked example. */
  example: boolean;
  businessName: string;
  city: string | null;
  region: string | null;
  /** Oldest → newest; the latest period is shown. */
  funnel: Record<Granularity, FunnelPeriod[]>;
  keywords: SearchKeyword[];
  area: AreaSearchSet | null;
}

const exact = (value: number): InsightsCount => ({ kind: "exact", value });
const fewer: InsightsCount = { kind: "fewer_than", threshold: GOOGLE_KEYWORD_THRESHOLD };
const months = (values: Array<number | null>): KeywordMonth[] =>
  values.map((v, i) => ({ month: `2026-0${4 + i}`, count: v === null ? fewer : exact(v) }));

/** The locked preview's made-up wine shop. Shown only under an "Example"
 * watermark, never as anyone's real numbers. */
export const SEARCH_DEMAND_EXAMPLE: SearchDemandData = {
  example: true,
  businessName: "Example Spirits",
  city: "Springfield",
  region: null,
  funnel: {
    weekly: [
      { start: "2026-09-07", end: "2026-09-13", views: { search: 612, maps: 401 }, calls: 14, websiteClicks: 22, directions: 31 },
      { start: "2026-09-14", end: "2026-09-20", views: { search: 655, maps: 430 }, calls: 17, websiteClicks: 25, directions: 36 },
    ],
    monthly: [
      { start: "2026-08-01", end: "2026-08-31", views: { search: 2510, maps: 1680 }, calls: 61, websiteClicks: 92, directions: 128 },
      { start: "2026-09-01", end: "2026-09-30", views: { search: 2740, maps: 1810 }, calls: 68, websiteClicks: 101, directions: 142 },
    ],
  },
  keywords: [
    { keyword: "example spirits", months: months([410, 430, 455, 470, 480, 512]) },
    { keyword: "liquor store near me", months: months([180, 195, 210, 205, 230, 248]) },
    { keyword: "liquor store", months: months([120, 118, 131, 140, 136, 152]) },
    { keyword: "beer store near me", months: months([70, 82, 77, 90, 96, 104]) },
    { keyword: "liquor store springfield", months: months([64, 60, 71, 66, 70, 73]) },
    { keyword: "craft beer", months: months([30, 34, 29, 41, 38, 45]) },
    { keyword: "bourbon", months: months([22, 25, 31, 28, 33, 36]) },
    { keyword: "liquor store open now", months: months([40, 38, 35, 33, 30, 27]) },
    { keyword: "spirits", months: months([null, 16, 18, 17, 20, 21]) },
    { keyword: "keg", months: months([null, null, 15, null, 16, null]) },
  ],
  area: {
    source: "dataforseo",
    businessType: "liquor_store",
    city: "Springfield",
    region: null,
    fetchedAt: "2026-10-01T00:00:00Z",
    searches: [
      { keyword: "liquor store near me", volume: { kind: "estimate", value: 4400 } },
      { keyword: "wine store near me", volume: { kind: "estimate", value: 2400 } },
      { keyword: "liquor store springfield", volume: { kind: "estimate", value: 1600 } },
      { keyword: "best wine store springfield", volume: { kind: "estimate", value: 720 } },
      { keyword: "beer store near me", volume: { kind: "estimate", value: 590 } },
    ],
  },
};
