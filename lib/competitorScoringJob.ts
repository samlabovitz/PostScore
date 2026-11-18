// Runs (or resumes) the full scoring of one saved competitor scan — in the
// background after a scan is saved, or from the backfill script. Never on
// page view. Each competitor's new full PostScore is kept in
// pending_breakdown_json until every competitor in the scan is done, then
// all are published together, so the page always shows a complete,
// consistent ranking (the last finished one meanwhile). Progress
// ("Checking 7 of 11…") and PageSpeed calls are kept on the job row.
//
// Day 23 2d-4b: the rows hold PostScore's own results only. Each
// competitor's listing comes in memory from the scan's own search
// (`inputs`), or — when that hand-off was lost — from one live re-read
// (lib/competitorReread.server.ts: counted, capped, logged). The owner's
// row is their latest SAVED score, compared like for like. Nothing this
// job writes holds a Google value.
//
// Speed-up: a NEW scan shows on the Competitors page right away, so each
// competitor's row is published the moment it's scored ("Updating — 3 of
// 7 websites checked"); a backfill still publishes everything together.
// A competitor whose own website PostScore fully checked in the last 14
// days reuses that result (lib/competitorWebsiteReuse.ts). On Netlify the
// Background Function runs one named competitor per step, several at once.

import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreCompetitorFully, type CompetitorListingInput } from "@/lib/competitorFullScoring";
import { canSpendPagespeed, pacificDayStart, pagespeedDailyBudget, PAGESPEED_CALLS_PER_SCAN_MAX, scoringConcurrency } from "@/lib/pagespeedBudget";
import type { ScoreBreakdown } from "@/lib/scoring";
import { normalizeLocale } from "@/lib/i18n";
import { forCompetitorComparison } from "@/lib/scoring";
import { breakdownWithoutQuotes } from "@/lib/breakdownStorage";
import { closedFirstScore, websiteAnalysisWithoutGoogle } from "@/lib/competitorRawCleanup";
import { latestScoreBreakdown } from "@/lib/ownerRankScore.server";
import { pickReusableWebsite, withReusedWebsite, WEBSITE_REUSE_DAYS, type PriorWebsiteRow } from "@/lib/competitorWebsiteReuse";
import { storageCleanupLive } from "@/lib/storageCleanupLive";

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

/** Each competitor's listing from the scan's own search, by place ID — in memory only. */
export type CompetitorListingInputs = Record<string, CompetitorListingInput>;

/** The only columns the job reads: our own results. */
const JOB_COLUMNS = "id, is_subject, place_id, breakdown_json, pending_breakdown_json";

interface ScanRow {
  id: string;
  is_subject: boolean;
  place_id: string;
  breakdown_json: unknown;
  pending_breakdown_json: unknown;
}

function isBreakdown(value: unknown): value is ScoreBreakdown {
  const v = value as Partial<ScoreBreakdown> | null;
  return !!v && typeof v === "object" && Array.isArray(v.checks) && Array.isArray(v.categories) && typeof v.total === "number";
}

