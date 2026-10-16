// Pure data logic behind the Reports page's "Score over time" chart
// (components/reports/ScoreHistoryChart.tsx) — no React, no network, so
// every rule the chart shows is testable on its own. Only ever reads
// real saved scans; never interpolates, pads, or guesses a value.

import { DEFAULT_BUSINESS_TIMEZONE, zonedDayKey } from "@/lib/i18n/format";

export type ChartCategoryId = "listing" | "website" | "reviews";

/** Display order for "By category" and the tooltip. */
export const CHART_CATEGORY_IDS: readonly ChartCategoryId[] = ["listing", "website", "reviews"];

/** Category score at one scan: `percent` of that category's own max
 * (what "By category" plots), and the points it contributed to the
 * 0–100 total (`points` of `weight`, what the tooltip shows). */
export interface ChartCategoryScore {
  percent: number;
  points: number;
  weight: number;
}

/** One saved scan, as the chart needs it. */
export interface HistoryScan {
  id: string;
  total: number;
  grade: string;
  createdAt: string;
  /** The SCORING_VERSION saved with this scan, or null when the row
   * doesn't record one — never guessed. */
  scoringVersion: string | null;
  /** null when the saved scan has no category breakdown. */
  categories: Record<ChartCategoryId, ChartCategoryScore> | null;
}

/** The latest scan of one business-local calendar day. */
export interface DayPoint extends HistoryScan {
  dayKey: string;
  /** How many saved scans fell on this day (≥ 1). */
  scansThatDay: number;
}

export type RangeKey = "30d" | "90d" | "1y" | "all";
export const RANGE_KEYS: readonly RangeKey[] = ["30d", "90d", "1y", "all"];
export const DEFAULT_RANGE: RangeKey = "90d";

const RANGE_DAYS: Record<Exclude<RangeKey, "all">, number> = { "30d": 30, "90d": 90, "1y": 365 };

/** The engine's category ids → the chart's plain names. */
const CATEGORY_ID_MAP: Record<string, ChartCategoryId> = {
  completeness: "listing",
  website: "website",
  visibility: "reviews",
};

/** Narrows a saved breakdown_json.categories value to the chart's
 * three categories — null unless all three are present and numeric. */
export function parseChartCategories(raw: unknown): Record<ChartCategoryId, ChartCategoryScore> | null {
  if (!Array.isArray(raw)) return null;
  const out: Partial<Record<ChartCategoryId, ChartCategoryScore>> = {};
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === "string" ? CATEGORY_ID_MAP[e.id] : undefined;
    if (!id) continue;
    if (typeof e.relativeScore !== "number" || !Number.isFinite(e.relativeScore)) continue;
    if (typeof e.weight !== "number" || e.weight <= 0) continue;
    const percent = Math.max(0, Math.min(100, e.relativeScore));
    out[id] = { percent, points: Math.round((percent / 100) * e.weight * 10) / 10, weight: e.weight };
  }
  return CHART_CATEGORY_IDS.every((id) => out[id]) ? (out as Record<ChartCategoryId, ChartCategoryScore>) : null;
}

/** Scans newest-day-last, collapsed to ONE point per business-local
 * calendar day: that day's latest scan. `scans` may be in any order. */
export function dailyPoints(scans: HistoryScan[], timeZone: string = DEFAULT_BUSINESS_TIMEZONE): DayPoint[] {
  const sorted = [...scans].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const byDay = new Map<string, DayPoint>();
  for (const scan of sorted) {
    const dayKey = zonedDayKey(scan.createdAt, timeZone);
    const existing = byDay.get(dayKey);
    byDay.set(dayKey, { ...scan, dayKey, scansThatDay: (existing?.scansThatDay ?? 0) + 1 });
  }
  return Array.from(byDay.values());
}

/** The earliest moment inside `range` (null for "all"). */
export function rangeStart(range: RangeKey, now: Date): number | null {
  if (range === "all") return null;
  return now.getTime() - RANGE_DAYS[range] * 86_400_000;
}

/** Items whose `createdAt` falls inside `range` ending at `now`. */
export function inRange<T extends { createdAt: string }>(items: T[], range: RangeKey, now: Date): T[] {
  const start = rangeStart(range, now);
  if (start === null) return items;
  return items.filter((item) => Date.parse(item.createdAt) >= start);
}

