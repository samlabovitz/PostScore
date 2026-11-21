// Day 23C: the Google Profile tab's recommendations say HOW MANY, WHAT TYPE
// and WHEN, from real data and fixed rules (no AI): photos by the media
// types the listing is missing, review replies by the unanswered count,
// a post on the day before the busiest call day, holiday hours two days
// ahead, and exact targets for the description, customer details and
// services. Plus "Since you did this" (30 days after vs 30 days before an
// action, read live, nothing stored) and the revenue estimate's math with
// the owner's own assumptions. Pure — safe on the server and the client.

import { addMonths, callsByDays, type CallDays, type InsightsMonth } from "@/lib/gbpInsights";
import { isFresh } from "@/lib/gbpMediaPosts";
import { specialFor, upcomingHolidays, type HolidayId, type SpecialHourPeriod } from "@/lib/gbpListingFields";
import type { IdeaType } from "@/lib/listingIdeas";
import type { AnswersPlan } from "@/lib/googleAnswers";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Photos: count + types
// ---------------------------------------------------------------------------

/** Google's photo categories (v4 media locationAssociation.category) PostScore suggests. */
export type PhotoCategory = "INTERIOR" | "EXTERIOR" | "AT_WORK" | "TEAMS" | "PRODUCT" | "FOOD_AND_DRINK" | "MENU";
export const PHOTO_CATEGORIES: readonly PhotoCategory[] = ["INTERIOR", "EXTERIOR", "AT_WORK", "TEAMS", "PRODUCT", "FOOD_AND_DRINK", "MENU"];

/** The photo types each business type needs, most useful first. */
export const PHOTO_TYPES: Record<IdeaType | "default", PhotoCategory[]> = {
  hair: ["INTERIOR", "AT_WORK", "TEAMS", "EXTERIOR", "PRODUCT"],
  barber: ["INTERIOR", "AT_WORK", "TEAMS", "EXTERIOR", "PRODUCT"],
  nails: ["INTERIOR", "AT_WORK", "TEAMS", "EXTERIOR", "PRODUCT"],
  restaurant: ["FOOD_AND_DRINK", "INTERIOR", "MENU", "EXTERIOR", "TEAMS"],
  art: ["AT_WORK", "INTERIOR", "PRODUCT", "TEAMS", "EXTERIOR"],
  home: ["AT_WORK", "TEAMS", "PRODUCT", "EXTERIOR"],
  default: ["INTERIOR", "EXTERIOR", "AT_WORK", "TEAMS", "PRODUCT"],
};

/** Photos per suggestion ("Add 3 photos this week"). */
export const PHOTOS_TO_ADD = 3;

export interface PhotoPlan {
  count: number;
  /** One photo of each, in order. */
  types: PhotoCategory[];
  /** true: picked from the types the listing is missing (Google's categories were read). */
  fromMissing: boolean;
}

/** "Add 3 photos this week: 1 inside your salon, 1 of finished work, 1 of
 * your team" — the business type's photo types the listing doesn't have
 * yet first, then the most useful ones. null when the newest photo is under
 * 30 days old (nothing to do) or photos weren't read. */
export function photoPlan(type: IdeaType | null, photos: { count: number; newestAt: string | null; categories?: string[] | null } | null, now: number): PhotoPlan | null {
  if (!photos) return null;
  if (photos.count > 0 && photos.newestAt && isFresh(photos.newestAt, now)) return null;
  const wanted = PHOTO_TYPES[type ?? "default"];
  const have = photos.categories ? new Set(photos.categories) : null;
  const missing = have ? wanted.filter((c) => !have.has(c)) : [];
  const types = [...missing, ...wanted.filter((c) => !missing.includes(c))].slice(0, PHOTOS_TO_ADD);
  return { count: types.length, types, fromMissing: missing.length > 0 };
}

