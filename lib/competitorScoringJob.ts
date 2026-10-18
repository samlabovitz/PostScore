// Runs (or resumes) the full scoring of one saved competitor scan — in the
// background after a scan is saved, or from the backfill script. Never on
// page view. Each competitor's new full PostScore is kept in
// pending_breakdown_json until every competitor in the scan is done, then
// all are published together, so the page always shows a complete,
// consistent ranking (the last finished one meanwhile). Progress
// ("Checking 7 of 11…") and PageSpeed calls are kept on the job row.

import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreCompetitorFully, type CompetitorScoringRow } from "@/lib/competitorFullScoring";
import { canSpendPagespeed, pacificDayStart, pagespeedDailyBudget, PAGESPEED_CALLS_PER_SCAN_MAX, scoringConcurrency } from "@/lib/pagespeedBudget";
import { scoreBusinessWithClient } from "@/app/actions/scoring";
import type { ScoreBreakdown } from "@/lib/scoring";
import { normalizeLocale } from "@/lib/i18n";

export type ScoringJobKind = "new_scan" | "backfill";

export interface ScoringJobOutcome {
  status: "done" | "running" | "failed" | "missing";
  done: number;
  total: number;
  pagespeedCalls: number;
  /** Why it stopped early, when it did. */
  stopped?: "pagespeed_budget" | "pagespeed_limit_not_set" | "max_sites";
}

/** PageSpeed requests used today: owner scans (counted at the most they
 * can use) + competitor scoring jobs. */
export async function pagespeedUsedToday(db: SupabaseClient, now: Date = new Date()): Promise<number> {
  const since = pacificDayStart(now);
  const [{ count: ownerScans }, { data: jobs }] = await Promise.all([
    db.from("scores").select("id", { count: "exact", head: true }).gte("created_at", since),
    db.from("competitor_scoring_jobs").select("pagespeed_calls").gte("updated_at", since),
  ]);
  const competitorCalls = (jobs ?? []).reduce((sum: number, j: { pagespeed_calls: number | null }) => sum + (j.pagespeed_calls ?? 0), 0);
  return (ownerScans ?? 0) * PAGESPEED_CALLS_PER_SCAN_MAX + competitorCalls;
}

/** Creates (or re-queues) the job row for a scan. */
export async function queueScoringJob(db: SupabaseClient, scanId: string, businessId: string, kind: ScoringJobKind, total: number): Promise<void> {
  const { error } = await db
    .from("competitor_scoring_jobs")
    .upsert(
      { scan_id: scanId, business_id: businessId, kind, status: "queued", total, error: null, updated_at: new Date().toISOString() },
      { onConflict: "scan_id" }
    );
  if (error) throw new Error(error.message);
}

interface ScanRow extends CompetitorScoringRow {
  id: string;
  is_subject: boolean;
  pending_breakdown_json: unknown;
}