/** This competitor's own rows from the last 14 days (any business's scans) — our own results only. */
async function defaultPriorRows(db: SupabaseClient, placeId: string, now: number): Promise<PriorWebsiteRow[]> {
  const since = new Date(now - WEBSITE_REUSE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from("competitor_scans")
    .select("scan_id, scoring_version, breakdown_json, website_analysis_json")
    .eq("place_id", placeId)
    .eq("is_subject", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);
  return (data ?? []) as PriorWebsiteRow[];
}

async function defaultReread(placeId: string, businessId: string): Promise<CompetitorListingInput | null> {
  const { rereadCompetitorListing } = await import("@/lib/competitorReread.server");
  return rereadCompetitorListing(placeId, businessId);
}

export async function runCompetitorScoringJob(
  db: SupabaseClient,
  scanId: string,
  options: {
    maxSites?: number;
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
    log?: (line: string) => void;
    /** The scan's own listings, in memory (never saved). */
    inputs?: CompetitorListingInputs | null;
    /** A listing the hand-off didn't bring: one live re-read (tests replace it). */
    reread?: (placeId: string, businessId: string) => Promise<CompetitorListingInput | null>;
    /** One step scores this competitor only (the Netlify steps run several at once). */
    onlyPlaceId?: string | null;
    /** This competitor's rows from the last 14 days, for reuse (tests replace it). */
    priorRows?: (placeId: string) => Promise<PriorWebsiteRow[]>;
    now?: number;
  } = {}
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

  const { data: rowsData, error: rowsError } = await db.from("competitor_scans").select(JOB_COLUMNS).eq("scan_id", scanId);
  if (rowsError || !rowsData) throw new Error(rowsError?.message ?? "Could not read the scan.");
  const rows = rowsData as unknown as ScanRow[];
  const { data: business } = await db.from("businesses").select("language").eq("id", job.business_id).maybeSingle();
  const locale = normalizeLocale(business?.language ?? null);
  await setJob({ status: "running", started_at: job.started_at ?? new Date().toISOString(), error: null });

  // The owner's row: their latest SAVED score — the same number as the
  // Overview (Day 23 2d-4b: never re-scored here, no Google call).
  // A new scan is on the page while it's scored: each row is published as it's done.
  const publishNow = job.kind !== "backfill";
  const now = options.now ?? Date.now();
  const scoredPatch = (b: ScoreBreakdown | null) =>
    publishNow && b ? { pending_breakdown_json: b, breakdown_json: b, total: b.total, grade: b.grade, scoring_version: b.scoringVersion } : { pending_breakdown_json: b };
  const owner = rows.find((r) => r.is_subject);
  if (owner && !owner.pending_breakdown_json) {
    const saved = await latestScoreBreakdown(db, job.business_id);
    if (isBreakdown(saved)) {
      // Like for like (v1.15.0): without the checks competitors aren't scored on.
      const comparable = breakdownWithoutQuotes(forCompetitorComparison(saved, locale));
      owner.pending_breakdown_json = comparable;
      await db.from("competitor_scans").update(scoredPatch(comparable)).eq("id", owner.id);
    }
  }
  const reread = options.reread ?? defaultReread;

  const competitors = rows.filter((r) => !r.is_subject);
  const todo = competitors.filter((r) => !r.pending_breakdown_json && (!options.onlyPlaceId || r.place_id === options.onlyPlaceId));
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
        const listing = options.inputs?.[row.place_id] ?? (await reread(row.place_id, job.business_id));
        // Checked in the last 14 days (not a backfill): that website result, no new check.
        const first = isBreakdown(row.breakdown_json) ? row.breakdown_json : null;
        const reusable =
          listing && first && publishNow
            ? pickReusableWebsite(await (options.priorRows ?? ((id: string) => defaultPriorRows(db, id, now)))(row.place_id), { listingWebsite: listing.website_url, scanId, now })
            : null;
        if (listing && first && reusable && isBreakdown(reusable.row.breakdown_json)) {
          breakdown = withReusedWebsite(first, reusable.row.breakdown_json, reusable.checkedAt, locale);
          websiteAnalysis = reusable.row.website_analysis_json;
          log(`  ${row.place_id}: website checked ${reusable.checkedAt.slice(0, 10)}, reused`);
        } else if (listing) {
          const res = await scoreCompetitorFully({ ...listing, place_id: row.place_id, breakdown_json: row.breakdown_json }, { locale, fetchImpl: options.fetchImpl });
          breakdown = res.breakdown;
          websiteAnalysis = res.websiteAnalysis;
          pagespeedCalls += res.pagespeedCalls;
        } else {
          // Google couldn't be read (or the month's re-reads are used up):
          // its first score is kept, "Website couldn't be checked" — never invented.
          log(`  ${row.place_id}: listing not available, first score kept`);
          breakdown = closedFirstScore(row.breakdown_json as ScoreBreakdown | null) ?? null;
        }
      } catch (err) {
        // Shouldn't happen (website problems are recorded, not thrown) —
        // keep this competitor's saved result rather than invent one.
        log(`  ${row.place_id}: scoring error, saved result kept (${err instanceof Error ? err.message : String(err)})`);
        breakdown = (row.breakdown_json as ScoreBreakdown | null) ?? null;
      }
      // Our own results only: no quoted text, no Google side of a comparison.
      breakdown = breakdownWithoutQuotes(breakdown);
      await db.from("competitor_scans").update({ ...scoredPatch(breakdown), website_analysis_json: websiteAnalysisWithoutGoogle(websiteAnalysis) }).eq("id", row.id);
      row.pending_breakdown_json = breakdown;
      done++;
      if (options.onlyPlaceId) {
        // Other steps run at the same time: count what's done now, and add
        // this site's PageSpeed calls to the latest total.
        const [{ count }, { data: latestJob }] = await Promise.all([
          db.from("competitor_scans").select("id", { count: "exact", head: true }).eq("scan_id", scanId).eq("is_subject", false).not("pending_breakdown_json", "is", null),
          db.from("competitor_scoring_jobs").select("pagespeed_calls").eq("scan_id", scanId).maybeSingle(),
        ]);
        if (typeof count === "number") done = count;
        pagespeedCalls = (latestJob?.pagespeed_calls ?? 0) + (pagespeedCalls - (job.pagespeed_calls ?? 0));
      }
      await setJob({ done, pagespeed_calls: pagespeedCalls });
      log(`  ${done}/${competitors.length} scored`);
    }
  }
  // Never more workers than sites this call may score (a one-site step is one site).
  await Promise.all(Array.from({ length: Math.max(1, Math.min(scoringConcurrency(env), todo.length || 1, options.maxSites ?? Infinity)) }, worker));

  // One step of several: the closing step (no competitor named) publishes.
  if (options.onlyPlaceId && stopped !== "pagespeed_budget") {
    await setJob({ status: "running" });
    return { status: "running", done, total: competitors.length, pagespeedCalls, stopped };
  }
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
    // Scored: Google's values aren't needed any more (dry run until
    // STORAGE_CLEANUP_LIVE=true, like the rest of the cleanup).
    if (storageCleanupLive(env)) {
      const { clearScanRawValues } = await import("@/lib/competitorRawCleanup.server");
      await clearScanRawValues(db, scanId);
    }
    return { status: "done", done, total: competitors.length, pagespeedCalls };
  }

  const reason = stopped === "pagespeed_budget" ? "Paused: today's PageSpeed budget (80% of the daily limit) is used up — resumes on the next run." : null;
  await setJob(stopped === "max_sites" ? { status: "running" } : { status: "failed", error: reason ?? "Stopped before every competitor was scored." });
  return { status: stopped === "max_sites" ? "running" : "failed", done, total: competitors.length, pagespeedCalls, stopped };
}