/** The photo-type phrase key: a type's own words where they differ ("inside your salon"). */
const PHOTO_WORDS_BY_TYPE: Partial<Record<PhotoCategory, Array<IdeaType>>> = {
  INTERIOR: ["hair", "barber", "nails", "restaurant", "art"],
  AT_WORK: ["hair", "barber", "nails", "restaurant", "art", "home"],
};
export function photoTypeKey(category: PhotoCategory, type: IdeaType | null): string {
  return type && PHOTO_WORDS_BY_TYPE[category]?.includes(type) ? `${category}.${type}` : category;
}

// ---------------------------------------------------------------------------
// Review replies
// ---------------------------------------------------------------------------

/** At most this many replies per suggestion. */
export const MAX_REPLIES = 10;
/** About 2 minutes a reply. */
export const MINUTES_PER_REPLY = 2;

/** "Reply to your {N} newest unanswered reviews, oldest first (about {N×2} min)". null: all replied / not checked. */
export function replyPlan(replies: { replied: number; inWindow: number } | null): { count: number; minutes: number; left: number; replied: number; total: number } | null {
  if (!replies) return null;
  const unanswered = Math.max(0, replies.inWindow - replies.replied);
  if (unanswered === 0) return null;
  const count = Math.min(MAX_REPLIES, unanswered);
  return { count, minutes: count * MINUTES_PER_REPLY, left: unanswered - count, replied: replies.replied, total: replies.inWindow };
}

// ---------------------------------------------------------------------------
// Google posts: the day before the busiest call day
// ---------------------------------------------------------------------------

/** The busiest call days — the same three groups as "Which days they call"
 * (Tue–Thu, Fri–Sat, Sun–Mon) — and the day before each group starts
 * (0 = Sunday): Monday, Thursday, Saturday. */
export const POST_DAY: Record<CallDays, number> = { midweek: 1, weekend: 4, sunMon: 6 };
export function busiestCallDays(months: InsightsMonth[]): CallDays | null {
  return callsByDays(months)?.top ?? null;
}

/** Today's date (YYYY-MM-DD) and weekday in the business's time zone. */
export function localToday(now: number, timeZone: string): { date: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return { date, weekday: new Date(`${date}T12:00:00Z`).getUTCDay() };
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);
}

export interface PostPlan {
  /** The day to post (0 = Sunday) and its next date; null: no call data → "this week". */
  weekday: number | null;
  date: string | null;
  /** The busiest call days it leads into (section 2's groups). */
  busiest: CallDays | null;
  topic: IdeaType | "default";
}

/** "Post 1 update on {day}": the day before the busiest call days (the
 * last 6 months' calls by weekday, in section 2's groups), its next date
 * (today counts). null:
 * 2+ posts in the last 30 days, or posts weren't read. */
export function postPlan(posts: { last30: number } | null, months: InsightsMonth[], type: IdeaType | null, now: number, timeZone: string): PostPlan | null {
  if (!posts || posts.last30 >= 2) return null;
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const last = sorted[sorted.length - 1]?.month;
  const recent = last ? sorted.filter((m) => m.month > addMonths(last, -6)) : [];
  const busiest = busiestCallDays(recent);
  const topic = type ?? "default";
  if (busiest === null) return { weekday: null, date: null, busiest: null, topic };
  const weekday = POST_DAY[busiest];
  const today = localToday(now, timeZone);
  return { weekday, date: addDays(today.date, (weekday - today.weekday + 7) % 7), busiest, topic };
}

// ---------------------------------------------------------------------------
// Holiday hours: two days ahead
// ---------------------------------------------------------------------------

export const HOLIDAY_LEAD_DAYS = 2;

/** "Set {holiday} hours by {date}" — the next holiday without special hours,
 * due 2 days before it (today when that's already passed). */
