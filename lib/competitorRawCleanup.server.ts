// Server-only. Clears Google's values from saved competitor scans
// (lib/competitorRawCleanup.ts): when a scan's full scoring finishes, and
// nightly for any scan whose scoring is done or that is over 24 hours old
// (lib/storageCleanup.server.ts, rule "competitor_raw"). A scan still being
// scored after 24 hours is closed first: a business's newest scan is
// published with what was fully scored (the rest keep their first score,
// "Website couldn't be checked"); a scan a newer one replaced stays hidden.
// Also blanks the names saved with the owner's Remove / Add choices (read
// live on the page). Counts only in logs.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPETITOR_RAW_COLUMNS, COMPETITOR_RAW_HOURS, clearedRowPatch, closedFirstScore, hasRawValues, type CompetitorRawRow } from "@/lib/competitorRawCleanup";

const ROW_COLUMNS = `id, scan_id, business_id, created_at, is_subject, ${COMPETITOR_RAW_COLUMNS.join(", ")}, breakdown_json, pending_breakdown_json, website_analysis_json, also_nearby_json`;
const ANY_RAW = COMPETITOR_RAW_COLUMNS.map((c) => `${c}.not.is.null`).join(",");

type Row = CompetitorRawRow & { scan_id: string; business_id: string; created_at: string; is_subject: boolean };
type Job = { scan_id: string; status: string; done: number; total: number };

export interface CompetitorRawCounts {
  rows: number;
  scans: number;
  /** Scans still being scored after 24 hours: closed with what was scored. */
  expiredJobs: number;
  overrideNames: number;
}

async function rowsWithRawValues(db: SupabaseClient, scanIds?: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 0; ; page++) {
    let q = db.from("competitor_scans").select(ROW_COLUMNS).or(ANY_RAW);
    if (scanIds) q = q.in("scan_id", scanIds);
    const { data, error } = await q.order("id").range(page * 500, page * 500 + 499);
    if (error) throw new Error(`competitor_scans: ${error.message}`);
    out.push(...((data ?? []) as unknown as Row[]).filter(hasRawValues));
    if ((data ?? []).length < 500) break;
  }
  return out;
}

async function jobsFor(db: SupabaseClient, scanIds: string[]): Promise<Map<string, Job>> {
  const jobs = new Map<string, Job>();
  for (let i = 0; i < scanIds.length; i += 200) {
    const { data } = await db.from("competitor_scoring_jobs").select("scan_id, status, done, total").in("scan_id", scanIds.slice(i, i + 200));
    for (const j of (data ?? []) as Job[]) jobs.set(j.scan_id, j);
  }
  return jobs;
}

/** Closes a scoring job still unfinished after 24 hours. A scan a newer
 * one replaced stays hidden (marked failed, so "Compared over time" never
 * gains it); a business's newest scan is published with what was scored. */
async function closeExpiredJob(db: SupabaseClient, scanId: string, rows: Row[], now: number): Promise<void> {
  const stamp = new Date(now).toISOString();
  const first = rows[0];
  const { data: newer } = first
    ? await db.from("competitor_scans").select("scan_id").eq("business_id", first.business_id).eq("is_subject", true).gt("created_at", first.created_at).limit(1)
    : { data: [] };
  if ((newer ?? []).length > 0) {
    await db.from("competitor_scoring_jobs").update({ status: "failed", error: "Superseded by a newer scan; closed after 24 hours.", updated_at: stamp }).eq("scan_id", scanId);
    for (const r of rows) r.pending_breakdown_json = null;
    await db.from("competitor_scans").update({ pending_breakdown_json: null }).eq("scan_id", scanId);
    return;
  }
  for (const r of rows) {
    const b = r.pending_breakdown_json as { total?: number; grade?: string; scoringVersion?: string } | null;
    if (!b) {
      if (!r.is_subject && r.breakdown_json) {
        r.breakdown_json = closedFirstScore(r.breakdown_json);
        await db.from("competitor_scans").update({ breakdown_json: r.breakdown_json }).eq("id", r.id);
      }
      continue;
    }
    await db.from("competitor_scans").update({ breakdown_json: b, total: b.total, grade: b.grade, scoring_version: b.scoringVersion, pending_breakdown_json: null }).eq("id", r.id);
    r.breakdown_json = b;
    r.pending_breakdown_json = null;
  }
  await db
    .from("competitor_scoring_jobs")
    .update({ status: "done", error: "Closed after 24 hours: what was fully scored is published; the rest keep their first score.", finished_at: stamp, updated_at: stamp })
    .eq("scan_id", scanId);
}

async function clearRows(db: SupabaseClient, rows: Row[]): Promise<number> {
  let cleared = 0;
  for (const r of rows) {
    const { error } = await db.from("competitor_scans").update(clearedRowPatch(r)).eq("id", r.id);
    if (!error) cleared++;
  }
  return cleared;
}

/** Right after a scan's full scoring is published (lib/competitorScoringJob.ts). */
export async function clearScanRawValues(db: SupabaseClient, scanId: string): Promise<number> {
  try {
    return await clearRows(db, await rowsWithRawValues(db, [scanId]));
  } catch {
    // The nightly cleanup catches it.
    return 0;
  }
}

/** The nightly rule. Dry run: counts what it would change, changes nothing. */
/** Rows one nightly run clears at most (one quick request); the rest the next night. */
export const NIGHTLY_MAX_ROWS = 300;

export async function cleanCompetitorRawValues(db: SupabaseClient, options: { now?: number; dryRun: boolean; maxRows?: number }): Promise<CompetitorRawCounts> {
  const now = options.now ?? Date.now();
  const cutoff = now - COMPETITOR_RAW_HOURS * 3_600_000;
  const rows = await rowsWithRawValues(db);
  const byScan = new Map<string, Row[]>();
  for (const r of rows) byScan.set(r.scan_id, [...(byScan.get(r.scan_id) ?? []), r]);
  const jobs = await jobsFor(db, Array.from(byScan.keys()));

  const due: Row[] = [];
  const expired: string[] = [];
  for (const [scanId, scanRows] of Array.from(byScan)) {
    const job = jobs.get(scanId);
    const old = scanRows.every((r) => Date.parse(r.created_at) < cutoff);
    // Under 24 hours, only a scan whose scoring is done (a brand-new scan
    // may not have its job row yet).
    if (!old && job?.status !== "done") continue;
    if (job && job.status !== "done") expired.push(scanId);
    due.push(...scanRows);
  }

  const { count: overrideNames } = await db.from("competitor_overrides").select("id", { count: "exact", head: true }).not("name", "is", null);
  const counts: CompetitorRawCounts = { rows: due.length, scans: new Set(due.map((r) => r.scan_id)).size, expiredJobs: expired.length, overrideNames: overrideNames ?? 0 };
  if (options.dryRun) return counts;

  // Whole scans only, up to the limit.
  const max = options.maxRows ?? Infinity;
  const batch: Row[] = [];
  for (const scanId of Array.from(new Set(due.map((r) => r.scan_id)))) {
    const scanRows = due.filter((r) => r.scan_id === scanId);
    if (batch.length > 0 && batch.length + scanRows.length > max) break;
    if (expired.includes(scanId)) await closeExpiredJob(db, scanId, scanRows, now);
    batch.push(...scanRows);
  }
  counts.rows = await clearRows(db, batch);
  if ((overrideNames ?? 0) > 0) await db.from("competitor_overrides").update({ name: null }).not("name", "is", null);
  return counts;
}
