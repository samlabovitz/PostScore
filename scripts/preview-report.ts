// Dev-only, READ-ONLY (by default — see --fresh-scan below) preview of
// the monthly report email for one real business. Builds content via
// the exact same real function the cron route uses
// (buildMonthlyReportContent, lib/monthlyReport.ts) and renders the
// exact same real email component (MonthlyReportEmail,
// emails/MonthlyReportEmail.tsx) with the business's own real locale —
// never a second, hand-written reimplementation of either that could
// drift from what a real send actually looks like. The closing "What to
// focus on" section is likewise built from the SAME real data-access
// helpers the cron route itself uses (readTaskRows,
// computeTopActionPlanTask, computeFiringGrowthMoves,
// readRoutineCheckedCount — all exported from app/api/cron/
// monthly-reports/route.ts), never a separately re-derived version.
//
// Never sends email and never writes a monthly_reports row. Reads the
// business's LATEST already-saved `scores` row as-is (never re-scored).
//
// DEFAULT (no flags): fully no-cost and read-only. Competitor standing
// comes from the latest already-SAVED competitor scan, if any — no
// Google Places API calls, no new database row. This is what you want
// for routine previewing (and the only mode scripts/preview-report.ts
// should ever be run in without a deliberate reason).
//
// --fresh-scan: runs a REAL, billed competitor scan right now
// (saveCompetitorScanWithClient, the exact same real function the cron
// route calls) and writes a genuine new competitor_scans row — same
// real, billed Google Places Details calls the Competitors page's own
// "Save this scan" button makes. Only pass this when you deliberately
// want to preview against brand-new competitor data; routine preview
// runs should use the no-cost default instead.
//
// Writes the rendered HTML to ~/Desktop/report-preview-{business
// name}.html instead of emailing it, so you can open it straight in a
// browser.
//
// Usage (from the project root):
//   npx tsx scripts/preview-report.ts <businessId>
//   npx tsx scripts/preview-report.ts <businessId> --baseline
//   npx tsx scripts/preview-report.ts <businessId> --fresh-scan
//
// --baseline forces this to render as a genuine FIRST (baseline)
// report, ignoring any real monthly_reports history for this business —
// useful for previewing what an owner's very first report would
// honestly look like, independent of whatever has actually been sent
// before. Without it, this looks up the real previous monthly_reports
// row (if any) and renders an "update" report against it, exactly like
// a real scheduled run would.
//
// --locale=es (or any other supported locale) renders in that language
// instead of the business's own real stored `language` column — never
// writes that column, just overrides which language THIS preview uses.
//
// Finding a businessId: open that business's Overview page in the app —
// the id is the segment right after /business/ in the URL
// (postscoree.netlify.app/business/<businessId>).

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

import { createClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { render } from "@react-email/components";
import {
  buildMonthlyReportContent,
  type CompetitorDelta,
  type CompetitorSnapshot,
  type FocusGrowthMove,
  type FocusTopActionPlanTask,
  type MonthlyReportFocusInputs,
  type MonthlyReportScoreRow,
} from "../lib/monthlyReport";
import {
  businessRowToScoringInput,
  generateSuggestions,
  getScoreWithSuggestions,
  type BusinessScoringRow,
  type Grade,
  type ScoreBreakdown,
} from "../lib/scoring";
import { buildProfileSnapshot } from "../lib/profileChanges";
import { buildActionPlan, mergeReviewTasks, type TaskRow } from "../lib/actionPlan";
import { buildGrowthMoves, competitorPhotoCounts, median, weakWebsiteIssueLabels, type GrowthMoveSignals } from "../lib/growthMoves";
import { MonthlyReportEmail, monthlyReportSubject } from "../emails/MonthlyReportEmail";
import { normalizeLocale, reportCoverageMonthIndex, reportCoverageMonthRange } from "../lib/i18n";
import { resolveBizProfile } from "../config/bizProfiles";
import { saveCompetitorScanWithClient } from "../app/actions/competitors";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** One real `scores` row by id — same shape/columns as the cron route's
 * own readScoreRow (app/api/cron/monthly-reports/route.ts). */
async function readScoreRow(scoreId: string): Promise<MonthlyReportScoreRow | null> {
  const { data, error } = await supabase
    .from("scores")
    .select("id, total, grade, created_at, breakdown_json, profile_snapshot_json")
    .eq("id", scoreId)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    total: data.total,
    grade: data.grade as Grade,
    createdAt: data.created_at,
    profileSnapshot: data.profile_snapshot_json,
    breakdown: data.breakdown_json,
  };
}