/** Fewer than two days of scans can't draw a line — show the honest
 * empty state instead of a flat line or a lone dot. */
export function hasEnoughForLine(points: DayPoint[]): boolean {
  return points.length >= 2;
}

/** True when `curr`'s saved scoring version differs from `prev`'s. Both
 * must be known — a missing version is never guessed as a change. */
export function versionChangedBetween(prev: HistoryScan | undefined, curr: HistoryScan): boolean {
  return !!prev && prev.scoringVersion !== null && curr.scoringVersion !== null && prev.scoringVersion !== curr.scoringVersion;
}

/** Indexes into `points` where the scoring version changed from the
 * previous point — where the chart draws a "Scoring updated" marker. */
export function versionMarkerIndexes(points: DayPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length; i++) {
    if (versionChangedBetween(points[i - 1], points[i])) out.push(i);
  }
  return out;
}

export interface RangeSummary {
  first: number;
  last: number;
  change: number;
  includesScoringUpdate: boolean;
  best: { total: number; createdAt: string };
  /** Real saved scans in the range (not collapsed per day). */
  scanCount: number;
}

/** The summary row for a range: first → last score of the plotted
 * days, whether a scoring update falls between them, the best day
 * (latest one on a tie), and how many real scans the range holds. */
export function summarizeRange(points: DayPoint[], scansInRange: number): RangeSummary | null {
  if (points.length === 0) return null;
  const first = points[0].total;
  const last = points[points.length - 1].total;
  let best = points[0];
  for (const p of points) if (p.total >= best.total) best = p;
  return {
    first,
    last,
    change: last - first,
    includesScoringUpdate: versionMarkerIndexes(points).length > 0,
    best: { total: best.total, createdAt: best.createdAt },
    scanCount: scansInRange,
  };
}

/** A 0–100 y-axis zoomed to the plotted values with padding, snapped to
 * multiples of 5, at least 20 points tall — so a 70–76 history reads
 * as movement, not a flat line at the top of a 0–100 box. */
export function zoomedDomain(values: number[]): { min: number; max: number; ticks: number[] } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  let min = Math.max(0, Math.floor((lo - 4) / 5) * 5);
  let max = Math.min(100, Math.ceil((hi + 4) / 5) * 5);
  while (max - min < 20) {
    if (min > 0) min -= 5;
    if (max - min < 20 && max < 100) max += 5;
  }
  const step = max - min > 40 ? 10 : 5;
  if (step === 10) {
    // Snap to tens so the top and bottom gridlines both land on a tick.
    min = Math.floor(min / 10) * 10;
    max = Math.ceil(max / 10) * 10;
  }
  const ticks: number[] = [];
  for (let v = min; v <= max; v += step) ticks.push(v);
  return { min, max, ticks };
}

/** One row of the "Scan history" table — newest first, every real
 * scan in the range, with its change from the scan before it (which
 * may sit just outside the range). */
export interface HistoryRow extends HistoryScan {
  changeFromPrevious: number | null;
  scoringUpdated: boolean;
}

export function historyRows(allScans: HistoryScan[], range: RangeKey, now: Date): HistoryRow[] {
  const sorted = [...allScans].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const start = rangeStart(range, now);
  const rows: HistoryRow[] = [];
  sorted.forEach((scan, i) => {
    if (start !== null && Date.parse(scan.createdAt) < start) return;
    const prev = sorted[i - 1];
    rows.push({
      ...scan,
      changeFromPrevious: prev ? scan.total - prev.total : null,
      scoringUpdated: versionChangedBetween(prev, scan),
    });
  });
  return rows.reverse();
}

/** Groups marker positions (in pixels, left to right) whose labels
 * would overlap — any two closer than `minGap` share one label
 * ("Scoring updated ×2"). Returns groups of indexes into `xs`. */
export function groupOverlappingMarkers(xs: number[], minGap: number): number[][] {
  const groups: number[][] = [];
  xs.forEach((x, i) => {
    const current = groups[groups.length - 1];
    if (current && x - xs[current[0]] < minGap) current.push(i);
    else groups.push([i]);
  });
  return groups;
}