export function holidayPlan(periods: SpecialHourPeriod[] | null, now: number, timeZone: string): { holiday: HolidayId; date: string; by: string; today: boolean } | null {
  if (!periods) return null;
  const today = localToday(now, timeZone).date;
  const h = upcomingHolidays(new Date(`${today}T12:00:00Z`)).find((x) => !specialFor(periods, x.date));
  if (!h) return null;
  const date = `${h.date.year}-${String(h.date.month).padStart(2, "0")}-${String(h.date.day).padStart(2, "0")}`;
  const due = addDays(date, -HOLIDAY_LEAD_DAYS);
  const by = due < today ? today : due;
  return { holiday: h.id, date, by, today: by === today };
}

// ---------------------------------------------------------------------------
// Exact targets: description, customer details, services
// ---------------------------------------------------------------------------

export const DESCRIPTION_TARGET = 250;
/** "aim for 250+ characters, you have 10" — null at 250+. */
export function descriptionPlan(description: string | null | undefined): { target: number; have: number; minutes: number } | null {
  if (description === undefined) return null;
  const have = (description ?? "").trim().length;
  if (have >= DESCRIPTION_TARGET) return null;
  return { target: DESCRIPTION_TARGET, have, minutes: 5 };
}

/** About 1 minute a detail or a service. */
export const MINUTES_PER_ITEM = 1;
export function detailsPlan(missing: Array<"parking" | "accessibility">): { missing: Array<"parking" | "accessibility">; minutes: number } | null {
  return missing.length === 0 ? null : { missing, minutes: missing.length * MINUTES_PER_ITEM };
}
export function servicesPlan(names: string[]): { names: string[]; count: number; minutes: number } | null {
  return names.length === 0 ? null : { names, count: names.length, minutes: names.length * MINUTES_PER_ITEM };
}

// ---------------------------------------------------------------------------
// The one button: Premium does it, Grow gets the steps
// ---------------------------------------------------------------------------

export type RecKind = "photos" | "replies" | "posts" | "holiday" | "description" | "details" | "services" | "answers";

/** What PostScore can change on Google for you (an editor, the reply inbox,
 * Day 23E's post preview and answers preview) — everything. */
export const DOES_FOR_YOU: readonly RecKind[] = ["photos", "replies", "posts", "holiday", "description", "details", "services", "answers"];

export type RecButton = { kind: "do_it" } | { kind: "verb" } | { kind: "steps"; premiumLine: boolean };

/** Premium on the tab with Google writes allowed → "PostScore can do this
 * for you"; Premium without writes → the editor's own verb (it opens read
 * only and says so); Grow/Free → the steps, plus "Premium does this for you
 * in one click →" where Premium really does. */
export function recButton(kind: RecKind, ctx: { premium: boolean; canEdit: boolean }): RecButton {
  if (ctx.premium) return DOES_FOR_YOU.includes(kind) && ctx.canEdit ? { kind: "do_it" } : { kind: "verb" };
  return { kind: "steps", premiumLine: DOES_FOR_YOU.includes(kind) };
}

// ---------------------------------------------------------------------------
// Actions on the chart, and "Since you did this"
// ---------------------------------------------------------------------------

export type ActionKind = "replies" | "photos" | "listing" | "campaign" | "posts" | "answers";

/** One day's actions of one kind (lib/googleActions.server.ts). */
export interface ActionEvent {
  /** "2026-11-03", the business's time zone. */
  date: string;
  kind: ActionKind;
  count: number;
  /** listing: what changed ("hours", "description"…), each once. */
  what?: string[];
}

/** Where a date sits on the 6-month chart (x in 0–100, the months' points
 * at even steps): its month's point, moved by the day within the month.
 * null outside the chart's months. */
export function markerX(date: string, months: string[]): number | null {
  const i = months.indexOf(date.slice(0, 7));
  if (i < 0) return null;
  if (months.length === 1) return 50;
  const step = 100 / (months.length - 1);
  const [y, m, d] = date.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const x = i * step + ((d - 0.5) / days - 0.5) * step;
  return Math.max(0, Math.min(100, Math.round(x * 10) / 10));
}

