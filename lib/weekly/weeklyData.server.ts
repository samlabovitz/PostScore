// Assembles the weekly recap (Reports page), its PDF data, past reports
// and the "Since your last visit" pop-up from saved data only. Callers
// pass their own RLS-scoped Supabase client (a business the user doesn't
// own reads as not found).

import type { SupabaseClient } from "@supabase/supabase-js";
import { businessTimeZone } from "@/lib/businessTimeZone";
import { normalizeLocale, type Locale } from "@/lib/i18n";
import { SCORING_VERSION } from "@/lib/scoring";
import { resolveBizProfile } from "@/config/bizProfiles";
import { rescanAvailability } from "@/lib/rescanPolicy";
import { snapshotDelta, type WeeklySnapshotRow } from "./snapshots";
import { buildWeekSummary, pickerWeeks, type WeeklyScan } from "./weeklyReport";
import { weeklyViewFromSnapshot, weeklyViewFromSummary, type WeeklyView } from "./weeklyView";
import { shouldShowSinceLastVisit, sinceLastVisit } from "./sinceLastVisit";
import { weekBounds, weekEndDay, weekOf } from "./weeks";
import { selectionChangedBetween } from "@/lib/competitorQuality";
import { ensureWeeklySnapshots, fixesConfirmedBetween, isMissingTable, loadPastReports, loadSnapshot, loadWeeklyScans, rankAt, routineFor } from "./weekly.server";
import type { ChartCategoryId } from "@/lib/scoreHistory";
import type { ScoreBreakdown } from "@/lib/scoring";
import type { ReportData, WeeklyMeta } from "@/lib/reports/reportPdf";
import { reportCategories } from "@/lib/reports/reportCategories";

export const PAST_REPORTS_FIRST = 8;
export const PAST_REPORTS_PAGE = 12;

interface BusinessBasics {
  name: string | null;
  address: string | null;
  language: string | null;
  lat: number | null;
  lng: number | null;
  category: string | null;
  primary_type: string | null;
  business_type_override: string | null;
  categories: string[] | null;
}

async function loadBusiness(supabase: SupabaseClient, businessId: string): Promise<BusinessBasics | null> {
  const { data } = await supabase
    .from("businesses")
    .select("name, address, language, lat, lng, category, primary_type, business_type_override, categories")
    .eq("id", businessId)
    .maybeSingle();
  return (data as BusinessBasics | null) ?? null;
}

/** A compact past-report row (dates · score · change). */
export interface PastReport {
  weekStart: string;
  weekEnd: string;
  score: number;
  delta: number | null;
  olderScoringVersion: string | null;
}

function toPastReport(row: WeeklySnapshotRow): PastReport {
  return {
    weekStart: row.week_start,
    weekEnd: weekEndDay(row.week_start),
    score: row.score,
    delta: snapshotDelta(row),
    olderScoringVersion: row.scoring_version && row.scoring_version !== SCORING_VERSION ? row.scoring_version : null,
  };
}

/** One week's view: live for the week in progress (or when no snapshot
 * exists), frozen from its snapshot otherwise. */
async function weekView(supabase: SupabaseClient, businessId: string, weekStart: string, scans: WeeklyScan[], timeZone: string, locale: Locale, now: Date): Promise<WeeklyView> {
  const summary = buildWeekSummary(weekStart, scans, timeZone, locale);
  const isCurrentWeek = weekStart === weekOf(now.toISOString(), timeZone);
  if (!isCurrentWeek) {
    const row = await loadSnapshot(supabase, businessId, weekStart);
    if (row) return weeklyViewFromSnapshot(row, summary, SCORING_VERSION);
  }
  const { start, end } = weekBounds(weekStart, timeZone);
  const until = isCurrentWeek ? now : end;
  const [rank, fixes] = await Promise.all([
    rankAt(supabase, businessId, until.toISOString()),
    fixesConfirmedBetween(supabase, businessId, start.toISOString(), until.toISOString()),
  ]);
  return weeklyViewFromSummary(summary, { rank, fixesConfirmed: fixes, isCurrentWeek });
}

