// The Growth page's Google Profile tab (Day 22B, docs/mockups/
// google-profile-mockup.html): the conversion-rate math, the five levers
// that raise it, the listing rows, "Last month you: …" and the status of
// changes made from PostScore — all from data PostScore already stores.
// Monthly Google insights (views, calls, searches) arrive in step 2;
// until then their sections show an honest empty state, and sample
// numbers only in practice mode. Pure — safe on the server and the client.

import type { CheckResult } from "@/lib/scoring";
import { actions, addMonths, monthRange, totalViews, type InsightsMonth, type Keyword } from "@/lib/gbpInsights";
import type { BookingLink, BookingTracking } from "@/lib/bookingPartners";

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
    const href = `/business/${id}/website-reviews#google-reviews`;
    if (!input.replies) return { id: "reviews", status: "notChecked", pill: "reply", params: {}, tone: "neutral", href };
    if (input.replies.inWindow <= 0) return { id: "reviews", status: "noRecent", pill: "done", params: {}, tone: "ok", href };
    const percent = Math.round((input.replies.replied / input.replies.inWindow) * 100);
    return percent >= REPLIED_DONE_PERCENT
      ? { id: "reviews", status: "replied", pill: "done", params: { percent }, tone: "ok", href }
      : { id: "reviews", status: "replied", pill: "reply", params: { percent }, tone: "warn", href };
  })();
  // The newest photo's date comes in step 3; Google posts aren't stored yet.
  const photos: Lever = { id: "photos", status: "soon", pill: "soon", params: {}, tone: "neutral", href: "#listing" };
  const posts: Lever = { id: "posts", status: "soon", pill: "soon", params: {}, tone: "neutral", href: `/business/${id}/growth#ways-to-grow` };
  const deals: Lever =
    input.couponsRunning > 0
      ? { id: "deals", status: "running", pill: "running", params: { count: input.couponsRunning }, tone: "ok", href: `/business/${id}/campaigns` }
      : { id: "deals", status: "none", pill: "start", params: {}, tone: "bad", href: `/business/${id}/campaigns?tab=coupons` };
  const website: Lever = ((): Lever => {
    const href = `/business/${id}/website`;
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

export type ListingChangeKind = "hours" | "phone" | "description" | "website_link" | "customer_details" | "booking_link";

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
  return null;
}

export const PRACTICE_KIND = /_practice$/;

export interface ChangeRow {
  batch_id: string;
  kind: string;
  field: string;
  status: string;
  approved_at: string;
  undone_at?: string | null;
  undo_closed_at?: string | null;
  undo_of?: string | null;
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

/** Listing changes that went through last month (real ones, or practice
 * ones in practice mode), each kind once. Undos and failures don't count. */
export function monthListingChanges(rows: ChangeRow[], month: string, timeZone: string, practice: boolean): ListingChangeKind[] {
  const out: ListingChangeKind[] = [];
  for (const r of [...rows].sort((a, b) => a.approved_at.localeCompare(b.approved_at))) {
    if (PRACTICE_KIND.test(r.kind) !== practice || r.undo_of || r.undone_at) continue;
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
  /** live · undo (with daysLeft) · reviewing · undone · failed */
  status: "live" | "undo" | "reviewing" | "undone" | "failed";
  daysLeft: number;
  at: string;
}

/** The latest changes made from PostScore, newest first, one per batch. */
export function madeFromPostScore(rows: ChangeRow[], now: number, practice: boolean, max = 5): MadeChange[] {
  const seen = new Set<string>();
  const out: MadeChange[] = [];
  for (const r of [...rows].sort((a, b) => b.approved_at.localeCompare(a.approved_at))) {
    if (PRACTICE_KIND.test(r.kind) !== practice || r.undo_of || r.status === "sending" || seen.has(r.batch_id)) continue;
    const kind = listingChangeKind(r.kind, r.field);
    if (!kind) continue;
    seen.add(r.batch_id);
    const left = Math.ceil((Date.parse(r.approved_at) + UNDO_DAYS * DAY_MS - now) / DAY_MS);
    const status: MadeChange["status"] =
      r.status === "failed" ? "failed" : r.undone_at ? "undone" : r.status === "pending_review" ? "reviewing" : left > 0 && !r.undo_closed_at ? "undo" : "live";
    out.push({ kind, status, daysLeft: Math.max(0, left), at: r.approved_at });
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Your listing
// ---------------------------------------------------------------------------

export type RowStatus = "ok" | "warn" | "bad" | "neutral" | "soon";
export type Editor = "hours" | "phone" | "description" | "website" | "customer_details" | "booking" | "booking_steps" | "booking_partner" | "messaging";

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
  /** The real Book online button and whether Google counts its bookings (lib/bookingPartners.ts). */
  booking?: BookingState | null;
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
      rows: [row("hours", "completeness.hours", compactHours(input.openingHours), editor("hours")), row("holiday", null, null, null, "soon")],
    },
    {
      id: "who",
      rows: [
        row("category", "completeness.categories", input.category, { kind: "link", href: GOOGLE_BUSINESS_URL, external: true }),
        // The description is read live from Google when opened.
        row("description", null, null, editor("description")),
        row("customerDetails", "completeness.customer_details", null, editor("customer_details")),
      ],
    },
    {
      id: "fresh",
      rows: [
        row("photos", "completeness.photos", input.photoCount !== null ? String(input.photoCount) : null, { kind: "link", href: GOOGLE_BUSINESS_URL, external: true }),
        row("posts", null, null, null, "soon"),
        {
          ...row("reviews", "visibility.review_replies", input.rating !== null ? `${input.rating.toFixed(1)} ★ · ${input.reviewCount ?? 0}` : null, { kind: "link", href: `/business/${input.businessId}/website-reviews#google-reviews`, external: false }),
          note: repliesText,
        },
      ],
    },
  ];
}

/** The header strip's counts: OK / to fix / to improve. */
export function listingCounts(groups: ListingGroup[]): { ok: number; fix: number; improve: number } {
  const rows = groups.flatMap((g) => g.rows);
  return { ok: rows.filter((r) => r.status === "ok").length, fix: rows.filter((r) => r.status === "bad").length, improve: rows.filter((r) => r.status === "warn").length };
}

/** The editor a ?tab=google#edit-… link opens. */
export function editorFromHash(hash: string): Editor | null {
  const h = hash.replace(/^#/, "");
  if (h === "edit-hours") return "hours";
  if (h === "edit-booking-steps") return "booking_steps";
  if (h === "edit-booking") return "booking";
  if (h === "edit-phone") return "phone";
  if (h === "edit-description") return "description";
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

export type WatchedField = "phone" | "hours" | "website";
const FIELD_KIND: Record<WatchedField, ListingChangeKind> = { phone: "phone", hours: "hours", website: "website_link" };

/** Phone, hours and website changes between the last two scans that
 * weren't made from PostScore in that time — someone else's edit, or a
 * suggested edit Google accepted. */
export function changedByOthers(changed: WatchedField[], rows: ChangeRow[], fromAt: string, toAt: string): WatchedField[] {
  const ours = new Set(
    rows
      .filter((r) => !PRACTICE_KIND.test(r.kind) && !r.undo_of && r.status !== "failed" && r.approved_at > fromAt && r.approved_at <= toAt)
      .map((r) => listingChangeKind(r.kind, r.field))
      .filter((k): k is ListingChangeKind => k !== null)
  );
  return changed.filter((f) => !ours.has(FIELD_KIND[f]));
}

/** What the tab reads from PostScore's own tables (lib/googleProfileTab.server.ts). */
export interface GoogleTabSaved {
  couponsRunning: number;
  /** "2026-10" */
  lastMonth: string;
  recap: MonthRecap;
  made: MadeChange[];
  /** null: fewer than two scans with listing snapshots. */
  others: { fields: WatchedField[]; since: string } | null;
  businessStatus: string | null;
}