/** The chart's markers: one per day (that day's actions together), oldest first. */
export function chartMarkers(events: ActionEvent[], months: string[]): Array<{ date: string; x: number; events: ActionEvent[] }> {
  const byDate = new Map<string, ActionEvent[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  return Array.from(byDate, ([date, list]) => ({ date, x: markerX(date, months), events: list }))
    .filter((m): m is { date: string; x: number; events: ActionEvent[] } => m.x !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** An action counts once 14 days have passed. */
export const SINCE_MIN_DAYS = 14;
/** The windows compared: up to 30 days after vs the same number before. */
export const SINCE_WINDOW_DAYS = 30;
export const MAX_SINCE = 3;

/** The newest actions for "Since you did this" (newest first, one per date + kind). */
export function sinceActions(events: ActionEvent[], max = MAX_SINCE): ActionEvent[] {
  return [...events].sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind)).slice(0, max);
}

/** Ready once 14 days have passed; otherwise "Check back on {date}". */
export function sinceStatus(actionDate: string, today: string): { ready: true; days: number } | { ready: false; checkBack: string } {
  const days = daysBetween(actionDate, today);
  return days >= SINCE_MIN_DAYS ? { ready: true, days } : { ready: false, checkBack: addDays(actionDate, SINCE_MIN_DAYS) };
}

/** One day's Google numbers (summed from the Performance API's daily series). */
export interface DayNumbers {
  date: string;
  views: number;
  calls: number;
  directions: number;
  websiteClicks: number;
  /** Every customer action (calls + directions + website clicks + bookings + messages + food orders). */
  actions: number;
}

export interface WindowTotals {
  views: number;
  calls: number;
  directions: number;
  websiteClicks: number;
  actions: number;
  /** Customer actions ÷ views, one decimal; null without views. */
  rate: number | null;
}

/** The days to read for an action: N days before it and N after it, N = 30. */
export function sinceRange(actionDate: string): { start: string; end: string } {
  return { start: addDays(actionDate, -SINCE_WINDOW_DAYS), end: addDays(actionDate, SINCE_WINDOW_DAYS) };
}

const totals = (days: DayNumbers[]): WindowTotals => {
  const t = days.reduce((a, d) => ({ views: a.views + d.views, calls: a.calls + d.calls, directions: a.directions + d.directions, websiteClicks: a.websiteClicks + d.websiteClicks, actions: a.actions + d.actions }), { views: 0, calls: 0, directions: 0, websiteClicks: 0, actions: 0 });
  return { ...t, rate: t.views > 0 ? Math.round((t.actions / t.views) * 1000) / 10 : null };
};

/** The N days after the action (not counting its own day) vs the N days
 * before it. N = 30, or fewer when Google's numbers stop sooner
 * (`dataThrough`, the last day Google has); null under 14 days. */
export function beforeAfter(days: DayNumbers[], actionDate: string, dataThrough: string): { days: number; before: WindowTotals; after: WindowTotals } | null {
  const n = Math.min(SINCE_WINDOW_DAYS, daysBetween(actionDate, dataThrough));
  if (n < SINCE_MIN_DAYS) return null;
  const afterEnd = addDays(actionDate, n);
  const beforeStart = addDays(actionDate, -n);
  const after = days.filter((d) => d.date > actionDate && d.date <= afterEnd);
  const before = days.filter((d) => d.date >= beforeStart && d.date < actionDate);
  return { days: n, before: totals(before), after: totals(after) };
}

/** ▲/▼ and how much: whole numbers for counts; customers per 100 for the rate (under 0.5 is "same"). */
export function change(before: number | null, after: number | null, kind: "count" | "rate"): { dir: "up" | "down" | "same"; value: number } | null {
  if (before === null || after === null) return null;
  if (kind === "rate") {
    const diff = Math.round((after - before) * 10) / 10;
    if (Math.abs(diff) < 0.5) return { dir: "same", value: 0 };
    return { dir: diff > 0 ? "up" : "down", value: Math.max(1, Math.round(Math.abs(diff))) };
  }
  const diff = after - before;
  return { dir: diff > 0 ? "up" : diff < 0 ? "down" : "same", value: Math.abs(diff) };
}

/** The practice-mode sample (labelled "Sample"). */
export const SAMPLE_SINCE: { event: ActionEvent; result: { days: number; before: WindowTotals; after: WindowTotals } } = {
  event: { date: "2026-10-03", kind: "replies", count: 10 },
  result: {
    days: 30,
    before: { views: 640, calls: 24, directions: 20, websiteClicks: 9, actions: 59, rate: 9.2 },
    after: { views: 655, calls: 29, directions: 22, websiteClicks: 12, actions: 70, rate: 10.7 },
  },
};

// ---------------------------------------------------------------------------
// The revenue estimate, with the owner's own assumptions
// ---------------------------------------------------------------------------

/** "How many of these become paying visits". null: PostScore's default range (a third to all). */
export type VisitShare = number | null;
export const SHARE_PRESETS = { third: 1 / 3, half: 0.5, most: 0.75 } as const;
export type SharePreset = keyof typeof SHARE_PRESETS;

/** The preset a saved share is (within rounding), or "own" for the owner's own %. */
export function shareChoice(share: VisitShare): SharePreset | "own" | "default" {
  if (share === null) return "default";
  for (const [k, v] of Object.entries(SHARE_PRESETS)) if (Math.abs(v - share) < 0.005) return k as SharePreset;
  return "own";
}

/** The owner's own %, typed: 1–100 whole or one decimal → a share; "invalid" otherwise. */
export function parseSharePercent(raw: string): number | "invalid" {
  const s = raw.replace(/[%\s]/g, "").replace(",", ".");
  if (!/^\d+(\.\d)?$/.test(s)) return "invalid";
  const v = Number(s);
  return v > 0 && v <= 100 ? Math.round(v * 10) / 1000 : "invalid";
}

/** A saved share from the database: (0, 1], else the default. */
export function cleanShare(v: unknown): VisitShare {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : null;
}

/** Money shown as an estimate: to the nearest $50, or $100 above $5,000. */
export function roundEstimate(v: number): number {
  return v > 5000 ? Math.round(v / 100) * 100 : Math.round(v / 50) * 50;
}

export interface RevenueMath {
  actions: number;
  averageVisit: number;
  /** The shares used: [low, high] (the same twice for the owner's own choice). */
  shares: [number, number];
  /** Exact, before rounding. */
  exact: [number, number];
  /** Rounded for the headline (equal when one share). */
  low: number;
  high: number;
  source: "default" | "owner";
}

/** "{actions} customer actions × ${avg} average visit × {share} that become
 * visits = ${result}". The default: a third to all of them. */
export function revenueMath(actions: number, averageVisit: number | null, share: VisitShare): RevenueMath | null {
  if (averageVisit === null || !Number.isFinite(averageVisit) || averageVisit <= 0 || actions <= 0) return null;
  const shares: [number, number] = share === null ? [1 / 3, 1] : [share, share];
  const exact: [number, number] = [actions * averageVisit * shares[0], actions * averageVisit * shares[1]];
  return { actions, averageVisit, shares, exact, low: roundEstimate(exact[0]), high: roundEstimate(exact[1]), source: share === null ? "default" : "owner" };
}

/** "Left on the table" at the same share: the extra customers at the best
 * rate × average visit × share (a range with the default). */
export function leftMoney(extra: number, averageVisit: number | null, share: VisitShare): { low: number; high: number } | null {
  if (averageVisit === null || !Number.isFinite(averageVisit) || averageVisit <= 0 || extra <= 0) return null;
  const [a, b] = share === null ? [1 / 3, 1] : [share, share];
  return { low: roundEstimate(extra * averageVisit * a), high: roundEstimate(extra * averageVisit * b) };
}

/** A share in words-ready form: 33 (%), 50, 75, or the owner's %. */
export function sharePercent(share: number): number {
  return Math.round(share * 1000) / 10;
}

// ---------------------------------------------------------------------------
// The list: every recommendation the data supports, in order
// ---------------------------------------------------------------------------

export type Rec =
  | { kind: "holiday"; plan: NonNullable<ReturnType<typeof holidayPlan>> }
  | { kind: "replies"; plan: NonNullable<ReturnType<typeof replyPlan>> }
  | { kind: "photos"; plan: PhotoPlan }
  | { kind: "posts"; plan: PostPlan }
  | { kind: "description"; plan: NonNullable<ReturnType<typeof descriptionPlan>> }
  | { kind: "details"; plan: NonNullable<ReturnType<typeof detailsPlan>> }
  | { kind: "services"; plan: NonNullable<ReturnType<typeof servicesPlan>> }
  | { kind: "answers"; plan: AnswersPlan & { suggest: string[] } };

export interface RecInputs {
  type: IdeaType | null;
  now: number;
  timeZone: string;
  /** Unread data is null — that rule is skipped, never guessed. */
  replies: { replied: number; inWindow: number } | null;
  photos: { count: number; newestAt: string | null; categories?: string[] | null } | null;
  posts: { last30: number } | null;
  months: InsightsMonth[];
  specialPeriods: SpecialHourPeriod[] | null;
  /** undefined: not read. */
  description?: string | null;
  missingDetails?: Array<"parking" | "accessibility">;
  missingServices?: string[];
  /** Day 23E: what's missing for Google to answer customers' questions
   * (lib/googleAnswers.ts answersPlan). Given and not null: one "Answer your
   * customers' common questions" item takes the place of the description,
   * customer details and services items. */
  answers?: AnswersPlan | null;
}

/** A holiday within 14 days goes first; then replies, photos, posts, and the listing's targets. */
export function recommendations(i: RecInputs): Rec[] {
  const out: Rec[] = [];
  const holiday = holidayPlan(i.specialPeriods, i.now, i.timeZone);
  const soon = holiday && daysBetween(localToday(i.now, i.timeZone).date, holiday.date) <= 14;
  if (holiday && soon) out.push({ kind: "holiday", plan: holiday });
  const replies = replyPlan(i.replies);
  if (replies) out.push({ kind: "replies", plan: replies });
  const photos = photoPlan(i.type, i.photos, i.now);
  if (photos) out.push({ kind: "photos", plan: photos });
  const posts = postPlan(i.posts, i.months, i.type, i.now, i.timeZone);
  if (posts) out.push({ kind: "posts", plan: posts });
  if (i.answers) out.push({ kind: "answers", plan: { ...i.answers, suggest: i.missingServices ?? [] } });
  if (holiday && !soon) out.push({ kind: "holiday", plan: holiday });
  if (i.answers) return out;
  const description = descriptionPlan(i.description);
  if (description) out.push({ kind: "description", plan: description });
  const details = detailsPlan(i.missingDetails ?? []);
  if (details) out.push({ kind: "details", plan: details });
  const services = servicesPlan(i.missingServices ?? []);
  if (services) out.push({ kind: "services", plan: services });
  return out;
}

/** "November so far": the month's days up to the last one Google has; null
 * before Google has any day of it. */
export function monthSoFar(days: DayNumbers[], first: string, dataThrough: string | null): { through: string; calls: number; websiteClicks: number; directions: number } | null {
  if (!dataThrough || dataThrough < first) return null;
  const inMonth = days.filter((d) => d.date >= first && d.date <= dataThrough);
  return { through: dataThrough, calls: inMonth.reduce((a, d) => a + d.calls, 0), websiteClicks: inMonth.reduce((a, d) => a + d.websiteClicks, 0), directions: inMonth.reduce((a, d) => a + d.directions, 0) };
}

/** A read that takes longer than `ms` counts as failed ("Couldn't load from Google right now"), never an endless "Reading…". */
export function within<T>(p: Promise<T>, ms: number, failed: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(failed), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(failed);
      }
    );
  });
}
