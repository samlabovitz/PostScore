// Dev-only, READ-ONLY preview of PostAI's real "REAL DATA CONTEXT" system-
// prompt block for one real business — the exact text
// buildAssistantContextText() (lib/assistant.ts) would send to the model,
// built from the exact same real, pure business-logic functions
// loadContext() (app/actions/assistant.ts) uses: scoreBusinessWithClient,
// buildActionPlan/mergeReviewTasks/mergeWebsiteTasks, buildCompletedTasks,
// buildGrowthMoves, buildWeeklyChecklistItems/buildWeeklyChecklistState,
// resolveBizProfile/bizProfile.
//
// loadContext() itself can't run outside a real signed-in browser request
// — every action it calls (getBusinessSummary, getActionPlan,
// getGrowthMoves, getWeeklyChecklistState, getGbpConnectionStatus,
// getLatestCompetitorSnapshot) checks the caller's own Supabase session via
// createClient()/auth.getUser(), and none of them (unlike
// scoreBusinessWithClient) has a client-parameterized variant. So this
// script re-reads the exact same real tables with the exact same real
// column lists directly, via a service-role client, instead of trying to
// call those session-gated actions — same approach scripts/preview-report.ts
// already uses for the monthly-report cron's own row-reading. It never
// reimplements any real DECISION logic by hand: every actual judgment
// (which checks are losing points, which growth moves fire, which action-
// plan tasks merge, which weekly items are checked) still runs through the
// real, imported, pure functions.
//
// NEVER calls the Anthropic API, and NEVER writes to the database —
// pure reads only, so this is safe to run against real production data as
// often as you like.
//
// Writes the context text to ~/Desktop/postai-context-{business name}.md.
//
// Usage (from the project root):
//   npx tsx scripts/preview-assistant-context.ts <businessId>
//   npx tsx scripts/preview-assistant-context.ts <businessId> --locale=es
//
// --locale=es (or any other supported locale) previews in that language
// instead of the business's own real stored `language` column — never
// writes that column, just overrides which language THIS preview uses.
//
// Finding a businessId: open that business's Overview page in the app —
// the id is the segment right after /business/ in the URL
// (postscore.app/business/<businessId>).

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

import { createClient } from "@supabase/supabase-js";
import type { CompetitorSnapshot } from "../app/actions/competitors";
import {
  businessRowToScoringInput,
  getScoreWithSuggestions,
  type BusinessScoringRow,
  type ScoreBreakdown,
} from "../lib/scoring";
import { bizProfile, resolveBizProfile } from "../config/bizProfiles";
import { priceLevelToSymbol } from "../lib/priceLevel";
import {
  buildActionPlan,
  buildCompletedTasks,
  mergeReviewTasks,
  mergeWebsiteTasks,
  type TaskRow,
} from "../lib/actionPlan";
import {
  buildGrowthMoves,
  competitorPhotoCounts,
  median,
  weakWebsiteIssueLabels,
  type GrowthMoveSignals,
} from "../lib/growthMoves";
import {
  buildWeeklyChecklistItems,
  buildWeeklyChecklistState,
  type WeeklyCheckRow,
} from "../lib/weeklyChecklist";
import { normalizeLocale, type Locale } from "../lib/i18n";
import {
  buildAssistantContextText,
  MAX_ACTION_PLAN_TASKS_IN_CONTEXT,
  MAX_FIXED_ITEMS_IN_CONTEXT,
  MAX_GROWTH_MOVES_IN_CONTEXT,
  MAX_LOSING_CHECKS_IN_CONTEXT,
  MAX_SCORE_HISTORY_IN_CONTEXT,
  type AssistantActionPlanTask,
  type AssistantBusinessContext,
  type AssistantBusinessProfile,
  type AssistantCompetitorSummary,
  type AssistantExcludedCheck,
  type AssistantFixedItem,
  type AssistantGrowthMove,
  type AssistantLosingCheck,
  type AssistantScoreHistoryEntry,
  type AssistantWeeklyRoutineSummary,
} from "../lib/assistant";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** Mirrors scoreBusinessWithClient's exact select and pure compute
 * (app/actions/scoring.ts) — reimplemented here with the pure
 * businessRowToScoringInput/getScoreWithSuggestions (lib/scoring.ts)
 * rather than importing scoreBusinessWithClient itself, since that
 * module transitively imports app/actions/businesses.ts, which pulls
 * in lib/websiteScreenshotUpload.ts's `import "server-only"` guard —
 * a hard throw outside Next's own build pipeline, even for an unused
 * export. Never a second SCORING implementation: still the same real
 * businessRowToScoringInput + getScoreWithSuggestions every page uses. */
