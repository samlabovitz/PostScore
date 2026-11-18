"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { withLiveListingFor } from "@/lib/ownerListing.server";
import { createClient } from "@/lib/supabase/server";
import {
  applyGrowthWebsiteRules,
  buildActionPlan,
  buildCompletedTasks,
  buildWebsiteBanner,
  GOOGLE_MISMATCH_CHECK_ID,
  buildConnectGbpWeeklyTask,
  buildAllowBotStep,
  needsAllowBotStep,
  buildMarkOpenStep,
  buildWeeklyPlan,
  mergeReviewTasks,
  orderWeeklySteps,
  V112_STEP_CHECK_IDS,
  withStepLinks,
  mergeWebsiteTasks,
  weeklyReviewGap,
  encodeReviewGap,
  reviewsGainedSince,
  WEEKLY_PLAN_CAP,
  type ActionPlanTask,
  type CompletedTask,
  type TaskRow,
  type WebsiteBanner,
  type WeeklyPlan,
} from "@/lib/actionPlan";
import { estimateStarterSiteRange, type StarterSiteTemplateData } from "@/lib/starterSiteScoring";
import { businessRowToScoringInput, scoreBusiness, V112_SCORING_COLUMNS } from "@/lib/scoring";
import { withSavedScore } from "@/lib/savedScore";
import { latestSavedScore } from "@/lib/savedScore.server";
import type { BusinessScoringInput, BusinessScoringRow, ScoreBreakdown, Suggestion } from "@/lib/scoring";
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "@/lib/i18n";
import type { Plan } from "@/lib/plan";
import { scoreOnHold } from "@/lib/businessStatus";
import { orderByUrgency, urgentCheckIds, urgentIssues, type UrgentIssue } from "@/lib/urgency";

export type GetActionPlanResult =
  | ({
      status: "ok";
      tasks: ActionPlanTask[];
      completed: CompletedTask[];
      /** The Growth page's one website summary banner — see
       * buildWebsiteBanner (lib/actionPlan.ts). Null when there's nothing
       * left to fix. */
      websiteBanner: WebsiteBanner | null;
      /** What customers are hitting right now (lib/urgency.ts) — the
       * Overview's red alert, and the order of everything above. */
      urgentIssues: UrgentIssue[];
    } & WeeklyPlan)
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/** What getActionPlan needs, beyond the scoring-shaped `input`, to
 * honestly score PostScore's own starter template for a no-website
 * business (see lib/starterSiteScoring.ts) — real business facts that
 * BusinessScoringInput doesn't carry (a display name, Maps link, biz
 * profile id). Optional: when omitted (e.g. the assistant's own call,
 * which doesn't render a UI card), the no-website task simply falls
 * back to a single estimated value instead of a real template-based
 * range — see mergeWebsiteTasks's own doc.
 */
export interface StarterSiteContext {
  businessRow: BusinessScoringRow;
  businessName: string;
  googleMapsUri: string | null;
  profileId: string;
}

/**
 * Overlays any in-flight task status (pending verification / completed)
 * onto the live breakdown's own suggestions, then splits the result into
 * this week's achievable plan vs. everything longer-term (see
 * buildWeeklyPlan). Takes the input/breakdown/suggestions as arguments
 * rather than recomputing them, since the calling page has already
 * scored the business once — no need to fetch and re-score it a second
 * time just to build the plan.
 */
