// The Growth page's Google Profile tab (Day 22B, docs/mockups/
// google-profile-mockup.html): the conversion-rate math, the five levers
// that raise it, the listing rows, "Last month you: …" and the status of
// changes made from PostScore — all from data PostScore already stores.
// Monthly Google insights (views, calls, searches) arrive in step 2;
// until then their sections show an honest empty state, and sample
// numbers only in practice mode. Pure — safe on the server and the client.

import { offersHref, reviewsHref } from "@/lib/routes";
import type { CheckResult } from "@/lib/scoring";
import { actions, addMonths, monthRange, totalViews, type InsightsMonth, type Keyword } from "@/lib/gbpInsights";
import type { BookingLink, BookingTracking } from "@/lib/bookingPartners";
import { isFresh, monthsAgo, type MediaPostsState } from "@/lib/gbpMediaPosts";
import { specialFor, upcomingHolidays, type HolidayId, type SpecialHourPeriod } from "@/lib/gbpListingFields";
import type { GoogleEditRow } from "@/lib/gbpGoogleEdits";

/** ?tab=google opens this tab; the old ?tab=google-profile links still do. */
export const GOOGLE_TAB_PARAM = "google";
export function isGoogleTabParam(param: string | null | undefined): boolean {
  return param === GOOGLE_TAB_PARAM || param === "google-profile";
}

/** The tab's three parts: how it's going, fix the listing, who changed it. */
export const JUMP_PARTS = ["performance", "edit", "protection"] as const;
export type JumpPart = (typeof JUMP_PARTS)[number];

/** The "On this page" menu, in page order, grouped by part. */
export const JUMP_SECTIONS = [
  { id: "last-month", key: "lastMonth", part: "performance" },
  { id: "funnel", key: "funnel", part: "performance" },
  { id: "searches", key: "searches", part: "performance" },
  { id: "listing", key: "listing", part: "edit" },
  { id: "next", key: "next", part: "edit" },
  { id: "protection", key: "protection", part: "protection" },
] as const;
export type JumpSectionId = (typeof JUMP_SECTIONS)[number]["id"];

/** How far below the menu's bottom edge a section title still counts as
 * "under the menu": jumps land a title 12px below it (scroll-margin). */
export const JUMP_LINE_SLACK = 24;

/** The jump item for a URL hash: a section's own (#protection), or the
 * listing for a row editor's (#edit-hours); null for anything else. */
