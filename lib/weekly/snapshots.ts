// Weekly snapshots (supabase/weekly-snapshots.sql): one small row of
// numbers per business per finished week, so past weekly reports stay
// exactly as they were even if scoring changes later. No PDFs or images
// are stored — a past report's PDF is drawn from its row on demand.
//
// Created lazily — on the next visit or Reports view after the week ends
// (business time zone) — from scans already saved: no cron, no Google or
// PageSpeed call. Weeks without a scan get no row. A row is never
// updated once written (insert-only, unique per business + week). Pure.

import type { ChartCategoryId } from "@/lib/scoreHistory";
import type { ProfileChange } from "@/lib/profileChanges";
import { isWeekOver, weekOf } from "./weeks";
import type { WeekSummary } from "./weeklyReport";

export interface WeeklySnapshotRow {
  business_id: string;
  /** Monday, "YYYY-MM-DD", business time zone. */
  week_start: string;
  scan_id: string;
  compared_scan_id: string | null;
  scan_count: number;
  score: number;
  grade: string;
  prev_score: number | null;
  scoring_version: string | null;
  prev_scoring_version: string | null;
  /** [before, after] category score 0–100 per category. */
  categories: Partial<Record<ChartCategoryId, [number | null, number | null]>>;
  rank: number | null;
  rank_of: number | null;
  prev_rank: number | null;
  fixes_confirmed: number;
  review_count: number | null;
  rating: number | null;
  review_count_change: number | null;
  rating_change: number | null;
  /** Which listing fields changed (descriptions are rebuilt from the scans). */
  listing_changes: ProfileChange["field"][];
}

/** Finished weeks with at least one scan and no snapshot yet, oldest
 * first. The week in progress is never frozen. */
export function weeksNeedingSnapshots(scanDates: string[], existing: ReadonlySet<string>, now: Date, timeZone: string): string[] {
  const weeks = new Set(scanDates.map((d) => weekOf(d, timeZone)));
  return Array.from(weeks)
    .filter((w) => !existing.has(w) && isWeekOver(w, now, timeZone))
    .sort();
}

export function snapshotFromWeek(
  businessId: string,
  week: WeekSummary,
  extras: { rank: number | null; rankOf: number | null; prevRank: number | null; fixesConfirmed: number }
): WeeklySnapshotRow | null {
  const current = week.current;
  if (!current) return null;
  const c = week.comparison;
  const categories: WeeklySnapshotRow["categories"] = {};
  if (c) for (const m of c.categories) categories[m.id] = [m.before, m.after];
  else if (current.categories) for (const [id, v] of Object.entries(current.categories)) categories[id as ChartCategoryId] = [null, Math.round(v.percent)];
  return {
    business_id: businessId,
    week_start: week.weekStart,
    scan_id: current.id,
    compared_scan_id: c ? c.from.id : null,
    scan_count: week.scanCount,
    score: current.total,
    grade: current.grade,
    prev_score: c ? c.from.total : null,
    scoring_version: current.scoringVersion,
    prev_scoring_version: c ? c.from.scoringVersion : null,
    categories,
    rank: extras.rank,
    rank_of: extras.rankOf,
    prev_rank: extras.prevRank,
    fixes_confirmed: extras.fixesConfirmed,
    review_count: c ? c.reviews.count : current.profile?.reviewCount ?? null,
    rating: c ? c.reviews.rating : current.profile?.rating ?? null,
    review_count_change: c ? c.reviews.countChange : null,
    rating_change: c ? c.reviews.ratingChange : null,
    listing_changes: c ? c.listingChanges.map((x) => x.field) : [],
  };
}

/** The score change a snapshot can honestly show (same scoring version only). */
export function snapshotDelta(row: Pick<WeeklySnapshotRow, "score" | "prev_score" | "scoring_version" | "prev_scoring_version">): number | null {
  if (row.prev_score === null || row.scoring_version !== row.prev_scoring_version) return null;
  return row.score - row.prev_score;
}

export const SNAPSHOT_COLUMNS =
  "business_id, week_start, scan_id, compared_scan_id, scan_count, score, grade, prev_score, scoring_version, prev_scoring_version, categories, rank, rank_of, prev_rank, fixes_confirmed, review_count, rating, review_count_change, rating_change, listing_changes";

/** Groups past reports by month ("2026-10"), newest first. */
export function groupByMonth<T extends { week_start: string }>(rows: T[]): Array<{ month: string; rows: T[] }> {
  const sorted = [...rows].sort((a, b) => b.week_start.localeCompare(a.week_start));
  const groups: Array<{ month: string; rows: T[] }> = [];
  for (const row of sorted) {
    const month = row.week_start.slice(0, 7);
    const last = groups.at(-1);
    if (last && last.month === month) last.rows.push(row);
    else groups.push({ month, rows: [row] });
  }
  return groups;
}