export interface WeeklyRecapData {
  timeZone: string;
  locale: Locale;
  weeks: string[];
  view: WeeklyView;
  past: { rows: PastReport[]; total: number; years: number[] };
  /** false until supabase/weekly-snapshots.sql has been run. */
  snapshotsEnabled: boolean;
}

export async function getWeeklyRecapWithClient(supabase: SupabaseClient, businessId: string, requestedWeek: string | null, now: Date = new Date()): Promise<WeeklyRecapData | null> {
  const business = await loadBusiness(supabase, businessId);
  if (!business) return null;
  const timeZone = businessTimeZone(business.lat, business.lng);
  const locale = normalizeLocale(business.language);
  const scans = await loadWeeklyScans(supabase, businessId);
  // Lazily freeze finished weeks (no cron, no Google/PageSpeed calls).
  const snapshots = await ensureWeeklySnapshots(supabase, businessId, scans, timeZone, locale, now);
  const weeks = pickerWeeks(scans, now, timeZone);
  const selected = requestedWeek && weeks.includes(requestedWeek) ? requestedWeek : weeks[0];
  const [view, past] = await Promise.all([
    weekView(supabase, businessId, selected, scans, timeZone, locale, now),
    snapshots.enabled ? loadPastReports(supabase, businessId, { offset: 0, limit: PAST_REPORTS_FIRST }) : Promise.resolve({ rows: [], total: 0, years: [] }),
  ]);
  return { timeZone, locale, weeks, view, past: { rows: past.rows.map(toPastReport), total: past.total, years: past.years }, snapshotsEnabled: snapshots.enabled };
}

export async function getPastReportsWithClient(supabase: SupabaseClient, businessId: string, offset: number, year: number | null): Promise<{ rows: PastReport[]; total: number }> {
  const page = await loadPastReports(supabase, businessId, { offset: Math.max(0, offset), limit: PAST_REPORTS_PAGE, year });
  return { rows: page.rows.map(toPastReport), total: page.total };
}

// ---- The weekly PDF's data (the one-page report layout) ---------------------

/** The weekly report as the one-page report's data (lib/reports/reportPdf.ts):
 * - the week in progress starts from `current()` — the live report data,
 *   the same numbers as the Overview — with the week's comparison in the
 *   change box;
 * - a finished week reads its frozen snapshot and that week's saved scan
 *   (the real categories as scored then); its next steps aren't shown.
 * The change always compares with the last scan before the week (on the
 * same scoring version) — never a "(0 days)" period. */