export async function getActionPlan(
  businessId: string,
  input: BusinessScoringInput,
  breakdown: ScoreBreakdown,
  suggestions: Suggestion[],
  locale: Locale = DEFAULT_LOCALE,
  starterSiteContext?: StarterSiteContext,
  /** Growth only: the plan, and whether to add the "Connect Google" step
   * (not connected, and connecting is switched on). */
  stepContext?: { plan: Plan; connectGoogle: boolean }
): Promise<GetActionPlanResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("id, check_id, status, promised_points, marked_done_at, verified_at, marked_metric_value")
    .eq("business_id", businessId);

  if (error) {
    return { status: "error", message: error.message };
  }

  const rows = await withReviewsGained(supabase, businessId, (data ?? []) as TaskRow[]);
  const rawTasks = buildActionPlan(breakdown, suggestions, rows, input, locale);
  // Merge the review checks (rating/review_count/review_recency) into
  // one card whenever more than one is an open gap, and the
  // deterministically-coupled website checks (has_website/website_link)
  // into one card whenever there's no website, before anything
  // downstream (the weekly plan, the UI) ever sees the list — see
  // mergeReviewTasks's and mergeWebsiteTasks's own docs for why.
  const reviewMerged = mergeReviewTasks(rawTasks, breakdown, input, locale);

  // Only for a business with no website at all — never one whose real
  // site was verified elsewhere (the real Bánh Mì Boy case).
  const starterSiteRange =
    !input.website && !input.verifiedElsewhereUrl && starterSiteContext
      ? estimateStarterSiteRange(
          breakdown,
          starterSiteContext.businessRow,
          {
            businessName: starterSiteContext.businessName,
            category: input.primaryCategory,
            phone: input.phone,
            address: input.address,
            // Scoring only: the reviews link doesn't change the analysis.
            placeId: null,
            profileId: starterSiteContext.profileId,
          } satisfies StarterSiteTemplateData,
          locale
        )
      : null;

  // Growth page / PostAI view (Step 2f): website.* tasks leave the plan
  // (summarized by websiteBanner instead), except the Google-mismatch
  // card. The monthly report builds its own plan from buildActionPlan
  // directly and is deliberately unaffected.
  // Urgent first (customers are hitting it now — lib/urgency.ts), then
  // by points as before. Order only: no task's points change.
  const urgent = urgentIssues(input, breakdown);
  const tasks = orderByUrgency(
    withStepLinks(applyGrowthWebsiteRules(mergeWebsiteTasks(reviewMerged, breakdown, input, locale, starterSiteRange), input, locale), businessId, locale),
    urgent
  );
  const websiteBanner = buildWebsiteBanner(breakdown, input, starterSiteRange);

  // The Google-mismatch card, the v1.12.0 steps (replies, fresh reviews,
  // customer details) and anything urgent always show this week whenever
  // they're open — exempt from the minimum and the cap (see buildWeeklyPlan).
  const weeklyPlan = buildWeeklyPlan(tasks, breakdown, input, WEEKLY_PLAN_CAP, locale, [GOOGLE_MISMATCH_CHECK_ID, ...V112_STEP_CHECK_IDS, ...urgentCheckIds(urgent)]);
  // Growth: "Connect Google" as the last step while it isn't connected — a
  // setup step (0 points, a link, never "I did this"); it unlocks replies
  // and the exact recent-review count.
  // v1.17.0: a site that blocks automated checks gets a setup step asking
  // the owner to let PostScoreBot in (the Website is only partly checked).
  const setupSteps = [
    ...(needsAllowBotStep(breakdown, input) ? [buildAllowBotStep(locale)] : []),
    ...(stepContext?.connectGoogle ? [buildConnectGbpWeeklyTask(businessId, locale, stepContext.plan)] : []),
  ];
  const weeklyTasks = orderWeeklySteps([...weeklyPlan.weeklyTasks, ...setupSteps]);

  // Google shows the business as permanently closed: the score is on hold
  // and marking it open is the only step (lib/businessStatus.ts).
  if (scoreOnHold(input.businessStatus)) {
    return {
      status: "ok",
      tasks: [],
      completed: buildCompletedTasks(breakdown, rows),
      websiteBanner: null,
      urgentIssues: [],
      ...weeklyPlan,
      weeklyTasks: [buildMarkOpenStep(locale)],
      laterTasks: [],
      weeklyProjectedBreakdown: breakdown,
      weeklyProjectedBreakdownHigh: null,
      weeklyPointsWithinReach: 0,
    };
  }

  return {
    status: "ok",
    tasks,
    completed: buildCompletedTasks(breakdown, rows),
    websiteBanner,
    urgentIssues: urgent,
    ...weeklyPlan,
    weeklyTasks,
  };
}

