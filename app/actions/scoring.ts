"use server";

import { createClient } from "@/lib/supabase/server";
import {
  businessRowToScoringInput,
  getScoreWithSuggestions,
  type BusinessScoringRow,
  type ScoreWithSuggestions,
} from "@/lib/scoring";

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

  return { status: "saved", scoreId: data.id };
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