export async function weeklyReportDataWithClient(
  supabase: SupabaseClient,
  businessId: string,
  weekStart: string | null,
  deps: { current: () => Promise<ReportData | null> },
  now: Date = new Date()
): Promise<ReportData | null> {
  const business = await loadBusiness(supabase, businessId);
  if (!business) return null;
  const timeZone = businessTimeZone(business.lat, business.lng);
  const locale = normalizeLocale(business.language);
  const scans = await loadWeeklyScans(supabase, businessId);
  const weeks = pickerWeeks(scans, now, timeZone);
  const selected = weekStart && weeks.includes(weekStart) ? weekStart : weeks[0];
  const summary = buildWeekSummary(selected, scans, timeZone, locale);
  const isCurrentWeek = selected === weekOf(now.toISOString(), timeZone);
  const { start, end } = weekBounds(selected, timeZone);
  const routine = await routineFor(supabase, businessId, selected);
  const c = summary.comparison;
  const weekly: WeeklyMeta = {
    weekStart: selected,
    weekEnd: weekEndDay(selected),
    noNewScanSince: summary.current ? null : summary.lastKnown?.createdAt ?? null,
    comparedWith: c ? c.from.createdAt : null,
    comparedInWeek: summary.comparedInWeek,
    routine,
    pastWeek: !isCurrentWeek,
  };
  const period = (from: number, to: number, comparable: boolean, fromAt: string, toAt: string) => ({ from: fromAt, to: toAt, days: 0, fromScore: from, toScore: to, comparable });

  if (isCurrentWeek) {
    const base = await deps.current();
    if (!base) return null;
    const fixes = await fixesConfirmedBetween(supabase, businessId, start.toISOString(), now.toISOString());
    return {
      ...base,
      period: c ? period(c.from.total, c.to.total, c.comparable, c.from.createdAt, c.to.createdAt) : null,
      changes: { listing: c ? c.listingChanges.map((x) => x.description) : [], listingUnavailable: c ? c.changesUnavailable : false, fixesConfirmed: fixes },
      reviews: { ...base.reviews, countChange: c ? c.reviews.countChange : null },
      weekly,
    };
  }

  // A finished week: frozen numbers, the week's own saved scan for categories.
  const snapshot = await loadSnapshot(supabase, businessId, selected);
  const scanId = snapshot?.scan_id ?? summary.current?.id ?? summary.lastKnown?.id ?? null;
  if (!scanId) return null;
  const { data: scanRow } = await supabase.from("scores").select("total, grade, breakdown_json").eq("id", scanId).maybeSingle();
  const saved = scanRow as { total: number; grade: string; breakdown_json: ScoreBreakdown } | null;
  if (!saved) return null;
  const [rank, fixes] = snapshot
    ? [snapshot.rank !== null && snapshot.rank_of !== null ? { rank: snapshot.rank, of: snapshot.rank_of, previous: snapshot.prev_rank } : null, snapshot.fixes_confirmed]
    : await Promise.all([rankAt(supabase, businessId, end.toISOString()), fixesConfirmedBetween(supabase, businessId, start.toISOString(), end.toISOString())]);
  const sameCompared = !snapshot || !c || snapshot.compared_scan_id === c.from.id;
  const profile = resolveBizProfile(business.category, business.primary_type, business.business_type_override, locale, business.categories, business.name);
  const score = snapshot?.score ?? saved.total;
  const prevScore = snapshot ? snapshot.prev_score : c?.from.total ?? null;
  const comparable = snapshot ? snapshot.prev_score !== null && snapshot.scoring_version === snapshot.prev_scoring_version : c?.comparable ?? false;
  return {
    locale,
    timeZone,
    generatedAt: now.toISOString(),
    business: { name: business.name ?? "", address: business.address },
    score: { total: score, grade: snapshot?.grade ?? saved.grade },
    period: c && prevScore !== null && sameCompared ? period(prevScore, score, comparable, c.from.createdAt, c.to.createdAt) : null,
    categories: reportCategories(saved.breakdown_json.categories ?? []),
    rank: rank ? { rank: rank.rank, of: rank.of, noun: profile.competitorNoun, previousRank: rank.previous } : null,
    changes: { listing: c && sameCompared ? c.listingChanges.map((x) => x.description) : [], listingUnavailable: c ? c.changesUnavailable : false, fixesConfirmed: fixes },
    nextSteps: [],
    reviews: {
      rating: snapshot ? (snapshot.rating === null ? null : Number(snapshot.rating)) : c?.reviews.rating ?? null,
      count: snapshot ? snapshot.review_count : c?.reviews.count ?? null,
      countChange: snapshot ? snapshot.review_count_change : c?.reviews.countChange ?? null,
      nearbyAverage: null,
    },
    weekly: { ...weekly, comparedWith: sameCompared ? weekly.comparedWith : null },
  };
}

// ---- Since your last visit ---------------------------------------------------

export interface SinceLastVisitData {
  since: string;
  timeZone: string;
  noNewScan: boolean;
  /** The current week (for "Download weekly report (PDF)"). */
  weekStart: string;
  baselineScore: number | null;
  latestScore: number | null;
  delta: number | null;
  comparable: boolean;
  categories: Array<{ id: ChartCategoryId; before: number | null; after: number | null }>;
  rank: { now: number; then: number | null; of: number } | null;
  fixesConfirmed: number;
  reviews: { count: number | null; countChange: number | null; rating: number | null; ratingChange: number | null };
  /** The shared review goal in words (average, goal, next up) — empty when
   * there's no goal (fewer than 3 competitors). */
  reviewGoalLines?: string[];
  nextSteps: Array<{ title: string; detail: string; points: string }>;
  /** The 1-a-day full re-scan (website re-checks don't count). */
  rescan: { allowed: boolean; nextAvailableAt: string | null };
}