export type MarkTaskDoneResult =
  | { status: "ok" }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * Records that the owner says they made a real change. This never adds
 * points on its own — it sets the task to "pending verification," and
 * only reconcileTasks() (run on the next re-scan, see
 * saveScoreSnapshot) can move it to completed, and only by finding the
 * real check at full points again. The promised-points value is
 * recomputed server-side from the business's actual current data here
 * (never trusted from the client) so the eventual "points gained" record
 * is honest.
 */
/** Each pending task with the new reviews our scans recorded since it was
 * marked (scan_changes) — for its "1 of 3" progress. */
async function withReviewsGained(supabase: SupabaseClient, businessId: string, rows: TaskRow[]): Promise<TaskRow[]> {
  const marked = rows.filter((r) => r.status === "pending_verification" && r.marked_done_at && r.marked_metric_value !== null);
  if (marked.length === 0) return rows;
  const since = marked.map((r) => r.marked_done_at as string).sort()[0];
  const { data, error } = await supabase.from("scan_changes").select("field, direction, delta, at").eq("business_id", businessId).eq("field", "reviews").gt("at", since);
  if (error) return rows;
  const changes = (data ?? []) as Array<{ field: string; direction: string; delta: number | null; at: string }>;
  return rows.map((r) => (marked.includes(r) ? { ...r, reviews_gained_since_mark: reviewsGainedSince(changes, r.marked_done_at as string) } : r));
}

export async function markTaskDone(businessId: string, checkId: string): Promise<MarkTaskDoneResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: saved, error: businessError } = await supabase
    .from("businesses")
    .select(
      `name, place_id, listing_mode, rating, review_count, phone, address, opening_hours, website, categories, category, primary_type, business_type_override, biz_type_resolved, photo_count, business_status, https_status, website_analysis_json, verified_website_url, website_trust_overrides_json, language, ${V112_SCORING_COLUMNS}`
    )
    .eq("id", businessId)
    .single();

  if (businessError || !saved) {
    return { status: "not_found" };
  }
  // Day 23 2d-4: Google's values as read now, never the saved columns.
  const business = await withLiveListingFor(supabase, businessId, saved as typeof saved & { listing_mode?: string | null });

  const locale = normalizeLocale(business.language);
  const input = businessRowToScoringInput(business as unknown as BusinessScoringRow);
  // Day 23 2d-1: the points still to win are the saved scan's (the score
  // the owner sees), with today's breakdown only as a fallback.
  const now = scoreBusiness(input, locale);
  const breakdown = withSavedScore(now, await latestSavedScore(supabase, businessId), { liveUnavailable: business.live_unavailable === true }) ?? now;
  const check = breakdown.checks.find((c) => c.id === checkId);

  if (!check) {
    return { status: "error", message: `Unknown check id "${checkId}".` };
  }

  const promisedPoints = Math.round((check.maxPoints - (check.earnedPoints ?? 0)) * 10) / 10;
  // The reviews this week's ask needs ("3 more"), for a gradual check with
  // a numeric weekly target — a later scan shows "1 of 3" from our own
  // records of new reviews (lib/actionPlan.ts reviewsGainedSince). Our own
  // gap, never Google's count (Day 23 2d-4). Null for one-shot checks.
  const markedMetricValue = encodeReviewGap(weeklyReviewGap(checkId, input));

  const { error } = await supabase.from("tasks").upsert(
    {
      business_id: businessId,
      check_id: checkId,
      status: "pending_verification",
      promised_points: promisedPoints,
      marked_done_at: new Date().toISOString(),
      marked_metric_value: markedMetricValue,
      verified_at: null,
      verified_score_id: null,
    },
    { onConflict: "business_id,check_id" }
  );

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok" };
}
