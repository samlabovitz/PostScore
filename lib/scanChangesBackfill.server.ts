// Server-only. Day 23 2c-2: gives every saved scan its fingerprints and
// turns each pair of consecutive saved listing snapshots into our own
// change records (lib/scanChanges.ts) — so "what changed" keeps its
// history once the readers use the records. Nothing is blanked here (2c-5).
// Same rules as a scan: a rating, or a review count without Business
// Profile, records only "changed"; connected owners' new reviews are
// counted from their own reviews (read once per business, never saved).
// Scans that already recorded their own changes are left as they are.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileSnapshot } from "@/lib/profileChanges";
import { fingerprintSnapshot, newReviewsSince, parseFieldFingerprints, scanChangeRecords, type GbpReviewTimes, type ScanChangeField } from "@/lib/scanChanges";

interface ScoreRow {
  id: string;
  business_id: string;
  created_at: string;
  profile_snapshot_json: ProfileSnapshot | null;
  field_fingerprints: unknown;
}

export interface ScanChangesBackfillCounts {
  businesses: number;
  scores: number;
  /** Scans given fingerprints from their saved snapshot. */
  fingerprinted: number;
  /** Consecutive pairs compared (both had a snapshot, the later one hadn't recorded its own). */
  pairs: number;
  records: number;
  byField: Partial<Record<ScanChangeField, number>>;
  /** Reviews records with an exact count (connected owners). */
  exactReviewRecords: number;
  /** Scans with no snapshot: their changes stay unknown. */
  withoutSnapshot: number;
}

export async function backfillScanChanges(
  db: SupabaseClient,
  options: { dryRun: boolean; key: Buffer; gbpReviews: (businessId: string) => Promise<GbpReviewTimes | null> }
): Promise<ScanChangesBackfillCounts> {
  const rows: ScoreRow[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("scores")
      .select("id, business_id, created_at, profile_snapshot_json, field_fingerprints")
      .order("business_id")
      .order("created_at")
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(`scores: ${error.message}`);
    rows.push(...((data ?? []) as ScoreRow[]));
    if ((data ?? []).length < 1000) break;
  }
  const byBusiness = new Map<string, ScoreRow[]>();
  for (const r of rows) byBusiness.set(r.business_id, [...(byBusiness.get(r.business_id) ?? []), r]);

  const counts: ScanChangesBackfillCounts = { businesses: byBusiness.size, scores: rows.length, fingerprinted: 0, pairs: 0, records: 0, byField: {}, exactReviewRecords: 0, withoutSnapshot: 0 };
  for (const [businessId, scans] of Array.from(byBusiness)) {
    const recordedAtScan = new Set(scans.filter((s) => parseFieldFingerprints(s.field_fingerprints)).map((s) => s.id));
    const { data: existing } = await db.from("scan_changes").select("score_id").eq("business_id", businessId);
    const hasRecords = new Set(((existing ?? []) as Array<{ score_id: string }>).map((r) => r.score_id));
    let reviews: GbpReviewTimes | null | undefined;

    for (let i = 0; i < scans.length; i++) {
      const s = scans[i];
      if (!s.profile_snapshot_json) {
        counts.withoutSnapshot++;
        continue;
      }
      if (!recordedAtScan.has(s.id)) {
        counts.fingerprinted++;
        if (!options.dryRun) {
          const { error } = await db.from("scores").update({ field_fingerprints: fingerprintSnapshot(s.profile_snapshot_json, businessId, options.key) }).eq("id", s.id);
          if (error) throw new Error(`scores.field_fingerprints: ${error.message}`);
        }
      }
      const prev = scans[i - 1];
      if (!prev?.profile_snapshot_json || recordedAtScan.has(s.id) || hasRecords.has(s.id)) continue;
      counts.pairs++;
      if (reviews === undefined) reviews = await options.gbpReviews(businessId);
      const newReviews = reviews ? newReviewsSince(reviews, prev.created_at, s.created_at) : null;
      const records = scanChangeRecords({ snapshot: prev.profile_snapshot_json }, { snapshot: s.profile_snapshot_json }, { newReviews });
      for (const r of records) {
        counts.byField[r.field] = (counts.byField[r.field] ?? 0) + 1;
        if (r.field === "reviews" && r.delta !== null) counts.exactReviewRecords++;
      }
      counts.records += records.length;
      if (!options.dryRun && records.length > 0) {
        const { error } = await db
          .from("scan_changes")
          .insert(records.map((r) => ({ business_id: businessId, score_id: s.id, previous_score_id: prev.id, field: r.field, direction: r.direction, delta: r.delta, at: s.created_at })));
        if (error) throw new Error(`scan_changes: ${error.message}`);
      }
    }
  }
  return counts;
}