async function readAndScoreBusiness(businessId: string, locale: Locale) {
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, address, phone, website, rating, review_count, category, categories, opening_hours, opening_hours_periods, photo_count, business_status, https_status, website_analysis_json, google_maps_uri, language"
    )
    .eq("id", businessId)
    .single();
  if (error || !data) return null;
  const input = businessRowToScoringInput(data as unknown as BusinessScoringRow);
  const result = getScoreWithSuggestions(input, locale);
  return { business: data, input, result };
}

/** Mirrors getBusinessSummary's exact select (app/actions/businesses.ts) —
 * the columns loadContext needs to derive locale and the persisted
 * "WHAT WE KNOW ABOUT THIS BUSINESS" memory section, read BEFORE scoring. */
async function readBusinessSummary(businessId: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, address, category, primary_type, business_type_override, trade_id, phone, services, avg_job_value_low, avg_job_value_high, language"
    )
    .eq("id", businessId)
    .single();
  if (error || !data) return null;
  return data;
}

/** Mirrors getScoreHistory's exact select (app/actions/scoring.ts). */
async function readScoreHistory(businessId: string) {
  const { data, error } = await supabase
    .from("scores")
    .select("id, total, grade, scoring_version, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data;
}

/** Mirrors getGbpConnectionStatus's exact select (app/actions/gbp.ts). */
async function readGbpConnected(businessId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("gbp_connections")
    .select("connected_at, status")
    .eq("business_id", businessId)
    .eq("status", "connected")
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/** Mirrors getLatestCompetitorSnapshot's exact select and "latest scan
 * only" grouping (app/actions/competitors.ts) — the last SAVED scan,
 * never a live lookup. */
async function readLatestCompetitorSnapshot(businessId: string): Promise<CompetitorSnapshot | null> {
  const { data, error } = await supabase
    .from("competitor_scans")
    .select("scan_id, created_at, is_subject, name, total, grade, price_level, photo_count")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data || data.length === 0) return null;

  const rows = data as Array<{
    scan_id: string;
    created_at: string;
    is_subject: boolean;
    name: string | null;
    total: number | null;
    grade: string | null;
    price_level: string | null;
    photo_count: number | null;
  }>;
  const latestScanId = rows[0].scan_id;
  const latestRows = rows.filter((r) => r.scan_id === latestScanId);

  return {
    scanId: latestScanId,
    createdAt: rows[0].created_at,
    entries: latestRows.map((r) => ({
      name: r.name,
      isSubject: r.is_subject,
      total: r.total,
      grade: r.grade,
      priceLevel: r.price_level,
      photoCount: r.photo_count,
    })),
  };
}

/** Mirrors the `tasks` table select inside getActionPlan
 * (app/actions/actionPlan.ts). */
async function readTaskRows(businessId: string): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, check_id, status, promised_points, marked_done_at, verified_at, marked_metric_value")
    .eq("business_id", businessId);
  if (error) return [];
  return (data ?? []) as TaskRow[];
}

/** Mirrors the `promos`/`referrals` existence checks and `businesses`
 * photo/pricing/website select inside getGrowthMoveSignals
 * (app/actions/growthMoves.ts), reusing the already-fetched competitor
 * snapshot exactly like the real assistant action now does — never a
 * second getLatestCompetitorSnapshot read. */
async function readGrowthMoveSignals(
  businessId: string,
  breakdown: ScoreBreakdown,
  referralOk: boolean,
  snapshot: CompetitorSnapshot | null
): Promise<GrowthMoveSignals> {
  const [businessResult, promoResult, referralResult] = await Promise.all([
    supabase.from("businesses").select("photo_count, pricing_assessed_at, website").eq("id", businessId).single(),
    supabase.from("promos").select("id").eq("business_id", businessId).limit(1),
    supabase.from("referrals").select("id").eq("business_id", businessId).limit(1),
  ]);

  const photoCounts = snapshot ? competitorPhotoCounts(snapshot.entries) : [];
  const hasWebsiteCheck = breakdown.checks.find((c) => c.id === "website.has_website");

  return {
    businessId,
    referralOk,
    hasEverCreatedPromo: (promoResult.data?.length ?? 0) > 0,
    hasEverCreatedReferral: (referralResult.data?.length ?? 0) > 0,
    pricingAssessedAt: businessResult.data?.pricing_assessed_at ?? null,
    photoCount: businessResult.data?.photo_count ?? null,
    competitorPhotos: { scanAvailable: snapshot !== null, medianCompetitorPhotoCount: median(photoCounts) },
    hasWebsite: (businessResult.data?.website ?? null) !== null,
    hasWebsiteTaskOpen: hasWebsiteCheck ? (hasWebsiteCheck.earnedPoints ?? 0) < hasWebsiteCheck.maxPoints : false,
    weakWebsiteIssueLabels: weakWebsiteIssueLabels(breakdown),
  };
}