export async function runCompetitorScoringJob(
  db: SupabaseClient,
  scanId: string,
  options: { maxSites?: number; env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; log?: (line: string) => void } = {}
): Promise<ScoringJobOutcome> {
  const env = options.env ?? process.env;
  const log = options.log ?? (() => {});
  const { data: job } = await db.from("competitor_scoring_jobs").select("*").eq("scan_id", scanId).maybeSingle();
  if (!job) return { status: "missing", done: 0, total: 0, pagespeedCalls: 0 };
  if (job.status === "done") return { status: "done", done: job.done, total: job.total, pagespeedCalls: job.pagespeed_calls };

  const budget = pagespeedDailyBudget(env);
  const setJob = (patch: Record<string, unknown>) =>
    db.from("competitor_scoring_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("scan_id", scanId);
  if (budget === null) {
    await setJob({ status: "failed", error: "PAGESPEED_DAILY_LIMIT is not set" });
    return { status: "failed", done: job.done, total: job.total, pagespeedCalls: job.pagespeed_calls, stopped: "pagespeed_limit_not_set" };
  }

  const { data: rowsData, error: rowsError } = await db.from("competitor_scans").select("*").eq("scan_id", scanId);
  if (rowsError || !rowsData) throw new Error(rowsError?.message ?? "Could not read the scan.");
  const rows = rowsData as ScanRow[];
  const { data: business } = await db.from("businesses").select("language").eq("id", job.business_id).maybeSingle();
  const locale = normalizeLocale(business?.language ?? null);
  await setJob({ status: "running", started_at: job.started_at ?? new Date().toISOString(), error: null });

  // The owner's row: their own current PostScore — the same number as the Overview.
  const owner = rows.find((r) => r.is_subject);
  if (owner && !owner.pending_breakdown_json) {
    const scored = await scoreBusinessWithClient(db, job.business_id, locale);
    if (scored.status === "ok") {
      owner.pending_breakdown_json = scored.result.breakdown;
      await db.from("competitor_scans").update({ pending_breakdown_json: scored.result.breakdown }).eq("id", owner.id);
    }
  }

  const competitors = rows.filter((r) => !r.is_subject);
  const todo = competitors.filter((r) => !r.pending_breakdown_json);
  let done = competitors.length - todo.length;
  let pagespeedCalls = job.pagespeed_calls ?? 0;
  let started = 0;
  let stopped: ScoringJobOutcome["stopped"];

  async function worker() {
    while (todo.length > 0 && !stopped) {
      if (options.maxSites !== undefined && started >= options.maxSites) {
        stopped = "max_sites";
        return;
      }
      if (!canSpendPagespeed(await pagespeedUsedToday(db), budget)) {
        stopped = "pagespeed_budget";
        return;
      }
      // Another worker may have taken the last site while this one waited.
      const row = todo.shift();
      if (!row) return;
      started++;
      let breakdown: ScoreBreakdown | null = null;
      let websiteAnalysis: unknown = null;
      try {
        const res = await scoreCompetitorFully(row, { locale, fetchImpl: options.fetchImpl });
        breakdown = res.breakdown;
        websiteAnalysis = res.websiteAnalysis;
        pagespeedCalls += res.pagespeedCalls;
      } catch (err) {
        // Shouldn't happen (website problems are recorded, not thrown) —
        // keep this competitor's saved result rather than invent one.
        log(`  ${row.place_id}: scoring error, saved result kept (${err instanceof Error ? err.message : String(err)})`);
        breakdown = (row.breakdown_json as ScoreBreakdown | null) ?? null;
      }
      await db.from("competitor_scans").update({ pending_breakdown_json: breakdown, website_analysis_json: websiteAnalysis }).eq("id", row.id);
      row.pending_breakdown_json = breakdown;
      done++;
      await setJob({ done, pagespeed_calls: pagespeedCalls });
      log(`  ${done}/${competitors.length} scored`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(scoringConcurrency(env), todo.length || 1)) }, worker));

  if (competitors.every((r) => r.pending_breakdown_json)) {
    // Publish every row's new full score together.
    for (const r of rows) {
      const b = r.pending_breakdown_json as ScoreBreakdown | null;
      if (!b) continue;
      await db
        .from("competitor_scans")
        .update({ breakdown_json: b, total: b.total, grade: b.grade, scoring_version: b.scoringVersion, pending_breakdown_json: null })
        .eq("id", r.id);
    }
    await setJob({ status: "done", done, pagespeed_calls: pagespeedCalls, finished_at: new Date().toISOString() });
    return { status: "done", done, total: competitors.length, pagespeedCalls };
  }

  const reason = stopped === "pagespeed_budget" ? "Paused: today's PageSpeed budget (80% of the daily limit) is used up — resumes on the next run." : null;
  await setJob(stopped === "max_sites" ? { status: "running" } : { status: "failed", error: reason ?? "Stopped before every competitor was scored." });
  return { status: stopped === "max_sites" ? "running" : "failed", done, total: competitors.length, pagespeedCalls, stopped };
}