/** The most recent `scores` row for this business — "the latest saved
 * score," never a fresh re-scan. */
async function readLatestScoreRow(businessId: string): Promise<MonthlyReportScoreRow | null> {
  const { data, error } = await supabase
    .from("scores")
    .select("id")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return readScoreRow(data.id);
}

/** The real competitor standing from one specific saved scan — same
 * logic as the cron route's own readCompetitorSnapshotForScan. */
async function readCompetitorSnapshotForScan(businessId: string, scanId: string): Promise<CompetitorSnapshot | null> {
  const { data, error } = await supabase
    .from("competitor_scans")
    .select("is_subject, total, review_count")
    .eq("business_id", businessId)
    .eq("scan_id", scanId);
  if (error || !data || data.length === 0) return null;

  const sorted = [...data].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  const subjectRank = sorted.findIndex((r) => r.is_subject);
  if (subjectRank === -1) return null;

  return {
    rank: subjectRank + 1,
    totalCompetitors: sorted.length,
    topCompetitorReviewCount: sorted[0]?.review_count ?? null,
  };
}

/** Runs a REAL, fresh competitor scan — the exact same real function
 * the cron route now calls for every business every month
 * (saveCompetitorScanWithClient, app/actions/competitors.ts) — and
 * reads back the real standing it just saved. Real, billed Google
 * Places Details calls; a real new competitor_scans row. Only called
 * when --fresh-scan is explicitly passed (see main()) — null only when
 * the scan genuinely found no comparable nearby businesses, or failed
 * outright. Returns the new scanId too, for the focus section's growth-
 * move photo-count signal. */
async function runFreshCompetitorScan(
  businessId: string
): Promise<{ scanId: string | null; snapshot: CompetitorSnapshot | null }> {
  const result = await saveCompetitorScanWithClient(supabase, businessId);
  if (result.status !== "saved") return { scanId: null, snapshot: null };
  return { scanId: result.scanId, snapshot: await readCompetitorSnapshotForScan(businessId, result.scanId) };
}

/** The real latest-SAVED competitor scan as of `cutoffIso` (default: now,
 * i.e. the latest scan period) — no Google API calls, no database write.
 * Same real best-effort heuristic as the cron route's own
 * readCompetitorSnapshotAsOf, used both for "what did standing look
 * like around the previous report" and, with cutoff=now, as this
 * script's own no-cost DEFAULT source of current competitor standing.
 * Returns the scanId too, for the focus section's growth-move
 * photo-count signal. */
async function readLatestSavedCompetitorScan(
  businessId: string,
  cutoffIso: string
): Promise<{ scanId: string | null; snapshot: CompetitorSnapshot | null }> {
  const { data, error } = await supabase
    .from("competitor_scans")
    .select("scan_id")
    .eq("business_id", businessId)
    .lte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { scanId: null, snapshot: null };
  return { scanId: data.scan_id, snapshot: await readCompetitorSnapshotForScan(businessId, data.scan_id) };
}

/** The real competitor standing as of the last scan at or before
 * `cutoffIso` — thin convenience wrapper over
 * readLatestSavedCompetitorScan, used to find "what did standing look
 * like around the previous report." */
async function readCompetitorSnapshotAsOf(businessId: string, cutoffIso: string): Promise<CompetitorSnapshot | null> {
  return (await readLatestSavedCompetitorScan(businessId, cutoffIso)).snapshot;
}

