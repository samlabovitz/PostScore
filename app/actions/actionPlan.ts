"use server";

import { createClient } from "@/lib/supabase/server";
import {
  buildActionPlan,
  buildCompletedTasks,
  buildConnectGbpWeeklyTask,
  buildWeeklyPlan,
  mergeReviewTasks,
  mergeWebsiteTasks,
  weeklyTrackedMetricValue,
  WEEKLY_PLAN_CAP,
  type ActionPlanTask,
  type CompletedTask,
  type TaskRow,
  type WeeklyPlan,
} from "@/lib/actionPlan";
import { estimateStarterSiteRange, type StarterSiteTemplateData } from "@/lib/starterSiteScoring";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { isGbpConnectPublic } from "@/lib/googleBusinessProfile";
import { businessRowToScoringInput, scoreBusiness } from "@/lib/scoring";
import type { BusinessScoringInput, BusinessScoringRow, ScoreBreakdown, Suggestion } from "@/lib/scoring";
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "@/lib/i18n";

export type GetActionPlanResult =
  | ({ status: "ok"; tasks: ActionPlanTask[]; completed: CompletedTask[] } & WeeklyPlan)
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
  starterSiteContext?: StarterSiteContext
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

  const starterSiteRange =
    !input.website && starterSiteContext
      ? estimateStarterSiteRange(
          breakdown,
          starterSiteContext.businessRow,
          {
            businessName: starterSiteContext.businessName,
            category: input.primaryCategory,
            phone: input.phone,
            address: input.address,
            openingHours: input.openingHours,
            rating: input.rating,
            reviewCount: input.reviewCount,
            googleMapsUri: starterSiteContext.googleMapsUri,
            profileId: starterSiteContext.profileId,
          } satisfies StarterSiteTemplateData,
          locale
        )
      : null;

  const tasks = mergeWebsiteTasks(reviewMerged, breakdown, input, locale, starterSiteRange);

  // The connect_gbp "setup" item (see item 4/6 of Day 3 step 2e's
  // second pass): a real weekly-plan card, never a growth move (see
  // lib/growthMoves.ts's own doc for why it moved here), shown only
  // while the business's Google Business Profile genuinely isn't
  // connected AND GBP_CONNECT_PUBLIC=true (see isGbpConnectPublic's own
  // doc — off by default until Google's OAuth app verification is
  // approved, since an unverified app blocks non-test Google accounts).
  // Takes one of the weekly plan's own slots.
  const gbpStatus = await getGbpConnectionStatus(businessId);
  const connectGbpTask =
    isGbpConnectPublic() && gbpStatus.status === "ok" && !gbpStatus.connected
      ? buildConnectGbpWeeklyTask(businessId, locale)
      : null;
  const weeklyPlanCap = connectGbpTask ? WEEKLY_PLAN_CAP - 1 : WEEKLY_PLAN_CAP;

  const weeklyPlan = buildWeeklyPlan(tasks, breakdown, input, weeklyPlanCap, locale);
  const weeklyTasks = connectGbpTask ? [connectGbpTask, ...weeklyPlan.weeklyTasks] : weeklyPlan.weeklyTasks;

  return {
    status: "ok",
    tasks,
    completed: buildCompletedTasks(breakdown, rows),
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
      "rating, review_count, phone, address, opening_hours, website, categories, category, photo_count, business_status, https_status, website_analysis_json, language"
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