export type VisitResult = { status: "ok"; show: false } | { status: "ok"; show: true; data: SinceLastVisitData } | { status: "not_enabled" } | { status: "not_found" };

/** Records this visit (the first page of a browser session) and returns
 * the pop-up's data when the previous visit was 7+ days ago. */
export async function openBusinessVisitWithClient(
  supabase: SupabaseClient,
  userId: string,
  businessId: string,
  deps: { nextSteps: () => Promise<SinceLastVisitData["nextSteps"]>; reviewGoalLines?: () => Promise<string[]> },
  now: Date = new Date()
): Promise<VisitResult> {
  const business = await loadBusiness(supabase, businessId);
  if (!business) return { status: "not_found" };
  const { data: seen, error } = await supabase.from("business_last_seen").select("last_seen_at").eq("user_id", userId).eq("business_id", businessId).maybeSingle();
  if (error) return isMissingTable(error) ? { status: "not_enabled" } : { status: "ok", show: false };
  const lastSeenAt = (seen as { last_seen_at: string } | null)?.last_seen_at ?? null;
  await supabase.from("business_last_seen").upsert({ user_id: userId, business_id: businessId, last_seen_at: now.toISOString() }, { onConflict: "user_id,business_id" });

  const timeZone = businessTimeZone(business.lat, business.lng);
  const locale = normalizeLocale(business.language);
  const scans = await loadWeeklyScans(supabase, businessId);
  // A week ended since the last visit: freeze it now.
  await ensureWeeklySnapshots(supabase, businessId, scans, timeZone, locale, now);
  if (!lastSeenAt || !shouldShowSinceLastVisit(lastSeenAt, now)) return { status: "ok", show: false };

  const s = sinceLastVisit(lastSeenAt, scans, locale);
  const c = s.comparison;
  const { data: recent } = await supabase.from("scores").select("created_at, scan_kind:breakdown_json->>scanKind").eq("business_id", businessId).order("created_at", { ascending: false }).limit(10);
  const lastFull = ((recent ?? []) as Array<{ created_at: string; scan_kind: string | null }>).find((r) => r.scan_kind !== "website_recheck")?.created_at ?? null;
  const [rankNow, rankThen, fixes, nextSteps, reviewGoalLines] = await Promise.all([
    rankAt(supabase, businessId, now.toISOString()),
    rankAt(supabase, businessId, lastSeenAt),
    fixesConfirmedBetween(supabase, businessId, lastSeenAt, now.toISOString()),
    s.noNewScan ? Promise.resolve([]) : deps.nextSteps(),
    deps.reviewGoalLines ? deps.reviewGoalLines().catch(() => []) : Promise.resolve([] as string[]),
  ]);
  return {
    status: "ok",
    show: true,
    data: {
      since: lastSeenAt,
      timeZone,
      noNewScan: s.noNewScan,
      weekStart: weekOf(now.toISOString(), timeZone),
      baselineScore: s.baseline?.total ?? null,
      latestScore: s.latest?.total ?? null,
      delta: c ? c.delta : null,
      comparable: c ? c.comparable : false,
      categories: c ? c.categories : [],
      // Across the competitor-picking update the old rank isn't comparable.
      rank: rankNow ? { now: rankNow.rank, then: rankThen && !selectionChangedBetween(rankThen.scanAt, rankNow.scanAt) ? rankThen.rank : null, of: rankNow.of } : null,
      fixesConfirmed: fixes,
      reviews: c ? c.reviews : { count: null, countChange: null, rating: null, ratingChange: null },
      reviewGoalLines,
      nextSteps: nextSteps.slice(0, 2),
      rescan: rescanAvailability(lastFull, now),
    },
  };
}