/** Whether this business has EVER had a real competitor scan saved —
 * mirrors route.ts's own hasAnyCompetitorScan (see its doc — Day 4 Part
 * 2c). Lets the preview tell apart "never scanned" from "a scan ran and
 * found nothing comparable" the same way a real send now does. */
async function hasAnyCompetitorScan(businessId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("competitor_scans")
    .select("scan_id")
    .eq("business_id", businessId)
    .limit(1)
    .maybeSingle();
  return !error && data !== null;
}

// ---------------------------------------------------------------------------
// Closing "What to focus on" section — real data-access mirrors for the
// SAME real pure functions (buildActionPlan, mergeReviewTasks,
// buildGrowthMoves) the Growth/Action-Plan pages use, exactly mirroring
// app/api/cron/monthly-reports/route.ts's own readTaskRows/
// computeTopActionPlanTask/computeFiringGrowthMoves/
// readRoutineCheckedCount (kept in sync with those by hand — this script
// can't import route.ts directly, since it transitively pulls in
// "server-only" modules that throw outside Next's own server build
// pipeline). Only the DATA ACCESS is duplicated here, never a second,
// different DECISION about what to show.
// ---------------------------------------------------------------------------

async function readCompetitorPhotoCountsForScan(businessId: string, scanId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from("competitor_scans")
    .select("is_subject, photo_count")
    .eq("business_id", businessId)
    .eq("scan_id", scanId);
  if (error || !data) return [];
  return competitorPhotoCounts(data.map((r) => ({ isSubject: r.is_subject, photoCount: r.photo_count })));
}

async function readTaskRows(businessId: string): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, check_id, status, promised_points, marked_done_at, verified_at, marked_metric_value")
    .eq("business_id", businessId);
  if (error) return [];
  return (data ?? []) as TaskRow[];
}

function computeTopActionPlanTask(
  breakdown: ScoreBreakdown,
  taskRows: TaskRow[],
  input: ReturnType<typeof businessRowToScoringInput>,
  locale: ReturnType<typeof normalizeLocale>
): FocusTopActionPlanTask | null {
  const suggestions = generateSuggestions(breakdown, locale);
  const rawTasks = buildActionPlan(breakdown, suggestions, taskRows, input, locale);
  const mergedTasks = mergeReviewTasks(rawTasks, breakdown, input, locale);
  const top = mergedTasks[0];
  if (!top) return null;
  return { checkId: top.checkId, label: top.label, action: top.action };
}

async function computeFiringGrowthMoves(
  businessId: string,
  breakdown: ScoreBreakdown,
  referralOk: boolean,
  competitorScanId: string | null,
  locale: ReturnType<typeof normalizeLocale>
): Promise<FocusGrowthMove[]> {
  const [businessResult, promoResult, referralResult, photoCounts] = await Promise.all([
    supabase.from("businesses").select("photo_count, pricing_assessed_at, website").eq("id", businessId).single(),
    supabase.from("promos").select("id").eq("business_id", businessId).limit(1),
    supabase.from("referrals").select("id").eq("business_id", businessId).limit(1),
    competitorScanId ? readCompetitorPhotoCountsForScan(businessId, competitorScanId) : Promise.resolve([]),
  ]);

  const hasWebsiteCheck = breakdown.checks.find((c) => c.id === "website.has_website");
  const signals: GrowthMoveSignals = {
    businessId,
    referralOk,
    hasEverCreatedPromo: (promoResult.data?.length ?? 0) > 0,
    hasEverCreatedReferral: (referralResult.data?.length ?? 0) > 0,
    pricingAssessedAt: businessResult.data?.pricing_assessed_at ?? null,
    photoCount: businessResult.data?.photo_count ?? null,
    competitorPhotos: { scanAvailable: competitorScanId !== null, medianCompetitorPhotoCount: median(photoCounts) },
    hasWebsite: (businessResult.data?.website ?? null) !== null,
    hasWebsiteTaskOpen: hasWebsiteCheck ? (hasWebsiteCheck.earnedPoints ?? 0) < hasWebsiteCheck.maxPoints : false,
    weakWebsiteIssueLabels: weakWebsiteIssueLabels(breakdown),
  };

  return buildGrowthMoves(signals, locale).map((m) => ({ id: m.id, title: m.title, why: m.why }));
}

