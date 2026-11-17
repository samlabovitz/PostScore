// Server-only. Day 23 2c-5: blanks the copies of Google's listing values
// saved with each scan (scores.profile_snapshot_json). Their history
// already lives in our own change records and each scan's fingerprints
// (lib/scanChanges.ts, backfilled in 2c-2) — a scan without fingerprints
// is never blanked, so no "what changed" is lost.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseFieldFingerprints } from "@/lib/scanChanges";

export interface ProfileSnapshotsCounts {
  scores: number;
  withSnapshot: number;
  /** Would be (or were) blanked: a snapshot, and fingerprints to stand in for it. */
  blankable: number;
  /** Kept: a snapshot but no fingerprints yet (run scripts/scan-changes-backfill.ts first). */
  missingFingerprints: number;
  blanked: number;
}

export async function cleanProfileSnapshots(db: SupabaseClient, options: { dryRun: boolean }): Promise<ProfileSnapshotsCounts> {
  const counts: ProfileSnapshotsCounts = { scores: 0, withSnapshot: 0, blankable: 0, missingFingerprints: 0, blanked: 0 };
  const due: string[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db.from("scores").select("id, snapshot:profile_snapshot_json, field_fingerprints").order("id").range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(`scores: ${error.message}`);
    for (const r of (data ?? []) as Array<{ id: string; snapshot: unknown; field_fingerprints: unknown }>) {
      counts.scores++;
      if (r.snapshot === null || r.snapshot === undefined) continue;
      counts.withSnapshot++;
      if (!parseFieldFingerprints(r.field_fingerprints)) {
        counts.missingFingerprints++;
        continue;
      }
      counts.blankable++;
      due.push(r.id);
    }
    if ((data ?? []).length < 1000) break;
  }
  if (options.dryRun) return counts;
  for (let i = 0; i < due.length; i += 100) {
    const { error } = await db.from("scores").update({ profile_snapshot_json: null }).in("id", due.slice(i, i + 100));
    if (error) throw new Error(`scores: ${error.message}`);
    counts.blanked += due.slice(i, i + 100).length;
  }
  return counts;
}
