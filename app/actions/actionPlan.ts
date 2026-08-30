"use server";

import { createClient } from "@/lib/supabase/server";
import {
  buildActionPlan,
  buildCompletedTasks,
  buildWeeklyPlan,
  type ActionPlanTask,
  type CompletedTask,
  type TaskRow,
  type WeeklyPlan,
} from "@/lib/actionPlan";
import { businessRowToScoringInput, scoreBusiness } from "@/lib/scoring";
import type { BusinessScoringInput, BusinessScoringRow, ScoreBreakdown, Suggestion } from "@/lib/scoring";

export type GetActionPlanResult =
  | ({ status: "ok"; tasks: ActionPlanTask[]; completed: CompletedTask[] } & WeeklyPlan)
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

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
  suggestions: Suggestion[]
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
    .select("id, check_id, status, promised_points, marked_done_at, verified_at")
    .eq("business_id", businessId);

  if (error) {
    return { status: "error", message: error.message };
  }

  const rows = (data ?? []) as TaskRow[];
  const tasks = buildActionPlan(breakdown, suggestions, rows);

  return {
    status: "ok",
    tasks,
    completed: buildCompletedTasks(breakdown, rows),
    ...buildWeeklyPlan(tasks, breakdown, input),
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
      "rating, review_count, phone, address, opening_hours, website, categories, category, photo_count, business_status, https_status"
    )
    .eq("id", businessId)
    .single();

  if (businessError || !business) {
    return { status: "not_found" };
  }

  const breakdown = scoreBusiness(businessRowToScoringInput(business as BusinessScoringRow));
  const check = breakdown.checks.find((c) => c.id === checkId);

  if (!check) {
    return { status: "error", message: `Unknown check id "${checkId}".` };
  }

  const promisedPoints = Math.round((check.maxPoints - (check.earnedPoints ?? 0)) * 10) / 10;

  const { error } = await supabase.from("tasks").upsert(
    {
      business_id: businessId,
      check_id: checkId,
      status: "pending_verification",
      promised_points: promisedPoints,
      marked_done_at: new Date().toISOString(),
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
