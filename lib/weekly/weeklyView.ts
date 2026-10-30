// One week as the Reports card and the weekly PDF show it — built either
// live from scans (the week in progress, or a finished week whose
// snapshot table isn't set up yet) or from its frozen snapshot. Plain,
// serializable data. Pure.

import type { ChartCategoryId } from "@/lib/scoreHistory";
import { CHART_CATEGORY_IDS } from "@/lib/scoreHistory";
import { snapshotDelta, type WeeklySnapshotRow } from "./snapshots";
import type { WeekSummary } from "./weeklyReport";
import { MIN_RANKED_COMPETITORS, type HeadToHead } from "@/lib/competitorComparison";

export interface WeeklyView {
  weekStart: string;
  weekEnd: string;
  isCurrentWeek: boolean;
  /** From a frozen snapshot (a finished week). */
  frozen: boolean;
  /** The scoring version the week was scored with, when it differs from
   * today's (old frozen weeks): "Scored with v1.11". */
  olderScoringVersion: string | null;
  scanCount: number;
  /** The week's score; null when the week has no scan. */
  score: number | null;
  grade: string | null;
  /** No scan this week: the last known score and when. */
  lastKnown: { score: number; date: string } | null;
  /** What the score is compared with (null: nothing to compare). */
  change: { delta: number | null; comparable: boolean; comparedDate: string; comparedInWeek: boolean; fromScore: number } | null;
  categories: Array<{ id: ChartCategoryId; before: number | null; after: number | null }>;
  rank: { rank: number; of: number; previous: number | null } | null;
  /** Only 1–2 competitors: shown instead of a rank (lib/competitorComparison.ts). */
  headToHead: HeadToHead | null;
  listingChanges: string[];
  changesUnavailable: boolean;
  fixesConfirmed: number;
  reviews: { count: number | null; countChange: number | null; rating: number | null; ratingChange: number | null };
  sparkline: number[];
}

export interface WeekExtras {
  rank: { rank: number; of: number; previous: number | null } | null;
  headToHead?: HeadToHead | null;
  fixesConfirmed: number;
  isCurrentWeek: boolean;
}

export function weeklyViewFromSummary(week: WeekSummary, extras: WeekExtras): WeeklyView {
  const c = week.comparison;
  const cur = week.current;
  // No scan this week: show where things stood at the last scan (no change).
  const shown = cur ?? week.lastKnown;
  return {
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    isCurrentWeek: extras.isCurrentWeek,
    frozen: false,
    olderScoringVersion: null,
    scanCount: week.scanCount,
    score: cur?.total ?? null,
    grade: cur?.grade ?? null,
    lastKnown: week.lastKnown ? { score: week.lastKnown.total, date: week.lastKnown.createdAt } : null,
    change: c ? { delta: c.delta, comparable: c.comparable, comparedDate: c.from.createdAt, comparedInWeek: week.comparedInWeek, fromScore: c.from.total } : null,
    categories: c
      ? c.categories
      : CHART_CATEGORY_IDS.map((id) => ({ id, before: null, after: shown?.categories?.[id] ? Math.round(shown.categories[id].percent) : null })),
    rank: extras.rank,
    headToHead: extras.headToHead ?? null,
    listingChanges: c ? c.listingChanges.map((x) => x.description) : [],
    changesUnavailable: c ? c.changesUnavailable : false,
    fixesConfirmed: extras.fixesConfirmed,
    reviews: c ? c.reviews : { count: shown?.profile?.reviewCount ?? null, countChange: null, rating: shown?.profile?.rating ?? null, ratingChange: null },
    sparkline: week.sparkline,
  };
}

/** A finished week from its frozen numbers. `live` supplies only what the
 * row deliberately doesn't store: the listing-change sentences (rebuilt
 * from the same two saved scans), the compared scan's date and the
 * sparkline (both from saved scans, which never change). */
export function weeklyViewFromSnapshot(row: WeeklySnapshotRow, live: WeekSummary, currentScoringVersion: string): WeeklyView {
  const delta = snapshotDelta(row);
  const comparedDate = live.comparison && live.comparison.from.id === row.compared_scan_id ? live.comparison.from.createdAt : null;
  const descriptions = live.comparison && live.comparison.from.id === row.compared_scan_id ? live.comparison.listingChanges.map((x) => x.description) : [];
  return {
    weekStart: row.week_start,
    weekEnd: live.weekEnd,
    isCurrentWeek: false,
    frozen: true,
    olderScoringVersion: row.scoring_version && row.scoring_version !== currentScoringVersion ? row.scoring_version : null,
    scanCount: row.scan_count,
    score: row.score,
    grade: row.grade,
    lastKnown: null,
    change:
      row.prev_score !== null && comparedDate
        ? { delta, comparable: delta !== null, comparedDate, comparedInWeek: live.comparedInWeek, fromScore: row.prev_score }
        : null,
    categories: CHART_CATEGORY_IDS.map((id) => ({ id, before: row.categories[id]?.[0] ?? null, after: row.categories[id]?.[1] ?? null })),
    rank: snapshotRank(row),
    headToHead: null,
    listingChanges: descriptions,
    changesUnavailable: row.compared_scan_id !== null && live.comparison?.changesUnavailable === true,
    fixesConfirmed: row.fixes_confirmed,
    reviews: { count: row.review_count, countChange: row.review_count_change, rating: row.rating === null ? null : Number(row.rating), ratingChange: row.rating_change === null ? null : Number(row.rating_change) },
    sparkline: live.sparkline,
  };
}

/** A frozen week's rank — none when it was a head-to-head (1–2
 * competitors; weeks frozen before that rule may still hold "#1 of 2"). */
export function snapshotRank(row: Pick<WeeklySnapshotRow, "rank" | "rank_of" | "prev_rank">): { rank: number; of: number; previous: number | null } | null {
  if (row.rank === null || row.rank_of === null || row.rank_of - 1 < MIN_RANKED_COMPETITORS) return null;
  return { rank: row.rank, of: row.rank_of, previous: row.prev_rank };
}