/** Mirrors the `weekly_checks` table select inside getWeeklyChecklistState
 * (app/actions/weeklyChecklist.ts). */
async function readWeeklyCheckRows(businessId: string): Promise<WeeklyCheckRow[]> {
  const { data, error } = await supabase
    .from("weekly_checks")
    .select("week_start, item_id")
    .eq("business_id", businessId)
    .order("week_start", { ascending: false });
  if (error) return [];
  return (data ?? []) as WeeklyCheckRow[];
}

async function main() {
  const args = process.argv.slice(2);
  const businessId = args.find((a) => !a.startsWith("--"));
  const localeOverrideArg = args.find((a) => a.startsWith("--locale="));
  const localeOverride = localeOverrideArg ? localeOverrideArg.slice("--locale=".length) : null;

  if (!businessId) {
    console.error("Usage: npx tsx scripts/preview-assistant-context.ts <businessId> [--locale=es]");
    process.exit(1);
  }

  const summary = await readBusinessSummary(businessId);
  if (!summary) {
    console.error(`Could not find business ${businessId}.`);
    process.exit(1);
  }

  // Normally the business's own real stored language — --locale lets you
  // preview a different language WITHOUT touching that real column, same
  // convention as scripts/preview-report.ts's own --locale flag.
  const locale = normalizeLocale(localeOverride ?? summary.language);
  const scored = await readAndScoreBusiness(businessId, locale);
  if (!scored) {
    console.error(`Could not score business ${businessId}: not found.`);
    process.exit(1);
  }

  // Mirrors app/actions/assistant.ts's own loadContext() exactly,
  // including the `name` omission on autoDetectedProfile specifically —
  // see that file's own comment for why.
  const autoDetectedProfile = bizProfile(
    summary.category,
    summary.primary_type,
    locale,
    scored.business.categories,
    null
  );
  const businessTypeOverride = summary.business_type_override ?? null;
  const profile = resolveBizProfile(
    summary.category,
    summary.primary_type,
    businessTypeOverride,
    locale,
    scored.business.categories,
    scored.business.name
  );
  const { input } = scored;
  const { breakdown, suggestions } = scored.result;

  const taskRows = await readTaskRows(businessId);
  const rawTasks = buildActionPlan(breakdown, suggestions, taskRows, input, locale);
  const reviewMerged = mergeReviewTasks(rawTasks, breakdown, input, locale);
  // starterSiteRange is always null here, matching loadContext's own
  // getActionPlan call — it never passes a starterSiteContext either,
  // since the assistant's context has no UI card to render a real range
  // into (see StarterSiteContext's own doc in app/actions/actionPlan.ts).
  const tasks = mergeWebsiteTasks(reviewMerged, breakdown, input, locale, null);
  const completed = buildCompletedTasks(breakdown, taskRows);

  const topTasks: AssistantActionPlanTask[] = tasks.slice(0, MAX_ACTION_PLAN_TASKS_IN_CONTEXT).map((t) => ({
    label: t.label,
    category: t.category,
    promisedPoints: t.promisedPoints,
    action: t.action,
    effort: t.effort,
  }));

  const snapshot = await readLatestCompetitorSnapshot(businessId);
  const competitors: AssistantCompetitorSummary = snapshot
    ? (() => {
        const sorted = [...snapshot.entries].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
        const subjectRank = sorted.findIndex((e) => e.isSubject) + 1;
        return {
          available: true,
          scanAt: new Date(snapshot.createdAt).toLocaleDateString(),
          subjectRank: subjectRank > 0 ? subjectRank : null,
          entries: sorted.map((e) => ({
            name: e.name ?? "Unnamed business",
            isSubject: e.isSubject,
            total: e.total,
            grade: e.grade,
            priceLevelSymbol: priceLevelToSymbol(e.priceLevel),
          })),
        };
      })()
    : { available: false, scanAt: null, subjectRank: null, entries: [] };

  const growthSignals = await readGrowthMoveSignals(businessId, breakdown, profile.referralOk, snapshot);
  const growthMoves: AssistantGrowthMove[] = buildGrowthMoves(growthSignals, locale)
    .slice(0, MAX_GROWTH_MOVES_IN_CONTEXT)
    .map((m) => ({
      id: m.id,
      title: m.title,
      why: m.why,
      pricingAssessedAt: growthSignals.pricingAssessedAt,
      yourPhotoCount: growthSignals.photoCount,
      competitorMedianPhotoCount: growthSignals.competitorPhotos.medianCompetitorPhotoCount,
      weakWebsiteIssueLabels: growthSignals.weakWebsiteIssueLabels,
    }));

  const weeklyCheckRows = await readWeeklyCheckRows(businessId);
  const checklistState = buildWeeklyChecklistState(weeklyCheckRows);
  const weeklyRoutine: AssistantWeeklyRoutineSummary = {
    items: buildWeeklyChecklistItems(locale).map((item) => ({
      title: item.title,
      checkedThisWeek: checklistState.checkedItemIds.has(item.id),
    })),
    streakWeeks: checklistState.streakWeeks,
  };

  const losingChecks: AssistantLosingCheck[] = suggestions.slice(0, MAX_LOSING_CHECKS_IN_CONTEXT).map((s) => {
    const check = breakdown.checks.find((c) => c.id === s.checkId)!;
    return {
      checkId: s.checkId,
      label: s.label,
      category: s.category,
      earnedPoints: check.earnedPoints,
      maxPoints: check.maxPoints,
      explanation: check.explanation,
    };
  });

  const excludedChecks: AssistantExcludedCheck[] = breakdown.checks
    .filter((c) => c.confidence === "UNCERTAIN" || c.confidence === "NOT_FOUND")
    .map((c) => ({ label: c.label, confidence: c.confidence, explanation: c.explanation }));

  const scoreHistoryRows = await readScoreHistory(businessId);
  const scoreHistory: AssistantScoreHistoryEntry[] = scoreHistoryRows
    .slice(0, MAX_SCORE_HISTORY_IN_CONTEXT)
    .map((h) => ({ total: h.total, grade: h.grade as AssistantScoreHistoryEntry["grade"], date: new Date(h.created_at).toLocaleDateString() }))
    .reverse();

  const fixedItems: AssistantFixedItem[] = completed.slice(0, MAX_FIXED_ITEMS_IN_CONTEXT).map((c) => ({
    label: c.label,
    pointsGained: c.pointsGained,
    verifiedAt: c.verifiedAt ? new Date(c.verifiedAt).toLocaleDateString() : null,
  }));

  const businessProfile: AssistantBusinessProfile = {
    businessType: profile.label,
    businessTypeId: profile.id,
    autoDetectedBusinessType: autoDetectedProfile.label,
    autoDetectedBusinessTypeId: autoDetectedProfile.id,
    businessTypeOverridden: businessTypeOverride !== null,
    referralOk: profile.referralOk,
    location: summary.address ?? null,
    services: summary.services ?? [],
    avgJobValueLow: summary.avg_job_value_low ?? null,
    avgJobValueHigh: summary.avg_job_value_high ?? null,
    scoreHistory,
    fixedItems,
  };

  const gbpConnected = await readGbpConnected(businessId);

  const context: AssistantBusinessContext = {
    listing: {
      name: scored.business.name,
      categoryLabel: profile.label,
      rating: scored.business.rating,
      reviewCount: scored.business.review_count,
      phonePresent: !!scored.business.phone && scored.business.phone.trim().length > 0,
      addressPresent: !!scored.business.address && scored.business.address.trim().length > 0,
      hoursPresent: !!scored.business.opening_hours && scored.business.opening_hours.length > 0,
      websitePresent: !!scored.business.website && scored.business.website.trim().length > 0,
      httpsStatus: input.httpsStatus,
      photoCount: scored.business.photo_count,
      businessStatus: scored.business.business_status,
      categoriesCount: scored.business.categories?.length ?? 0,
    },
    score: {
      total: breakdown.total,
      grade: breakdown.grade,
      categories: breakdown.categories.map((c) => ({
        id: c.id,
        label: c.label,
        relativeScore: c.relativeScore,
        earnedPoints: c.earnedPoints,
        possiblePoints: c.possiblePoints,
      })),
      losingChecks,
      excludedChecks,
    },
    actionPlan: { topTasks },
    growthMoves,
    weeklyRoutine,
    competitors,
    profile: businessProfile,
    gbp: { connected: gbpConnected },
  };

  const text = buildAssistantContextText(context, locale);

  const businessName = summary.name ?? "Your business";
  const safeName = businessName.replace(/[\\/:*?"<>|]/g, "").trim() || businessId;
  const outPath = path.join(os.homedir(), "Desktop", `postai-context-${safeName}.md`);
  fs.writeFileSync(outPath, text, "utf-8");

  console.log(`${businessName}: PostScore ${breakdown.total}/100 (Grade ${breakdown.grade}), locale "${locale}"`);
  console.log(`Growth moves firing: ${growthMoves.length}. Weekly routine streak: ${weeklyRoutine.streakWeeks}.`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