async function readRoutineCheckedCount(businessId: string, reportDate: string): Promise<number | null> {
  const { start, end } = reportCoverageMonthRange(reportDate);
  const { count, error } = await supabase
    .from("weekly_checks")
    .select("item_id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("week_start", start)
    .lt("week_start", end);
  if (error) return null;
  return count ?? 0;
}

async function main() {
  const args = process.argv.slice(2);
  const forceBaseline = args.includes("--baseline");
  const freshScan = args.includes("--fresh-scan");
  const businessId = args.find((a) => !a.startsWith("--"));
  const localeOverrideArg = args.find((a) => a.startsWith("--locale="));
  const localeOverride = localeOverrideArg ? localeOverrideArg.slice("--locale=".length) : null;

  if (!businessId) {
    console.error("Usage: npx tsx scripts/preview-report.ts <businessId> [--baseline] [--fresh-scan] [--locale=es]");
    process.exit(1);
  }

  // Extended beyond name/language to also cover everything the closing
  // focus section's real sources need (business-type resolution,
  // growth-move signals, action-plan scoring input) — same columns as
  // the cron route's own freshBusiness select, one query reused for all
  // of it.
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select(
      "id, name, language, category, primary_type, business_type_override, categories, phone, address, opening_hours, website, photo_count, business_status, https_status, website_analysis_json, rating, review_count"
    )
    .eq("id", businessId)
    .single();
  if (businessError || !business) {
    console.error(`Could not find business ${businessId}: ${businessError?.message ?? "not found"}`);
    process.exit(1);
  }

  const currentRow = await readLatestScoreRow(businessId);
  if (!currentRow) {
    console.error(`Business ${businessId} has no saved scores row yet — nothing to preview.`);
    process.exit(1);
  }

  // The real previous report, unless --baseline deliberately ignores it
  // to preview a genuine first report instead.
  let baselineRow: MonthlyReportScoreRow | null = null;
  let previousReportSentAt: string | null = null;
  if (!forceBaseline) {
    const { data: previousReport } = await supabase
      .from("monthly_reports")
      .select("current_score_id, sent_at")
      .eq("business_id", businessId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousReport) {
      baselineRow = await readScoreRow(previousReport.current_score_id);
      previousReportSentAt = previousReport.sent_at;
    }
  }

  const reportDate = new Date().toISOString();

  // DEFAULT: the latest already-SAVED scan, no Google calls, no write.
  // --fresh-scan deliberately opts into a real, billed scan instead —
  // see this script's own top-of-file doc.
  const { scanId: competitorScanId, snapshot: currentCompetitorSnapshot } = freshScan
    ? await runFreshCompetitorScan(businessId)
    : await readLatestSavedCompetitorScan(businessId, reportDate);

  let competitorDelta: CompetitorDelta | null = null;
  if (currentCompetitorSnapshot && previousReportSentAt) {
    const previousSnapshot = await readCompetitorSnapshotAsOf(businessId, previousReportSentAt);
    if (previousSnapshot) {
      competitorDelta = { previous: previousSnapshot, current: currentCompetitorSnapshot };
    }
  }

  // This run's own scan succeeding already proves a scan exists — only
  // worth a separate existence check when it came up empty (--fresh-scan
  // found nothing) or wasn't run at all (the no-cost default found no
  // saved scan at this cutoff), to tell apart "never scanned at all"
  // from "a real scan just found nothing comparable" (Day 4 Part 2c).
  const hasSavedCompetitorScan = competitorScanId !== null || (await hasAnyCompetitorScan(businessId));

  // Normally the business's own real stored language — --locale lets
  // you preview a different language WITHOUT touching that real column,
  // for a business whose language hasn't been set to what you want to
  // check yet.
  const locale = normalizeLocale(localeOverride ?? business.language);

  // Real inputs for the closing focus section — see this file's
  // "Closing 'What to focus on' section" comment above. Same real
  // decisions as the cron route, never a second re-derived ranking.
  const profile = resolveBizProfile(
    business.category,
    business.primary_type,
    business.business_type_override ?? null,
    locale,
    business.categories,
    business.name
  );
  const scoringInput = businessRowToScoringInput(business as unknown as BusinessScoringRow);

  // LIVE score — the exact same scoreBusinessWithClient/
  // getScoreWithSuggestions path the Growth/Website/PostAI pages call,
  // run fresh on the current business row — never the possibly-stale
  // saved scores.breakdown_json this preview's no-rescan default mode
  // would otherwise trust (Day 4 Part 2a — the real Lamonsoff case: a
  // stale saved breakdown disagreeing with the live dashboard).
  const liveResult = getScoreWithSuggestions(scoringInput, locale);
  const currentForDisplay: MonthlyReportScoreRow = {
    id: currentRow.id,
    total: liveResult.breakdown.total,
    grade: liveResult.breakdown.grade,
    createdAt: currentRow.createdAt,
    profileSnapshot: buildProfileSnapshot(business),
    breakdown: liveResult.breakdown,
  };

  const taskRows = await readTaskRows(businessId);
  const topActionPlanTask = computeTopActionPlanTask(currentForDisplay.breakdown, taskRows, scoringInput, locale);
  const growthMoves = await computeFiringGrowthMoves(
    businessId,
    currentForDisplay.breakdown,
    profile.referralOk,
    competitorScanId,
    locale
  );
  const routineCheckedCount = await readRoutineCheckedCount(businessId, reportDate);
  const focusInputs: MonthlyReportFocusInputs = {
    topActionPlanTask,
    growthMoves,
    monthIndex: reportCoverageMonthIndex(reportDate),
    routineCheckedCount,
  };

  const content = buildMonthlyReportContent(
    baselineRow,
    currentForDisplay,
    competitorDelta,
    currentCompetitorSnapshot,
    locale,
    focusInputs,
    hasSavedCompetitorScan
  );

  const businessName = business.name ?? "Your business";
  // Obviously fake — this is a preview file, never a real send, so the
  // unsubscribe link must never look like a working one.
  const unsubscribeUrl = `https://postscoree.netlify.app/unsubscribe?business=${businessId}&token=PREVIEW-NOT-REAL`;

  // MonthlyReportEmail.tsx relies on Next's own build pipeline to inject
  // the JSX runtime automatically (tsconfig's "jsx": "preserve" is a
  // Next/SWC-only setting) — tsx's own esbuild-based transform doesn't
  // replicate that, so the compiled component references a bare
  // `React` global that's otherwise never defined when run standalone
  // like this. A real global, not a hack around the component itself:
  // same thing a plain <script> include of React would provide.
  (globalThis as unknown as { React: unknown }).React = require("react");

  const html = await render(
    createElement(MonthlyReportEmail, { businessName, reportDate, content, unsubscribeUrl, locale })
  );
  const subject = monthlyReportSubject(businessName, reportDate, locale);

  const safeName = businessName.replace(/[\\/:*?"<>|]/g, "").trim() || businessId;
  const outPath = path.join(os.homedir(), "Desktop", `report-preview-${safeName}.html`);
  fs.writeFileSync(outPath, html, "utf-8");

  console.log(
    `${businessName}: ${content.kind} report, locale "${locale}"${forceBaseline ? " (forced baseline)" : ""} — competitor data: ${freshScan ? "FRESH scan just run (billed)" : "latest saved scan (no cost)"}`
  );
  console.log(`Subject: ${subject}`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