export function jumpIdFromHash(hash: string | null | undefined): JumpSectionId | null {
  const h = (hash ?? "").replace(/^#/, "");
  const own = JUMP_SECTIONS.find((s) => s.id === h);
  if (own) return own.id;
  return editorFromHash(`#${h}`) ? "listing" : null;
}

/** The active menu item: the last section whose title has reached the line
 * just under the pinned menu (`line` = the menu's bottom + JUMP_LINE_SLACK,
 * in viewport px); the first one while none has; the last one at the
 * bottom of the page, where section 6 can't scroll up that far. */
export function activeJumpSection(tops: Array<{ id: JumpSectionId; top: number }>, line: number, atBottom: boolean): JumpSectionId {
  if (tops.length === 0) return JUMP_SECTIONS[0].id;
  if (atBottom) return tops[tops.length - 1].id;
  let active = tops[0].id;
  for (const s of tops) if (s.top <= line) active = s.id;
  return active;
}

// ---------------------------------------------------------------------------
// Conversion rate
// ---------------------------------------------------------------------------

/** Customer actions ÷ people who saw the listing, as a percent with one
 * decimal (11.8). null when nobody saw it (never a divide by zero) or
 * the numbers aren't real. */
export function conversionRate(actions: number, viewers: number): number | null {
  if (!Number.isFinite(actions) || !Number.isFinite(viewers) || viewers <= 0 || actions < 0) return null;
  return Math.round((actions / viewers) * 1000) / 10;
}

/** Two conversion rates' difference as whole customers per 100 people:
 * under 0.5 is "the same"; otherwise rounded (0.5–1.4 → 1, 3.0 → 3). */
export function per100Change(now: number, before: number): { dir: "up" | "down" | "same"; count: number } {
  const diff = Math.round((now - before) * 10) / 10;
  if (Math.abs(diff) < 0.5) return { dir: "same", count: 0 };
  return { dir: diff > 0 ? "up" : "down", count: Math.max(1, Math.round(Math.abs(diff))) };
}

/** "11.8%" / "11,8 %". */
export function formatRate(rate: number, locale: "en" | "es"): string {
  const n = rate.toLocaleString(locale === "es" ? "es-ES" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return locale === "es" ? `${n} %` : `${n}%`;
}

/** The 1st of the month after `now` in the business's time zone, as a
 * UTC-noon ISO date (safe to format in "UTC"). */
export function nextMonthlyUpdate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric" }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1, 12)).toISOString();
}

/** A sample month: views split like the mockup's audience (59 / 24 / 11 / 6). */
function sampleMonth(month: string, views: number, calls: number, directions: number, bookings: number, websiteClicks: number, callsByWeekday: number[] | null = null, keywords: Keyword[] | null = null): InsightsMonth {
  const sp = Math.round(views * 0.59);
  const mp = Math.round(views * 0.24);
  const sc = Math.round(views * 0.11);
  return { month, viewsSearchMobile: sp, viewsMapsMobile: mp, viewsSearchDesktop: sc, viewsMapsDesktop: views - sp - mp - sc, calls, directions, bookings, websiteClicks, conversations: 0, foodOrders: 0, callsByWeekday, topKeywords: keywords };
}

/** The mockup's sample search terms. */
export const SAMPLE_SEARCHES: Keyword[] = [
  { term: "hair salon tarrytown", count: 212 },
  { term: "hair express", count: 140 },
  { term: "balayage near me", count: 61 },
  { term: "hair color sleepy hollow", count: 23 },
  { term: "keratin treatment", count: 15 },
];

/** The mockup's sample numbers — shown in practice mode only, under a
 * "Sample data" tag. Never real, never shown to a real owner. */
export const SAMPLE_INSIGHTS: InsightsMonth[] = [
  sampleMonth("2026-05", 610, 22, 18, 5, 5),
  sampleMonth("2026-06", 640, 24, 20, 6, 7),
  sampleMonth("2026-07", 655, 23, 21, 6, 7),
  sampleMonth("2026-08", 670, 27, 23, 8, 9),
  sampleMonth("2026-09", 680, 25, 24, 7, 13),
  // Tue–Thu 16, Fri–Sat 12, Sun–Mon 3 (Sunday first).
  sampleMonth("2026-10", 704, 31, 27, 11, 14, [2, 1, 5, 6, 5, 6, 6], SAMPLE_SEARCHES),
];
/** The sample's average visit (dollars), for "What that could be worth". */
export const SAMPLE_AVERAGE_VISIT = 45;

/** The newest stored month and the one just before it (null when that
 * calendar month isn't stored). */
export function lastTwo(months: InsightsMonth[]): { last: InsightsMonth | null; prev: InsightsMonth | null } {
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const last = sorted[sorted.length - 1] ?? null;
  const prev = last ? (sorted.find((m) => m.month === addMonths(last.month, -1)) ?? null) : null;
  return { last, prev };
}

/** The rate for each of the 6 calendar months ending with the newest
 * stored one, oldest first (null where a month isn't stored or nobody saw
 * the listing). */
export function rateTrend(months: InsightsMonth[], count = 6): Array<{ month: string; rate: number | null }> {
  const { last } = lastTwo(months);
  if (!last) return [];
  const byMonth = new Map(months.map((m) => [m.month, m]));
  return monthRange(last.month, count).map((month) => {
    const m = byMonth.get(month);
    return { month, rate: m ? conversionRate(actions(m), totalViews(m)) : null };
  });
}

/** The 6 stored months ending with the newest one, oldest first. */
export function lastSixMonths(months: InsightsMonth[]): InsightsMonth[] {
  const { last } = lastTwo(months);
  if (!last) return [];
  const byMonth = new Map(months.map((m) => [m.month, m]));
  return monthRange(last.month, 6).flatMap((m) => (byMonth.has(m) ? [byMonth.get(m)!] : []));
}

/** The practice-mode sample ideas for section 5 (1: add services,
 * 2: add a second category), never one the real listing contradicts: a
 * listing that already has more than one category doesn't get "add a
 * second category". (Google's services list isn't stored, so idea 1 has
 * nothing to check against.) */
export function sampleIdeas(categories: string[] | null | undefined): number[] {
  return [1, 2].filter((n) => !(n === 2 && (categories?.length ?? 0) > 1));
}

/** The 6-month conversion chart's geometry: x in 0–100 (% of the width),
 * y in px from the top of a `plotH`-tall plot. The scale starts at 0% and
 * tops out at the next 10% above the best month (at least 10%). Months
 * with no data are gaps, never zeros. Pure. */
export interface RateChart {
  yMax: number;
  grid: number[];
  points: Array<{ month: string; rate: number | null; x: number; y: number | null }>;
  /** One monotone curve per run of months with data (a gap splits it). */
  segments: Array<{ line: string; area: string }>;
  best: { month: string; rate: number } | null;
}

export function rateChart(trend: Array<{ month: string; rate: number | null }>, plotH: number): RateChart | null {
  const real = trend.filter((p): p is { month: string; rate: number } => p.rate !== null);
  if (real.length === 0) return null;
  const max = Math.max(...real.map((p) => p.rate));
  const yMax = Math.max(10, Math.ceil((max + 1e-9) / 10) * 10);
  const n = trend.length;
  const points = trend.map((p, i) => ({ month: p.month, rate: p.rate, x: n === 1 ? 50 : (i / (n - 1)) * 100, y: p.rate === null ? null : plotH - (p.rate / yMax) * plotH }));
  const runs: Array<Array<{ x: number; y: number }>> = [];
  let run: Array<{ x: number; y: number }> = [];
  for (const p of points) {
    if (p.y === null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push({ x: p.x, y: p.y });
  }
  if (run.length) runs.push(run);
  const segments = runs.filter((r) => r.length > 1).map((r) => {
    const line = monotonePath(r);
    return { line, area: `${line} L${r[r.length - 1].x},${plotH} L${r[0].x},${plotH} Z` };
  });
  const best = real.reduce((a, b) => (b.rate > a.rate ? b : a));
  return { yMax, grid: [0, yMax / 2, yMax], points, segments, best };
}

/** A smooth curve through the points that never overshoots them
 * (Fritsch–Carlson monotone cubic), as an SVG path. */
export function monotonePath(pts: Array<{ x: number; y: number }>): string {
  const r = (v: number) => Math.round(v * 100) / 100;
  if (pts.length < 2) return pts.length ? `M${r(pts[0].x)},${r(pts[0].y)}` : "";
  const n = pts.length;
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const slope = pts.slice(1).map((p, i) => (p.y - pts[i].y) / dx[i]);
  const m = pts.map((_, i) => (i === 0 ? slope[0] : i === n - 1 ? slope[n - 2] : slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${r(pts[0].x)},${r(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${r(pts[i].x + h)},${r(pts[i].y + m[i] * h)} ${r(pts[i + 1].x - h)},${r(pts[i + 1].y - m[i + 1] * h)} ${r(pts[i + 1].x)},${r(pts[i + 1].y)}`;
  }
  return d;
}


// ---------------------------------------------------------------------------
// What raises your conversion rate: five levers
// ---------------------------------------------------------------------------

export type Tone = "ok" | "warn" | "bad" | "neutral";
export type LeverId = "reviews" | "photos" | "posts" | "deals" | "website";
export const LEVER_IDS: readonly LeverId[] = ["reviews", "photos", "posts", "deals", "website"];

export interface Lever {
  id: LeverId;
  /** dashboard.googleTab.lever.{id}.status.{status} with `params`. */
  status: string;
  /** dashboard.googleTab.lever.pill.{pill} with `params`. */
  pill: string;
  params: Record<string, number>;
  tone: Tone;
  href: string;
}

export interface LeverInputs {
  businessId: string;
  /** Photos and posts from Google (lib/gbpMediaPosts.ts); null/undefined before the first check. */
  media?: MediaPostsState | null;
  now?: number;
  /** The last review-reply check; null before the first one. */
  replies: { replied: number; inWindow: number } | null;
  /** Coupons running now (active, not expired). */
  couponsRunning: number;
  /** The website category's points; null when there's no website. */
  website: { earned: number; of: number; fixes: number } | null;
}

/** Full points for review replies start at 80% (the scoring rule). */
export const REPLIED_DONE_PERCENT = 80;
/** The website lever is green from 27 of 30. */
export const WEBSITE_GOOD_POINTS = 27;

export function levers(input: LeverInputs): Lever[] {
  const id = input.businessId;
  const reviews: Lever = ((): Lever => {
    const href = reviewsHref(id, { hash: "google-reviews" });
    if (!input.replies) return { id: "reviews", status: "notChecked", pill: "reply", params: {}, tone: "neutral", href };
    if (input.replies.inWindow <= 0) return { id: "reviews", status: "noRecent", pill: "done", params: {}, tone: "ok", href };
    const percent = Math.round((input.replies.replied / input.replies.inWindow) * 100);
    return percent >= REPLIED_DONE_PERCENT
      ? { id: "reviews", status: "replied", pill: "done", params: { percent }, tone: "ok", href }
      : { id: "reviews", status: "replied", pill: "reply", params: { percent }, tone: "warn", href };
  })();
  const now = input.now ?? Date.now();
  // Photos: "newest N mo ago" → "Add 3" (amber) / "Done" (green, within 30 days).
  const photos: Lever = ((): Lever => {
    const p = input.media?.photos;
    const href = "#edit-photos";
    if (!p) return { id: "photos", status: "soon", pill: "soon", params: {}, tone: "neutral", href };
    if (p.count === 0 || !p.newestAt) return { id: "photos", status: "none", pill: "add3", params: {}, tone: "bad", href };
    return isFresh(p.newestAt, now)
      ? { id: "photos", status: "newest", pill: "done", params: { months: monthsAgo(p.newestAt, now) }, tone: "ok", href }
      : { id: "photos", status: "newest", pill: "add3", params: { months: monthsAgo(p.newestAt, now) }, tone: "warn", href };
  })();
  // Posts: "{N} in 30 days" / "none in 30 days" → "Post" (red at 0, amber at 1) / "Done" (green at 2+).
  const posts: Lever = ((): Lever => {
    const p = input.media?.posts;
    // This week's post, opened (components/gbp/ThisWeekList.tsx).
    const href = "#this-week-post";
    if (!p) return { id: "posts", status: "soon", pill: "soon", params: {}, tone: "neutral", href };
    if (p.last30 === 0) return { id: "posts", status: "none", pill: "post", params: {}, tone: "bad", href };
    return { id: "posts", status: "count", pill: p.last30 >= 2 ? "done" : "post", params: { count: p.last30 }, tone: p.last30 >= 2 ? "ok" : "warn", href };
  })();
  const deals: Lever =
    input.couponsRunning > 0
      ? { id: "deals", status: "running", pill: "running", params: { count: input.couponsRunning }, tone: "ok", href: offersHref(id, "coupons", { hash: "new-offer" }) }
      : { id: "deals", status: "none", pill: "start", params: {}, tone: "bad", href: offersHref(id, "coupons", { hash: "new-offer" }) };
  const website: Lever = ((): Lever => {
    // The Website page's own fix list (or the starter site when there's no website).
    const href = input.website ? `/business/${id}/website#website-checks` : `/business/${id}/website#starter-site`;
    if (!input.website) return { id: "website", status: "none", pill: "start", params: {}, tone: "bad", href };
    const { earned, of, fixes } = input.website;
    const params = { earned: Math.round(earned), of, count: fixes };
    if (fixes === 0) return { id: "website", status: "score", pill: "done", params, tone: "ok", href };
    return { id: "website", status: "score", pill: "fixes", params, tone: Math.round(earned) >= WEBSITE_GOOD_POINTS ? "ok" : "warn", href };
  })();
  return [reviews, photos, posts, deals, website];
}

// ---------------------------------------------------------------------------
// Last month you: …
// ---------------------------------------------------------------------------

/** What the owner did from PostScore last month, from the real logs. */
export interface MonthActivity {
  /** Listing changes that went through (gbp_changes), oldest first, once each. */
  listing: ListingChangeKind[];
  /** Review replies posted from PostScore. */
  replies: number;
  /** Coupons and referral cards started. */
  campaigns: number;
}

export type ListingChangeKind = "hours" | "phone" | "description" | "website_link" | "customer_details" | "booking_link" | "holiday_hours" | "services" | "photos";

export interface MonthRecap {
  did: Array<{ key: string; count?: number }>;
  notYet: string[];
}

/** "Last month you: …. Not yet: …" — only what the logs show; never a
 * claim that any of it changed the rate. */
export function monthRecap(a: MonthActivity): MonthRecap {
  const did: MonthRecap["did"] = [...a.listing.map((k) => ({ key: `listing.${k}` })), ...(a.replies > 0 ? [{ key: "replies", count: a.replies }] : []), ...(a.campaigns > 0 ? [{ key: "campaigns", count: a.campaigns }] : [])];
  const notYet = [...(a.replies === 0 ? ["replies"] : []), ...(a.campaigns === 0 ? ["campaign"] : []), ...(a.listing.length === 0 ? ["listing"] : [])];
  return { did, notYet };
}

/** The gbp_changes kind/field a change was, in the owner's words. */
export function listingChangeKind(kind: string, field: string): ListingChangeKind | null {
  const k = kind.replace(/_practice$/, "");
  if (k === "profile_info") return field === "hours" || field === "phone" || field === "description" ? field : null;
  if (k === "attributes") return "customer_details";
  if (k === "website_uri") return "website_link";
  if (k === "order_link") return "booking_link";
  if (k === "special_hours") return "holiday_hours";
  if (k === "services") return "services";
  if (k === "photos") return "photos";
  // "Change it back" after Google's own edit (lib/gbpGoogleEdits.server.ts).
  if (k === "google_revert") return field === "phoneNumbers" ? "phone" : field === "websiteUri" ? "website_link" : field === "regularHours" ? "hours" : null;
  return null;
}

export const PRACTICE_KIND = /_practice$/;

/** Made in practice mode (never sent to Google): the row's own flag
 * (supabase/gbp-changes-practice.sql), or — before that column exists —
 * a "_practice" kind or the practice listing. */
export function isPracticeRow(r: Pick<ChangeRow, "kind" | "practice" | "location_name">): boolean {
  if (typeof r.practice === "boolean" && r.practice) return true;
  return PRACTICE_KIND.test(r.kind) || r.location_name === "locations/practice";
}

/** gbp_changes.error_reason when a held change was later turned down by Google. */
export const REJECTED_BY_GOOGLE = "rejected_by_google";

/** A real change Google still showed as "reviewing" after this long gets re-read. */
export const STALE_REVIEW_DAYS = 3;

export interface ChangeRow {
  batch_id: string;
  kind: string;
  field: string;
  status: string;
  approved_at: string;
  undone_at?: string | null;
  undo_closed_at?: string | null;
  undo_of?: string | null;
  before_value?: string | null;
  after_value?: string | null;
  /** supabase/gbp-changes-practice.sql; absent before it runs. */
  practice?: boolean | null;
  location_name?: string | null;
  error_reason?: string | null;
  /** Day 23E (supabase/day23e-posts-answers.sql): 'answers' / 'approve_all'; absent before it runs. */
  origin?: string | null;
}

/** "2026-10": the month before `now`, in the business's time zone. */
export function previousMonthKey(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric" }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

/** The month (business time zone) a timestamp falls in: "2026-10". */
export function monthKeyOf(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric" }).formatToParts(new Date(iso));
  return `${parts.find((p) => p.type === "year")?.value}-${String(parts.find((p) => p.type === "month")?.value).padStart(2, "0")}`;
}

/** Listing changes that went through last month, each kind once — real
 * ones only (practice mode's never count, even in practice mode). Undos
 * and failures don't count. */
export function monthListingChanges(rows: ChangeRow[], month: string, timeZone: string): ListingChangeKind[] {
  const out: ListingChangeKind[] = [];
  for (const r of [...rows].sort((a, b) => a.approved_at.localeCompare(b.approved_at))) {
    if (isPracticeRow(r) || r.undo_of || r.undone_at) continue;
    if (r.status !== "sent" && r.status !== "pending_review") continue;
    if (monthKeyOf(r.approved_at, timeZone) !== month) continue;
    const k = listingChangeKind(r.kind, r.field);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Made from PostScore
// ---------------------------------------------------------------------------

export const UNDO_DAYS = 7;
const DAY_MS = 86_400_000;

export interface MadeChange {
  kind: ListingChangeKind;
  /** live · undo (with daysLeft) · reviewing · rejected (Google turned it down) · undone · failed;
   * practice rows: "held" instead of "reviewing" — never "Google reviewing". */
  status: "live" | "undo" | "reviewing" | "rejected" | "held" | "undone" | "failed";
  /** Made in practice mode (the "Practice" tag). */
  practice?: boolean;
  daysLeft: number;
  at: string;
  batchId?: string;
  /** The new value, short: a text, or the holiday dates it set. */
  value?: MadeValue | null;
}

export type MadeValue = { text: string } | { added: string[] } | { photos: number } | { dates: Array<{ date: string; closed: boolean; open: GTimeLike | null; close: GTimeLike | null }> };
type GTimeLike = { hours?: number; minutes?: number };

const short = (v: string, max = 48) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);
const parse = (v: string | null | undefined): unknown => {
  if (v === null || v === undefined) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

/** A change's new value as the "Made from PostScore" row shows it: the
 * text for phone / description / links; the services it added; the holiday
 * dates it set. null when there's nothing short to show (hours, details). */
export function madeValue(kind: ListingChangeKind, before: string | null | undefined, after: string | null | undefined): MadeValue | null {
  const a = parse(after);
  const b = parse(before);
  if (kind === "services" && Array.isArray(a)) {
    const label = (i: unknown) => (i as { freeFormServiceItem?: { label?: { displayName?: string } } })?.freeFormServiceItem?.label?.displayName ?? null;
    const had = new Set((Array.isArray(b) ? b : []).map(label));
    const added = a.map(label).filter((n): n is string => !!n && !had.has(n));
    return added.length ? { added } : null;
  }
  if (kind === "holiday_hours" && Array.isArray(a)) {
    type P = { startDate?: { year: number; month: number; day: number }; closed?: boolean; openTime?: GTimeLike; closeTime?: GTimeLike };
    const key = (p: P) => (p.startDate ? `${p.startDate.year}-${String(p.startDate.month).padStart(2, "0")}-${String(p.startDate.day).padStart(2, "0")}` : "");
    const had = new Set((Array.isArray(b) ? (b as P[]) : []).map((p) => JSON.stringify(p)));
    const dates = (a as P[]).filter((p) => p.startDate && !had.has(JSON.stringify(p))).map((p) => ({ date: key(p), closed: !!p.closed, open: p.openTime ?? null, close: p.closeTime ?? null }));
    return dates.length ? { dates } : null;
  }
  if (kind === "hours" || kind === "customer_details") return null;
  if (typeof a === "string" && a.trim()) return { text: short(a.trim()) };
  if (a && typeof a === "object" && typeof (a as { primaryPhone?: unknown }).primaryPhone === "string") return { text: short((a as { primaryPhone: string }).primaryPhone) };
  return null;
}

/** The latest changes made from PostScore, newest first, one per batch. */
export function madeFromPostScore(rows: ChangeRow[], now: number, practice: boolean, max = 50): MadeChange[] {
  const seen = new Set<string>();
  const out: MadeChange[] = [];
  for (const r of [...rows].sort((a, b) => b.approved_at.localeCompare(a.approved_at))) {
    if (isPracticeRow(r) !== practice || r.undo_of || r.status === "sending" || seen.has(r.batch_id)) continue;
    const kind = listingChangeKind(r.kind, r.field);
    if (!kind) continue;
    seen.add(r.batch_id);
    const left = Math.ceil((Date.parse(r.approved_at) + UNDO_DAYS * DAY_MS - now) / DAY_MS);
    const isPractice = isPracticeRow(r);
    const status: MadeChange["status"] =
      r.status === "failed"
        ? r.error_reason === REJECTED_BY_GOOGLE
          ? "rejected"
          : "failed"
        : r.undone_at
          ? "undone"
          : r.status === "pending_review"
            ? isPractice
              ? "held"
              : "reviewing"
            : left > 0 && !r.undo_closed_at
              ? "undo"
              : "live";
    // Photos: one row per photo, one line per batch ("Photos · 3 added").
    const value = kind === "photos" ? { photos: rows.filter((x) => x.batch_id === r.batch_id && x.status === "sent" && !x.undo_of).length } : madeValue(kind, r.before_value, r.after_value);
    out.push({ kind, status, daysLeft: Math.max(0, left), at: r.approved_at, batchId: r.batch_id, value, ...(isPractice ? { practice: true } : {}) });
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Your listing
// ---------------------------------------------------------------------------

export type RowStatus = "ok" | "warn" | "bad" | "neutral" | "soon";
export type Editor = "hours" | "phone" | "description" | "website" | "customer_details" | "booking" | "booking_steps" | "booking_partner" | "messaging" | "holiday" | "services" | "photos";

export interface ListingRow {
  id: string;
  status: RowStatus;
  /** The value as shown; null → the row's own "missing" wording. */
  value: string | null;
  /** The check's own explanation, or null for the row's fixed note. */
  note: string | null;
  action: { kind: "editor"; editor: Editor } | { kind: "link"; href: string; external: boolean } | null;
  /** Extra facts for the row's words (the booking row: kind, provider, case). */
  meta?: Record<string, string>;
}

export interface ListingGroup {
  id: "reach" | "open" | "who" | "fresh";
  rows: ListingRow[];
}

export interface ListingInput {
  businessId: string;
  checks: CheckResult[];
  phone: string | null;
  website: string | null;
  category: string | null;
  openingHours: string[] | null;
  photoCount: number | null;
  rating: number | null;
  reviewCount: number | null;
  messagingOn: boolean | null;
  replies: { replied: number; inWindow: number } | null;
  /** Photos and posts from Google (lib/gbpMediaPosts.ts). */
  media?: MediaPostsState | null;
  now?: number;
  /** From the real listing read: special hours, service names, categories. */
  extras?: ListingExtras | null;
  /** The real Book online button and whether Google counts its bookings (lib/bookingPartners.ts). */
  booking?: BookingState | null;
}

export interface ListingExtras {
  specialPeriods: SpecialHourPeriod[];
  services: string[];
  /** Day 23E: how many of those services have a price on Google. */
  pricedServices?: number | null;
  categories: string[];
  /** Customer details: the 3 scored groups set?, how many extras can be added, the ones to suggest. */
  details?: { payment: boolean; parking: boolean; accessibility: boolean; open: number; suggest: Array<{ id: string; label: string }> } | null;
  /** The customer details the owner has set (attribute ids); null when not read. */
  attributeIds?: string[] | null;
  /** metadata.hasVoiceOfMerchant: Google treats the owner as verified. */
  verified?: boolean | null;
  description?: string | null;
}

/** Holiday hours: the US holidays in the next 6 weeks and whether each is set. */
function holidayRow(input: ListingInput): ListingRow {
  if (!input.extras) return { id: "holiday", status: "soon", value: null, note: null, action: null };
  const now = input.now ?? Date.now();
  const holidays = upcomingHolidays(new Date(now));
  const list = holidays.map((h) => ({ id: h.id, date: h.date, set: !!specialFor(input.extras!.specialPeriods, h.date) }));
  const action = { kind: "editor" as const, editor: "holiday" as const };
  if (list.length === 0) return { id: "holiday", status: "ok", value: null, note: null, action: null, meta: { kind: "none" } };
  return { id: "holiday", status: list.every((h) => h.set) ? "ok" : "warn", value: null, note: null, action, meta: { kind: "list", list: JSON.stringify(list) } };
}

/** Services: the first 6 names and "+N more". */
function servicesRow(input: ListingInput): ListingRow | null {
  if (!input.extras) return null;
  const names = input.extras.services;
  return { id: "services", status: names.length > 0 ? "ok" : "warn", value: names.length > 0 ? String(names.length) : null, note: null, action: { kind: "editor", editor: "services" }, meta: { names: JSON.stringify(names) } };
}

export interface BookingState {
  link: BookingLink;
  tracking: BookingTracking;
}

/** The booking row from the real link: none → "Add the link"; the owner's
 * own link → ✓ with the editor (or ! with "Turn on Google booking" in case
 * B); a partner's link → ✓, "Managed by {partner}", read-only. Unknown (no
 * read): the editor reads it live. */
function bookingRow(booking: BookingState | null | undefined): ListingRow {
  if (!booking) return { id: "booking", status: "neutral", value: null, note: null, action: { kind: "editor", editor: "booking" } };
  const { link, tracking } = booking;
  if (link.kind === "none") return { id: "booking", status: "warn", value: null, note: null, action: { kind: "editor", editor: "booking" }, meta: { kind: "none" } };
  const meta = { kind: link.kind, provider: link.provider, uri: link.uri, tracking: tracking.kind };
  if (link.kind === "partner") return { id: "booking", status: "ok", value: link.provider, note: null, action: { kind: "editor", editor: "booking_partner" }, meta };
  if (tracking.kind === "turn_on") return { id: "booking", status: "warn", value: link.provider, note: null, action: { kind: "editor", editor: "booking_steps" }, meta };
  return { id: "booking", status: "ok", value: link.provider, note: null, action: { kind: "editor", editor: "booking" }, meta };
}

/** ✓ full points, ✕ none, ! some; neutral when the check couldn't run. */
export function checkStatus(check: CheckResult | undefined): RowStatus {
  if (!check || check.earnedPoints === null) return "neutral";
  if (check.earnedPoints >= check.maxPoints) return "ok";
  return check.earnedPoints <= 0 ? "bad" : "warn";
}

const DAY_ABBR: Record<string, string> = {};
for (const [full, short] of [
  ["monday", "Mon"], ["tuesday", "Tue"], ["wednesday", "Wed"], ["thursday", "Thu"], ["friday", "Fri"], ["saturday", "Sat"], ["sunday", "Sun"],
  ["lunes", "lun"], ["martes", "mar"], ["miércoles", "mié"], ["jueves", "jue"], ["viernes", "vie"], ["sábado", "sáb"], ["domingo", "dom"],
]) DAY_ABBR[full] = short;

/** Google's "Monday: 9:00 AM – 5:00 PM" lines, with days that share
 * hours run together: "Mon–Fri 9:00 AM – 5:00 PM · Sat–Sun Closed". */
export function compactHours(lines: string[] | null): string | null {
  if (!lines || lines.length === 0) return null;
  const days = lines.map((l) => {
    const i = l.indexOf(":");
    const day = i > 0 ? l.slice(0, i).trim() : l.trim();
    return { day: DAY_ABBR[day.toLowerCase()] ?? day.slice(0, 3), hours: i > 0 ? l.slice(i + 1).trim().replace(/ | /g, " ") : "" };
  });
  const runs: Array<{ from: string; to: string; hours: string }> = [];
  for (const d of days) {
    const last = runs[runs.length - 1];
    if (last && last.hours === d.hours) last.to = d.day;
    else runs.push({ from: d.day, to: d.day, hours: d.hours });
  }
  return runs.map((r) => `${r.from === r.to ? r.from : `${r.from}–${r.to}`} ${r.hours}`.trim()).join(" · ");
}

function host(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const GOOGLE_BUSINESS_URL = "https://business.google.com/";

export function listingGroups(input: ListingInput): ListingGroup[] {
  const check = (id: string) => input.checks.find((c) => c.id === id);
  const note = (id: string) => check(id)?.explanation ?? null;
  const row = (id: string, checkId: string | null, value: string | null, action: ListingRow["action"], status?: RowStatus): ListingRow => ({
    id,
    status: status ?? (checkId ? checkStatus(check(checkId)) : "neutral"),
    value,
    note: checkId ? note(checkId) : null,
    action,
  });
  const editor = (e: Editor): ListingRow["action"] => ({ kind: "editor", editor: e });
  const repliesText = input.replies && input.replies.inWindow > 0 ? `${input.replies.replied}/${input.replies.inWindow}` : null;
  return [
    {
      id: "reach",
      rows: [
        row("phone", "completeness.phone", input.phone, editor("phone")),
        row("website", "completeness.website_link", host(input.website), editor("website")),
        // Read live from Google when opened — nothing saved to show here.
        bookingRow(input.booking),
        row("messaging", null, null, editor("messaging"), input.messagingOn === null ? "neutral" : input.messagingOn ? "ok" : "warn"),
      ],
    },
    {
      id: "open",
      rows: [row("hours", "completeness.hours", compactHours(input.openingHours), editor("hours")), holidayRow(input)],
    },
    {
      id: "who",
      rows: [
        row("category", "completeness.categories", input.category, { kind: "link", href: GOOGLE_BUSINESS_URL, external: true }),
        // The description is read live from Google when opened.
        ...(servicesRow(input) ? [servicesRow(input)!] : []),
        // From the real listing read: ! when it's under 250 characters (or empty).
        descriptionRow(input, row, editor("description")),
        (() => {
          const r = row("customerDetails", "completeness.customer_details", null, editor("customer_details"));
          const d = input.extras?.details;
          // "Payments ✓ · Parking ✗ · Accessibility ✗ · N more details you can add" (the status stays the scored check's).
          return d ? { ...r, meta: { payment: d.payment ? "1" : "0", parking: d.parking ? "1" : "0", accessibility: d.accessibility ? "1" : "0", open: String(d.open) } } : r;
        })(),
      ],
    },
    {
      id: "fresh",
      rows: [
        photosRow(input),
        postsRow(input),
        {
          ...row("reviews", "visibility.review_replies", input.rating !== null ? `${input.rating.toFixed(1)} ★ · ${input.reviewCount ?? 0}` : null, { kind: "link", href: reviewsHref(input.businessId, { hash: "google-reviews" }), external: false }),
          note: repliesText,
        },
      ],
    },
  ];
}

/** Photos: Google's own count and newest photo when read (✓ within 30
 * days, ! older); before the first read, the scan's count. */
export const SHORT_DESCRIPTION = 250;
function descriptionRow(input: ListingInput, row: (id: string, checkId: string | null, value: string | null, action: ListingRow["action"], status?: RowStatus) => ListingRow, action: ListingRow["action"]): ListingRow {
  const text = input.extras?.description;
  if (text === undefined || input.extras === null || input.extras === undefined) return row("description", null, null, action);
  const length = (text ?? "").trim().length;
  return { ...row("description", null, null, action, length === 0 ? "bad" : length < SHORT_DESCRIPTION ? "warn" : "ok"), meta: { short: length < SHORT_DESCRIPTION ? "1" : "0" } };
}

function photosRow(input: ListingInput): ListingRow {
  // "Add photos": PostScore's upload panel (or, off the live list, the steps on Google).
  const action = { kind: "editor" as const, editor: "photos" as const };
  const p = input.media?.photos;
  const now = input.now ?? Date.now();
  if (!p) {
    const check = input.checks.find((c) => c.id === "completeness.photos");
    return { id: "photos", status: checkStatus(check), value: input.photoCount !== null ? String(input.photoCount) : null, note: null, action };
  }
  if (p.count === 0 || !p.newestAt) return { id: "photos", status: "bad", value: "0", note: null, action, meta: { kind: "none" } };
  return { id: "photos", status: isFresh(p.newestAt, now) ? "ok" : "warn", value: String(p.count), note: null, action, meta: { kind: "read", months: String(monthsAgo(p.newestAt, now)) } };
}

/** Google posts: ✓ with one in the last 30 days, ! with none. */
function postsRow(input: ListingInput): ListingRow {
  const p = input.media?.posts;
  if (!p) return { id: "posts", status: "soon", value: null, note: null, action: null };
  const action = { kind: "link" as const, href: "#this-week-post", external: false };
  if (p.last30 === 0) return { id: "posts", status: "warn", value: null, note: null, action, meta: { kind: "none", lastAt: p.lastAt ?? "" } };
  return { id: "posts", status: "ok", value: String(p.last30), note: null, action, meta: { kind: "count", lastAt: p.lastAt ?? "" } };
}

/** The header strip's counts: OK / to fix / to improve. */
export function listingCounts(groups: ListingGroup[]): { ok: number; fix: number; improve: number } {
  const rows = groups.flatMap((g) => g.rows);
  return { ok: rows.filter((r) => r.status === "ok").length, fix: rows.filter((r) => r.status === "bad").length, improve: rows.filter((r) => r.status === "warn").length };
}

/** The editor a ?tab=google#edit-… link opens. */
export function editorFromHash(hash: string): Editor | null {
  const h = hash.replace(/^#/, "").split("?")[0];
  if (h === "edit-hours") return "hours";
  if (h === "edit-messaging") return "messaging";
  if (h === "edit-booking-steps") return "booking_steps";
  if (h === "edit-booking") return "booking";
  if (h === "edit-holiday") return "holiday";
  if (h === "edit-services") return "services";
  if (h === "edit-phone") return "phone";
  if (h === "edit-description") return "description";
  if (h === "edit-photos") return "photos";
  if (h === "edit-website-link") return "website";
  if (h === "edit-customer-details") return "customer_details";
  return null;
}

/** "synced 2 h ago": the age in whole minutes, hours or days. */
export function syncedAgo(iso: string | null, now: number): { unit: "minutes" | "hours" | "days"; count: number } | null {
  if (!iso) return null;
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return { unit: "minutes", count: Math.max(1, minutes) };
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return { unit: "hours", count: hours };
  return { unit: "days", count: Math.floor(hours / 24) };
}

// ---------------------------------------------------------------------------
// Changes by anyone else
// ---------------------------------------------------------------------------

export type WatchedField = "name" | "phone" | "address" | "hours" | "website";
export const WATCHED_FIELDS: readonly WatchedField[] = ["name", "phone", "address", "hours", "website"];
const FIELD_KIND: Record<WatchedField, ListingChangeKind | null> = { name: null, phone: "phone", address: null, hours: "hours", website: "website_link" };

/** Phone, hours and website changes between the last two scans that
 * weren't made from PostScore in that time — someone else's edit, or a
 * suggested edit Google accepted. */
export function changedByOthers(changed: WatchedField[], rows: ChangeRow[], fromAt: string, toAt: string): WatchedField[] {
  const ours = new Set(
    rows
      .filter((r) => !isPracticeRow(r) && !r.undo_of && r.status !== "failed" && r.approved_at > fromAt && r.approved_at <= toAt)
      .map((r) => listingChangeKind(r.kind, r.field))
      .filter((k): k is ListingChangeKind => k !== null)
  );
  return changed.filter((f) => {
    const k = FIELD_KIND[f];
    return !k || !ours.has(k);
  });
}

export interface WatchedChange {
  field: WatchedField;
  from: string | null;
  to: string | null;
}

interface SnapshotLike {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  openingHours?: string[] | null;
}

/** The old → new value of each changed field between two scans. Hours:
 * the first day that differs ("Monday: 9 AM–5 PM" → "Monday: 9 AM–6 PM"). */
export function watchedChanges(from: SnapshotLike, to: SnapshotLike, fields: WatchedField[]): WatchedChange[] {
  return fields.map((field) => {
    if (field === "hours") {
      const a = from.openingHours ?? [];
      const b = to.openingHours ?? [];
      const i = Array.from({ length: Math.max(a.length, b.length) }, (_, k) => k).find((k) => (a[k] ?? "") !== (b[k] ?? ""));
      return { field, from: i === undefined ? null : (a[i] ?? null), to: i === undefined ? null : (b[i] ?? null) };
    }
    const v = (s: SnapshotLike) => (field === "name" ? s.name : field === "phone" ? s.phone : field === "address" ? s.address : s.website) ?? null;
    return { field, from: v(from), to: v(to) };
  });
}

/** What the tab reads from PostScore's own tables (lib/googleProfileTab.server.ts). */
export interface GoogleTabSaved {
  couponsRunning: number;
  /** "2026-10" */
  lastMonth: string;
  recap: MonthRecap;
  made: MadeChange[];
  /** null: fewer than two scans with listing snapshots. `at`: the later scan. */
  others: { fields: WatchedField[]; since: string; at?: string; changes?: WatchedChange[] } | null;
  businessStatus: string | null;
  /** Google's own edits (getGoogleUpdated); null when not connected. */
  googleEdits?: { available: boolean; open: GoogleEditRow[]; recent?: GoogleEditRow[]; checkedAt: string | null } | null;
}


// ---------------------------------------------------------------------------
// Section 2 "Devices and platforms": the split and "What this means for you"
// ---------------------------------------------------------------------------

export interface DeviceSplit {
  phone: number;
  computer: number;
  search: number;
  maps: number;
}

/** Phone vs computer and Search vs Maps (whole %, each pair adding to 100) from the 4 parts. */
export function deviceSplit(rows: Array<{ id: string; count: number }>): DeviceSplit {
  const c = (id: string) => rows.find((r) => r.id === id)?.count ?? 0;
  const total = rows.reduce((a, r) => a + r.count, 0);
  if (total <= 0) return { phone: 0, computer: 0, search: 0, maps: 0 };
  const phone = Math.round(((c("searchPhone") + c("mapsPhone")) / total) * 100);
  const search = Math.round(((c("searchPhone") + c("searchComputer")) / total) * 100);
  return { phone, computer: 100 - phone, search, maps: 100 - search };
}

export interface DeviceFacts {
  businessId: string;
  /** The website has a tap-to-call (tel:) link; null: no website read. */
  tapToCall: boolean | null;
  /** "Loads in a reasonable time" on phones isn't at full points; null: not checked. */
  mobileSlow: boolean | null;
  /** A Book online button on the listing. */
  bookingLink: boolean;
  /** null: the listing wasn't read. */
  descriptionLength: number | null;
  /** null: photos not read yet. */
  photosFresh: boolean | null;
  /** The next holiday (6 weeks) without special hours; null: all set (or not read). */
  holidayUnset: HolidayId | null;
  /** The listing was read (holiday hours known). */
  listingRead: boolean;
}

export interface AdviceItem {
  group: "phone" | "search" | "maps";
  status: "ok" | "warn";
  key: "tapToCall" | "speed" | "bookingWorks" | "tapToCallOk" | "description" | "descriptionOk" | "photos" | "holiday" | "mapsOk";
  href: string | null;
  holiday?: HolidayId;
}

export const MAX_ADVICE = 3;

/** "What this means for you": from the real split and the real checks;
 * ! items first, at most 3. */
export function deviceAdvice(split: DeviceSplit, f: DeviceFacts): AdviceItem[] {
  const site = (check: string) => `/business/${f.businessId}/website#check-${check}`;
  const items: AdviceItem[] = [];
  if (split.phone >= 60) {
    if (f.tapToCall === false) items.push({ group: "phone", status: "warn", key: "tapToCall", href: site("contact_conversion") });
    if (f.mobileSlow === true) items.push({ group: "phone", status: "warn", key: "speed", href: site("performance_mobile") });
    if (f.bookingLink) items.push({ group: "phone", status: "ok", key: "bookingWorks", href: null });
    else if (f.tapToCall === true && f.mobileSlow !== true) items.push({ group: "phone", status: "ok", key: "tapToCallOk", href: null });
  }
  if (split.search >= 50 && f.descriptionLength !== null) {
    items.push(f.descriptionLength < SHORT_DESCRIPTION ? { group: "search", status: "warn", key: "description", href: "#edit-description" } : { group: "search", status: "ok", key: "descriptionOk", href: null });
  }
  if (split.maps >= 25) {
    const before = items.length;
    if (f.photosFresh === false) items.push({ group: "maps", status: "warn", key: "photos", href: "#edit-photos" });
    if (f.holidayUnset) items.push({ group: "maps", status: "warn", key: "holiday", href: "#edit-holiday", holiday: f.holidayUnset });
    if (items.length === before && f.photosFresh === true && f.listingRead) items.push({ group: "maps", status: "ok", key: "mapsOk", href: null });
  }
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => Number(a.it.status === "ok") - Number(b.it.status === "ok") || a.i - b.i)
    .slice(0, MAX_ADVICE)
    .map((x) => x.it);
}
