// Which saved competitor scans may be shown. A NEW scan is shown only once
// every competitor in it has its full PostScore (its job is "done"); until
// then pages, the monthly report and PostAI keep using the last finished
// scan. A backfill re-scores an existing scan in place and never hides it
// (its old results stay until the new ones are published together).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ScoringProgress {
  scanId: string;
  kind: "new_scan" | "backfill";
  status: "queued" | "running" | "done" | "failed";
  done: number;
  total: number;
  error: string | null;
}

/** Scan ids of NEW scans not fully scored yet (to leave out). */
export async function unfinishedNewScanIds(supabase: SupabaseClient, businessId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("competitor_scoring_jobs")
    .select("scan_id")
    .eq("business_id", businessId)
    .eq("kind", "new_scan")
    .neq("status", "done");
  // No jobs table yet (before competitor-full-scoring.sql) → nothing hidden.
  if (error || !data) return new Set();
  return new Set(data.map((r: { scan_id: string }) => r.scan_id));
}

/** Rows of finished scans only. */
export function withoutUnfinished<T extends { scan_id: string }>(rows: T[], unfinished: Set<string>): T[] {
  return unfinished.size === 0 ? rows : rows.filter((r) => !unfinished.has(r.scan_id));
}

/** The business's newest job that isn't done yet — for "Checking 7 of 11…". */
export async function latestScoringProgress(supabase: SupabaseClient, businessId: string): Promise<ScoringProgress | null> {
  const { data, error } = await supabase
    .from("competitor_scoring_jobs")
    .select("scan_id, kind, status, done, total, error")
    .eq("business_id", businessId)
    .neq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { scanId: data.scan_id, kind: data.kind, status: data.status, done: data.done, total: data.total, error: data.error };
}
