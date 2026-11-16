"use server";

import { parseChartCategories, type ChartCategoryId, type ChartCategoryScore } from "@/lib/scoreHistory";
import { createClient } from "@/lib/supabase/server";
import type { ProfileChange, ProfileSnapshot } from "@/lib/profileChanges";
import { changesAcross, type ScanChangeSummary } from "@/lib/scanChanges";
import { FP_KEY_COLUMN, loadScanChangeRecords } from "@/lib/scanChanges.server";
import { describeScanChanges } from "@/lib/scanChangeText";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { isMonthlyReportsLive } from "@/lib/monthlyReportsFeatureFlag";
import { calendarDaysAgo, normalizeLocale } from "@/lib/i18n";
import { businessTimeZone } from "@/lib/businessTimeZone";

/** One real saved scan, exactly what the Reports page needs to plot the
 * score-over-time chart and diff listing changes — a narrower query than
 * getScoreHistory/getRecentScoreSnapshots in app/actions/scoring.ts,
 * which exist for other pages' own needs. */
export interface ReportsScoreRow {
  id: string;
  total: number;
  grade: string;
  created_at: string;
  /** Real Google listing fields at scan time (see buildProfileSnapshot in
   * lib/profileChanges.ts). Null for any scan saved before that column
   * existed — callers must treat that honestly as "nothing to diff from." */
  profile_snapshot_json: ProfileSnapshot | null;
  /** This scan's fingerprints' key id (lib/scanChanges.ts ScanRef). */
  fp_key?: string | null;
  /** The SCORING_VERSION saved with this scan (null if none recorded). */
  scoring_version: string | null;
  /** The saved scan's kind ("scoring_update": a re-score of saved data). */
  scan_kind?: string | null;
  /** This scan's three category scores, narrowed server-side from
   * breakdown_json so the full check list never ships to the browser.
   * null when the saved scan has no category breakdown. */
  categories: Record<ChartCategoryId, ChartCategoryScore> | null;
}

/** The Reports page's real, staged status for the monthly EMAIL report
 * feature — distinct from MonthlyRecap above, which is the in-app
 * scan-to-scan recap, not the emailed one. */
export interface MonthlyEmailReportStatus {
  /** See isMonthlyReportsLive(). False means every field below is moot —
   * the UI must show an honest "coming soon" state regardless of them. */
  live: boolean;
  /** This business's own real monthly_report_enabled column. */
  enabled: boolean;
  /** The most recent real monthly_reports.sent_at for this business —
   * owners already have SELECT on that table (see supabase/schema.sql).
   * null if no report has ever actually been sent. */
  lastSentAt: string | null;
}

export interface MonthlyRecap {
  previous: ReportsScoreRow;
  current: ReportsScoreRow;
  scoreDelta: number;
  /** Calendar days between the two scans in the business's time zone
   * (Oct 16 8pm → Oct 18 1am is 2 days, not "1 day" of elapsed hours). */
  daysBetween: number;
  changes: ProfileChange[];
  /** The same changes as our own records (lib/scanChanges.ts) — the
   * review count and rating read from here. */
  summary: ScanChangeSummary;
  /** True when either scan predates profile-snapshot tracking — `changes`
   * is honestly empty in that case, not "nothing changed." */
  changesUnavailable: boolean;
}

export type GetReportsDataResult =
  | {
      status: "ok";
      businessName: string | null;
      /** Every saved scan for this business, oldest first. Real history
       * only — never padded, interpolated, or capped to make a range
       * toggle look fuller than it is. */
      history: ReportsScoreRow[];
      /** Real `tasks` rows a later re-scan actually confirmed at full
       * points (see reconcileTasks in lib/actionPlan.ts) — never a task
       * the owner merely marked done but that hasn't been re-verified
       * against real data. */
      confirmedFixCount: number;
      /** The number of our own change records (lib/scanChanges.ts) across
       * every consecutive pair of scans that could be compared — the
       * real listing-field changes detected across the whole history. */
      listingChangesDetected: number;
      /** When the period `listingChangesDetected` covers starts — the first
       * scan that has a listing snapshot to compare from. null when no two
       * scans can be compared yet. */
      listingChangesSince: string | null;
      /** The business's own time zone — every date and day count here uses it. */
      timeZone: string;
      /** Built from the two most recent scans, whatever the real gap
       * between them happens to be — null when there's fewer than two. */
      recap: MonthlyRecap | null;
      /** Whether this business has connected its Google Business Profile
       * (see app/actions/gbp.ts) — gates the "Reviews replied to" /
       * "Google Posts published" tiles between a real "not tracked yet"
       * (Phase 1 has no source of this data at all) and, later, real
       * counts once that data actually flows in. */
      gbpConnected: boolean;
      /** The Reports page's monthly EMAIL report card data — see
       * MonthlyEmailReportStatus. */
      monthlyEmailReport: MonthlyEmailReportStatus;
    }
  | { status: "unauthenticated" }
  | { status: "not_found" };