export type AddedScoringOutcome = "done" | "kept_first_score" | "pagespeed_budget" | "pagespeed_limit_not_set" | "missing";

/**
 * A competitor the owner added ("Add a competitor") joins a scan whose
 * scoring already finished: its website gets the same full scoring as
 * every other competitor (the owner's rules — a parked or 404 listing
 * link is "Website link doesn't work", never full website points). Its
 * listing comes in memory from the owner's own name search, or one live
 * re-read. Published on its own row right away; never re-scores the rest.
 */
export async function scoreAddedCompetitor(
  db: SupabaseClient,
  scanId: string,
  placeId: string,
  options: {
    input?: CompetitorListingInput | null;
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
    reread?: (placeId: string, businessId: string) => Promise<CompetitorListingInput | null>;
  } = {}
): Promise<AddedScoringOutcome> {
  const env = options.env ?? process.env;
  const budget = pagespeedDailyBudget(env);
  if (budget === null) return "pagespeed_limit_not_set";
  const { data } = await db.from("competitor_scans").select(`${JOB_COLUMNS}, business_id`).eq("scan_id", scanId).eq("place_id", placeId).maybeSingle();
  const row = data as unknown as (ScanRow & { business_id: string }) | null;
  if (!row || row.is_subject) return "missing";
  if (!canSpendPagespeed(await pagespeedUsedToday(db), budget)) return "pagespeed_budget";
  const { data: business } = await db.from("businesses").select("language").eq("id", row.business_id).maybeSingle();
  const locale = normalizeLocale(business?.language ?? null);
  const listing = options.input ?? (await (options.reread ?? defaultReread)(placeId, row.business_id));
  if (!listing) {
    // Couldn't be read: its first score stays, marked "Website couldn't be checked".
    const kept = breakdownWithoutQuotes(closedFirstScore(row.breakdown_json as ScoreBreakdown | null));
    if (kept) await db.from("competitor_scans").update({ breakdown_json: kept }).eq("id", row.id);
    return "kept_first_score";
  }
  const res = await scoreCompetitorFully({ ...listing, place_id: placeId, breakdown_json: row.breakdown_json }, { locale, fetchImpl: options.fetchImpl });
  const b = breakdownWithoutQuotes(res.breakdown);
  await db
    .from("competitor_scans")
    .update({ breakdown_json: b, total: b.total, grade: b.grade, scoring_version: b.scoringVersion, website_analysis_json: websiteAnalysisWithoutGoogle(res.websiteAnalysis) })
    .eq("id", row.id);
  // Its PageSpeed calls count toward today's budget, on the scan's job row.
  if (res.pagespeedCalls > 0) {
    const { data: job } = await db.from("competitor_scoring_jobs").select("pagespeed_calls").eq("scan_id", scanId).maybeSingle();
    if (job) await db.from("competitor_scoring_jobs").update({ pagespeed_calls: (job.pagespeed_calls ?? 0) + res.pagespeedCalls, updated_at: new Date().toISOString() }).eq("scan_id", scanId);
  }
  return "done";
}
