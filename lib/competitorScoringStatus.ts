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

/** The error a scoring job is closed with when a newer scan replaced it
 * (lib/competitorRawCleanup.server.ts) — never "paused", just replaced. */
export const SUPERSEDED_JOB_ERROR = "Superseded by a newer scan; closed after 24 hours.";

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

/** The business's newest job, while it isn't done — for "Checking 7 of
 * 11…" / "paused". An older unfinished job is never shown (a newer scan
 * replaced it), nor one closed as superseded. */
export async function latestScoringProgress(supabase: SupabaseClient, businessId: string): Promise<ScoringProgress | null> {
  const { data, error } = await supabase
    .from("competitor_scoring_jobs")
    .select("scan_id, kind, status, done, total, error")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return scoringProgressOf(data);
}

/** A job row as progress to show, or null (done, or superseded). Pure. */
export function scoringProgressOf(job: { scan_id: string; kind: ScoringProgress["kind"]; status: ScoringProgress["status"]; done: number; total: number; error: string | null }): ScoringProgress | null {
  if (job.status === "done" || job.error === SUPERSEDED_JOB_ERROR) return null;
  return { scanId: job.scan_id, kind: job.kind, status: job.status, done: job.done, total: job.total, error: job.error };
}
