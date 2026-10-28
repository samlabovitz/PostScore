"use server";

import { createClient } from "@/lib/supabase/server";
import {
  applyGrowthWebsiteRules,
  buildActionPlan,
  buildCompletedTasks,
  buildWebsiteBanner,
  GOOGLE_MISMATCH_CHECK_ID,
  buildConnectGbpWeeklyTask,
  buildMarkOpenStep,
  buildWeeklyPlan,
  mergeReviewTasks,
  orderWeeklySteps,
  V112_STEP_CHECK_IDS,
  withStepLinks,
  mergeWebsiteTasks,
  weeklyTrackedMetricValue,
  WEEKLY_PLAN_CAP,
  type ActionPlanTask,
  type CompletedTask,
  type TaskRow,
  type WebsiteBanner,
  type WeeklyPlan,
} from "@/lib/actionPlan";
import { estimateStarterSiteRange, type StarterSiteTemplateData } from "@/lib/starterSiteScoring";
import { businessRowToScoringInput, scoreBusiness, V112_SCORING_COLUMNS } from "@/lib/scoring";
import type { BusinessScoringInput, BusinessScoringRow, ScoreBreakdown, Suggestion } from "@/lib/scoring";
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "@/lib/i18n";
import type { Plan } from "@/lib/plan";
import { scoreOnHold } from "@/lib/businessStatus";

export type GetActionPlanResult =
  | ({
      status: "ok";
      tasks: ActionPlanTask[];
      completed: CompletedTask[];
      /** The Growth page's one website summary banner — see
       * buildWebsiteBanner (lib/actionPlan.ts). Null when there's nothing
       * left to fix. */
      websiteBanner: WebsiteBanner | null;
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

  const rows = (data ?? []) as TaskRow[];
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
  const tasks = withStepLinks(
    applyGrowthWebsiteRules(mergeWebsiteTasks(reviewMerged, breakdown, input, locale, starterSiteRange), input, locale),
    businessId,
    locale
  );
  const websiteBanner = buildWebsiteBanner(breakdown, input, starterSiteRange);

  // The Google-mismatch card and the v1.12.0 steps (replies, fresh
  // reviews, customer details) always show this week whenever they're
  // open — exempt from the minimum and the cap (see buildWeeklyPlan).
  const weeklyPlan = buildWeeklyPlan(tasks, breakdown, input, WEEKLY_PLAN_CAP, locale, [GOOGLE_MISMATCH_CHECK_ID, ...V112_STEP_CHECK_IDS]);
  // Growth: "Connect Google" as the last step while it isn't connected — a
  // setup step (0 points, a link, never "I did this"); it unlocks replies
  // and the exact recent-review count.
  const weeklyTasks = orderWeeklySteps(
    stepContext?.connectGoogle ? [...weeklyPlan.weeklyTasks, buildConnectGbpWeeklyTask(businessId, locale, stepContext.plan)] : weeklyPlan.weeklyTasks
  );

  // Google shows the business as permanently closed: the score is on hold
  // and marking it open is the only step (lib/businessStatus.ts).
  if (scoreOnHold(input.businessStatus)) {
    return {
      status: "ok",
      tasks: [],
      completed: buildCompletedTasks(breakdown, rows),
      websiteBanner: null,
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
export async function markTaskDone(businessId: string, checkId: string): Promise<MarkTaskDoneResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select(
      `name, rating, review_count, phone, address, opening_hours, website, categories, category, primary_type, business_type_override, photo_count, business_status, https_status, website_analysis_json, verified_website_url, website_trust_overrides_json, language, ${V112_SCORING_COLUMNS}`
    )
    .eq("id", businessId)
    .single();

  if (businessError || !business) {
    return { status: "not_found" };
  }

  const locale = normalizeLocale(business.language);
  const input = businessRowToScoringInput(business as BusinessScoringRow);
  const breakdown = scoreBusiness(input, locale);
  const check = breakdown.checks.find((c) => c.id === checkId);

  if (!check) {
    return { status: "error", message: `Unknown check id "${checkId}".` };
  }

  const promisedPoints = Math.round((check.maxPoints - (check.earnedPoints ?? 0)) * 10) / 10;
  // The real raw metric (e.g. review count) at this exact moment, for a
  // gradual check with a numeric weekly target — lets a later re-scan
  // show honest "1 of 3, X to go" progress against the real baseline
  // instead of just a points gap. Null for one-shot checks.
  const markedMetricValue = weeklyTrackedMetricValue(checkId, input);

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
