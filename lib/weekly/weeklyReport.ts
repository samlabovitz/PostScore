// The weekly recap: what one Monday–Sunday week (business time zone)
// shows, built only from saved scans — never a fabricated comparison.
//
// - The week's scan is its LAST scan. It's compared with the last earlier
//   scan on the same scoring version: before the week ("Compared with
//   Oct 9"), else earlier in the week ("this week's first scan"). One scan
//   and nothing before it: no comparison at all.
// - A week with no scan says so ("No new scan this week") and shows the
//   last known score — never "no change".
// - Scores of different scoring versions are never subtracted.
// Pure: shared by the Reports card, the weekly PDF, the weekly snapshots
// and the "Since your last visit" pop-up.

import { CHART_CATEGORY_IDS, type ChartCategoryId, type ChartCategoryScore } from "@/lib/scoreHistory";
import { diffProfileSnapshots, type ProfileChange, type ProfileSnapshot } from "@/lib/profileChanges";
import type { Locale } from "@/lib/i18n";
import { weekBounds, weekEndDay, weekOf } from "./weeks";

export interface WeeklyScan {
  id: string;
  total: number;
  grade: string;
  createdAt: string;
  scoringVersion: string | null;
  categories: Record<ChartCategoryId, ChartCategoryScore> | null;
  profile: ProfileSnapshot | null;
}

export interface CategoryMove {
  id: ChartCategoryId;
  /** Category score 0–100 (rounded), or null when not recorded. */
  before: number | null;
  after: number | null;
}

export interface ScanComparison {
  from: WeeklyScan;
  to: WeeklyScan;
  /** Same scoring version — only then is `delta` a number. */
  comparable: boolean;
  delta: number | null;
  categories: CategoryMove[];
  reviews: { count: number | null; countChange: number | null; rating: number | null; ratingChange: number | null };
  listingChanges: ProfileChange[];
  /** Either scan predates listing snapshots: changes honestly unknown. */
  changesUnavailable: boolean;
}

/** Two saved scans compared — the one rule every weekly view uses. */
export function compareScans(from: WeeklyScan, to: WeeklyScan, locale: Locale): ScanComparison {
  const comparable = from.scoringVersion === to.scoringVersion;
  const pct = (s: WeeklyScan, id: ChartCategoryId) => (s.categories?.[id] ? Math.round(s.categories[id].percent) : null);
  const count = to.profile?.reviewCount ?? null;
  const prevCount = from.profile?.reviewCount ?? null;
  const rating = to.profile?.rating ?? null;
  const prevRating = from.profile?.rating ?? null;
  return {
    from,
    to,
    comparable,
    delta: comparable ? to.total - from.total : null,
    categories: CHART_CATEGORY_IDS.map((id) => ({ id, before: comparable ? pct(from, id) : null, after: pct(to, id) })),
    reviews: {
      count,
      countChange: count !== null && prevCount !== null ? count - prevCount : null,
      rating,
      ratingChange: rating !== null && prevRating !== null ? Math.round((rating - prevRating) * 10) / 10 : null,
    },
    listingChanges: from.profile && to.profile ? diffProfileSnapshots(from.profile, to.profile, locale) : [],
    changesUnavailable: !(from.profile && to.profile),
  };
}

export interface WeekSummary {
  weekStart: string;
  /** The week's Sunday. */
  weekEnd: string;
  scanCount: number;
  /** The week's last scan; null when the week has none. */
  current: WeeklyScan | null;
  /** The last scan before the week (or, in a first week, the week's first
   * scan) — what `current` is compared with. */
  compared: WeeklyScan | null;
  comparedInWeek: boolean;
  comparison: ScanComparison | null;
  /** No scan this week: the last scan before it (for the hero score). */
  lastKnown: WeeklyScan | null;
  /** Totals of up to the last 8 scans up to the week's end, oldest first. */
  sparkline: number[];
}

/** `scans`: every saved scan, oldest first. */
export function buildWeekSummary(weekStart: string, scans: WeeklyScan[], timeZone: string, locale: Locale): WeekSummary {
  const { start, end } = weekBounds(weekStart, timeZone);
  const inWeek = scans.filter((s) => {
    const t = Date.parse(s.createdAt);
    return t >= start.getTime() && t < end.getTime();
  });
  const before = scans.filter((s) => Date.parse(s.createdAt) < start.getTime());
  const current = inWeek.at(-1) ?? null;
  // Like with like: the last earlier scan on the same scoring version —
  // before the week first, else earlier in the week. Only when there's
  // none does a different-version scan stand in (then nothing is
  // subtracted; the card says scoring was updated).
  const sameVersion = (s: WeeklyScan) => current !== null && s.scoringVersion === current.scoringVersion;
  const earlierInWeek = inWeek.slice(0, -1);
  let compared: WeeklyScan | null = before.filter(sameVersion).at(-1) ?? null;
  let comparedInWeek = false;
  if (!compared) {
    const inWeekSame = earlierInWeek.find(sameVersion);
    if (inWeekSame) {
      compared = inWeekSame;
      comparedInWeek = true;
    } else {
      compared = before.at(-1) ?? earlierInWeek[0] ?? null;
      comparedInWeek = !before.at(-1) && !!earlierInWeek[0];
    }
  }
  const upToEnd = scans.filter((s) => Date.parse(s.createdAt) < end.getTime());
  return {
    weekStart,
    weekEnd: weekEndDay(weekStart),
    scanCount: inWeek.length,
    current,
    compared: current ? compared : null,
    comparedInWeek,
    comparison: current && compared ? compareScans(compared, current, locale) : null,
    lastKnown: current ? null : before.at(-1) ?? null,
    sparkline: upToEnd.slice(-8).map((s) => s.total),
  };
}

/** The weeks the picker offers: this week first, then every past week
 * that has a scan (newest first). */
export function pickerWeeks(scans: WeeklyScan[], now: Date, timeZone: string): string[] {
  const thisWeek = weekOf(now.toISOString(), timeZone);
  const past = Array.from(new Set(scans.map((s) => weekOf(s.createdAt, timeZone)))).filter((w) => w < thisWeek);
  return [thisWeek, ...past.sort((a, b) => b.localeCompare(a))];
}