/**
 * Loads everything the Reports page renders: the full real score history
 * (for the chart), a same-two-scans recap (score delta + real listing
 * changes), and the two counts the "what we've verified" card can
 * honestly show. RLS-scoped to the current user via the same
 * business-ownership checks every other business-scoped query here uses.
 */
export async function getReportsData(businessId: string): Promise<GetReportsDataResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  // Every read below needs only the business id — run them together.
  // (Each stays RLS-scoped: a business the user doesn't own returns
  // nothing, so not_found below still holds.)
  const [
    { data: business, error: businessError },
    { data: scores, error: scoresError },
    { count: confirmedFixCount, error: tasksError },
    gbpStatus,
    { data: lastReport },
  ] = await Promise.all([
    supabase.from("businesses").select("name, monthly_report_enabled, language, lat, lng, rating, review_count").eq("id", businessId).single(),
    supabase
      .from("scores")
      .select(`id, total, grade, created_at, profile_snapshot_json, scoring_version, ${FP_KEY_COLUMN}, scan_kind:breakdown_json->>scanKind, breakdown_categories:breakdown_json->categories`)
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    // Best-effort: a failed count here shouldn't fail the whole page, same
    // reasoning as reconcileActionPlanTasks in app/actions/scoring.ts.
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "completed"),
    getGbpConnectionStatus(businessId),
    // Owners have real SELECT on monthly_reports (see supabase/schema.sql)
    // — this is a plain RLS-scoped read, not a special case.
    supabase.from("monthly_reports").select("sent_at").eq("business_id", businessId).order("sent_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (businessError || !business) {
    return { status: "not_found" };
  }

  const locale = normalizeLocale(business.language);
  const timeZone = businessTimeZone(business.lat, business.lng);

  if (scoresError) {
    return { status: "not_found" };
  }

  const history: ReportsScoreRow[] = (scores ?? []).map((row) => {
    const r = row as Omit<ReportsScoreRow, "categories" | "scoring_version" | "scan_kind"> & {
      scoring_version: unknown;
      scan_kind: unknown;
      breakdown_categories: unknown;
    };
    return {
      id: r.id,
      total: r.total,
      grade: r.grade,
      created_at: r.created_at,
      profile_snapshot_json: r.profile_snapshot_json,
      fp_key: typeof r.fp_key === "string" ? r.fp_key : null,
      scoring_version: typeof r.scoring_version === "string" && r.scoring_version.length > 0 ? r.scoring_version : null,
      scan_kind: typeof r.scan_kind === "string" ? r.scan_kind : null,
      categories: parseChartCategories(r.breakdown_categories),
    };
  });

  // All-time (labeled "since {first comparable scan}" on the page) — the
  // recap's "What changed" covers only its own two scans.
  const records = await loadScanChangeRecords(supabase, history.slice(1).map((h) => h.id));
  const pair = (a: ReportsScoreRow, b: ReportsScoreRow) => changesAcross([{ id: a.id, fpKey: a.fp_key ?? null }, { id: b.id, fpKey: b.fp_key ?? null }], records);
  let listingChangesDetected = 0;
  let listingChangesSince: string | null = null;
  for (let i = 1; i < history.length; i++) {
    const summary = pair(history[i - 1], history[i]);
    if (summary.available) {
      listingChangesSince ??= history[i - 1].created_at;
      listingChangesDetected += summary.records.length;
    }
  }

  let recap: MonthlyRecap | null = null;
  if (history.length >= 2) {
    const previous = history[history.length - 2];
    const current = history[history.length - 1];
    const summary = pair(previous, current);
    recap = {
      previous,
      current,
      scoreDelta: current.total - previous.total,
      daysBetween: calendarDaysAgo(previous.created_at, new Date(current.created_at), timeZone),
      changes: describeScanChanges(summary.records, locale, { rating: business.rating, reviewCount: business.review_count }),
      summary,
      changesUnavailable: !summary.available,
    };
  }

  return {
    status: "ok",
    businessName: business.name,
    history,
    confirmedFixCount: tasksError || confirmedFixCount === null ? 0 : confirmedFixCount,
    listingChangesDetected,
    listingChangesSince,
    timeZone,
    recap,
    gbpConnected: gbpStatus.status === "ok" && gbpStatus.connected,
    monthlyEmailReport: {
      live: isMonthlyReportsLive(),
      enabled: business.monthly_report_enabled,
      lastSentAt: lastReport?.sent_at ?? null,
    },
  };
}
