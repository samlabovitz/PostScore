"use server";

import { createClient } from "@/lib/supabase/server";
import {
  businessRowToScoringInput,
  getScoreWithSuggestions,
  type BusinessScoringRow,
  type ScoreBreakdown,
  type ScoreWithSuggestions,
} from "@/lib/scoring";
import { reconcileTasks, type TaskRow } from "@/lib/actionPlan";

export interface BusinessRecord extends BusinessScoringRow {
  id: string;
  name: string | null;
  address: string | null;
  google_maps_uri: string | null;
}

export type ScoreBusinessResult =
  | { status: "ok"; business: BusinessRecord; result: ScoreWithSuggestions }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * Loads a saved business (RLS-scoped to the current user) and scores it
 * live. This never writes to the database — it's just lib/scoring.ts run
 * on whatever the businesses table currently holds, so viewing a
 * business's page is free to do as often as you like.
 */
export async function scoreBusinessById(businessId: string): Promise<ScoreBusinessResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: business, error } = await supabase
    .from("businesses")
    .select(
      "id, name, address, phone, website, rating, review_count, category, categories, opening_hours, photo_count, business_status, google_maps_uri"
    )
    .eq("id", businessId)
    .single();

  if (error || !business) {
    return { status: "not_found" };
  }

  const input = businessRowToScoringInput(business as BusinessScoringRow);
  const result = getScoreWithSuggestions(input);

  return { status: "ok", business: business as BusinessRecord, result };
}

export type SaveScoreSnapshotResult =
  | { status: "saved"; scoreId: string }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * Records the current score as a new row in `scores` — one row per scan,
 * so history accumulates. Uses the exact same breakdown scoreBusinessById
 * would show you; this just also persists it.
 *
 * This is also the app's one real "re-scan" moment, so it's where any
 * action-plan tasks marked "I did this" get checked against reality
 * (see reconcileTasks in lib/actionPlan.ts) — a task only ever becomes
 * completed here, by the real breakdown showing its check at full
 * points, never by the owner's checkbox alone. Note this re-scores
 * whatever is currently saved in `businesses` — it does not re-fetch
 * from Google, so a real Google-side fix (new hours, a linked website,
 * etc.) only shows up here once that business's saved row has itself
 * been refreshed (e.g. by re-running the Places lookup/save flow).
 */
export async function saveScoreSnapshot(businessId: string): Promise<SaveScoreSnapshotResult> {
  const scored = await scoreBusinessById(businessId);
  if (scored.status !== "ok") return scored;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("scores")
    .insert({
      business_id: businessId,
      total: scored.result.breakdown.total,
      grade: scored.result.breakdown.grade,
      breakdown_json: scored.result.breakdown,
      scoring_version: scored.result.breakdown.scoringVersion,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not save this scan." };
  }

  await reconcileActionPlanTasks(supabase, businessId, scored.result.breakdown, data.id);

  return { status: "saved", scoreId: data.id };
}

/**
 * Applies reconcileTasks()'s verdict to the `tasks` table: pending tasks
 * whose check is now genuinely full get marked completed and stamped
 * with the score that proved it; completed tasks whose check has since
 * regressed are deleted, since "completed" only means anything while
 * the real breakdown still agrees — a fresh task row is created next
 * time the owner marks it done again, rather than the row lying stale.
 * Best-effort: a failure here shouldn't fail the scan that was just
 * successfully saved.
 */
async function reconcileActionPlanTasks(
  supabase: ReturnType<typeof createClient>,
  businessId: string,
  breakdown: ScoreBreakdown,
  scoreId: string
): Promise<void> {
  const { data: taskRows, error } = await supabase
    .from("tasks")
    .select("id, check_id, status, promised_points, marked_done_at, verified_at")
    .eq("business_id", businessId);

  if (error || !taskRows || taskRows.length === 0) return;

  const { toComplete, toReopen } = reconcileTasks(breakdown, taskRows as TaskRow[]);

  if (toComplete.length > 0) {
    await supabase
      .from("tasks")
      .update({ status: "completed", verified_at: new Date().toISOString(), verified_score_id: scoreId })
      .in("id", toComplete);
  }

  if (toReopen.length > 0) {
    await supabase.from("tasks").delete().in("id", toReopen);
  }
}

export interface ScoreHistoryRow {
  id: string;
  total: number;
  grade: string;
  scoring_version: string;
  created_at: string;
}

/** Most recent scans for a business, newest first. RLS-scoped to the current user. */
export async function getScoreHistory(businessId: string): Promise<ScoreHistoryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("scores")
    .select("id, total, grade, scoring_version, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) return [];
  return data;
}

export interface ScoreSnapshot {
  id: string;
  total: number;
  grade: string;
  scoring_version: string;
  created_at: string;
  breakdown_json: ScoreBreakdown;
}

/**
 * The two (or so) most recent saved scans, full breakdown included —
 * used to build an honest "what changed since your last scan" view.
 * Deliberately a separate, narrower query from getScoreHistory(): the
 * history table only needs totals/grades for many rows, this needs the
 * full per-check breakdown for just the last couple.
 */
export async function getRecentScoreSnapshots(
  businessId: string,
  limit = 2
): Promise<ScoreSnapshot[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("scores")
    .select("id, total, grade, scoring_version, created_at, breakdown_json")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as ScoreSnapshot[];
}
