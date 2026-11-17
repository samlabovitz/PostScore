// Server-only. Day 23 2c-4: weekly snapshots saved before stop keeping
// Google's rating and review count, and their changes are recomputed from
// our own change records (lib/scanChanges.ts) across the week's two scans —
// the same rule new snapshots follow: an exact number of new reviews only
// from Business Profile, never a rating amount. The one deliberate update
// to these otherwise insert-only rows (admin client; owners can't).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reviewCountChangeOf, ratingChangedOf } from "@/lib/scanChanges";
import { scanChangesBetweenScores } from "@/lib/scanChanges.server";

interface Row {
  id: string;
  business_id: string;
  scan_id: string;
  compared_scan_id: string | null;
  review_count: number | null;
  rating: number | string | null;
  review_count_change: number | null;
  rating_change: number | string | null;
  listing_changes: string[];
}

export interface WeeklySnapshotsCounts {
  rows: number;
  /** Rows that held Google's rating or review count. */
  withGoogleValues: number;
  /** Rows whose review / rating change or changed fields differ once recomputed. */
  changesRecomputed: number;
  /** Rows written (live). */
  updated: number;
}

export async function cleanWeeklySnapshots(db: SupabaseClient, options: { dryRun: boolean }): Promise<WeeklySnapshotsCounts> {
  const { data, error } = await db.from("weekly_snapshots").select("id, business_id, scan_id, compared_scan_id, review_count, rating, review_count_change, rating_change, listing_changes").order("week_start");
  if (error) throw new Error(`weekly_snapshots: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const counts: WeeklySnapshotsCounts = { rows: rows.length, withGoogleValues: 0, changesRecomputed: 0, updated: 0 };
  for (const r of rows) {
    const patch: Record<string, unknown> = {};
    if (r.review_count !== null || r.rating !== null) {
      counts.withGoogleValues++;
      patch.review_count = null;
      patch.rating = null;
    }
    if (r.compared_scan_id) {
      const summary = await scanChangesBetweenScores(db, r.business_id, r.compared_scan_id, r.scan_id);
      const reviews = reviewCountChangeOf(summary);
      const rating = ratingChangedOf(summary);
      const next = {
        review_count_change: reviews?.kind === "exact" ? reviews.delta : reviews?.kind === "none" ? 0 : null,
        rating_change: rating === false ? 0 : null,
        listing_changes: summary.available ? summary.records.map((x) => x.field) : r.listing_changes,
      };
      const before = { review_count_change: r.review_count_change, rating_change: r.rating_change === null ? null : Number(r.rating_change), listing_changes: r.listing_changes };
      if (JSON.stringify(next) !== JSON.stringify(before)) {
        counts.changesRecomputed++;
        Object.assign(patch, next);
      }
    }
    if (Object.keys(patch).length === 0 || options.dryRun) continue;
    const { error: e } = await db.from("weekly_snapshots").update(patch).eq("id", r.id);
    if (e) throw new Error(`weekly_snapshots: ${e.message}`);
    counts.updated++;
  }
  return counts;
}
