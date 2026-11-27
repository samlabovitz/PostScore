// Day 23 2d-1: pages show the SAVED score — the latest scan's total,
// grade, category points and each check's points (our own results in
// scores.breakdown_json) — instead of re-scoring Google's saved listing
// values. The saved breakdown keeps no words (lib/breakdownStorage.ts),
// so labels and explanations come from the breakdown built now. Day 23
// 2d-4: "now" is built from Google's live values, so a Google-side check
// that reads differently now than its saved points is marked — the page
// shows the saved result with "Changed on Google since your last scan".
// Pure.

import type { CategoryResult, CheckResult, ScoreBreakdown } from "@/lib/scoring";

export interface SavedScoreRow {
  id: string;
  total: number;
  grade: string;
  scoring_version: string | null;
  breakdown_json: unknown;
}

/** The scores columns withSavedScore reads (latest row first). */
export const SAVED_SCORE_COLUMNS = "id, total, grade, scoring_version, breakdown_json";

function isBreakdown(b: unknown): b is ScoreBreakdown {
  const x = b as Partial<ScoreBreakdown> | null;
  return !!x && typeof x === "object" && Array.isArray(x.categories) && Array.isArray(x.checks);
}

function sameChecks(a: CheckResult[], b: CheckResult[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((c) => c.id));
  return b.every((c) => ids.has(c.id));
}

/**
 * The checks scored from Google's listing (rating, reviews, phone, hours,
 * photos, …, and whether the listing links a website). The rest are our
 * own website results, re-checked only by a scan, so their saved points
 * always go with today's words.
 */
export function isGoogleSideCheck(id: string): boolean {
  return id.startsWith("visibility.") || id.startsWith("completeness.") || id === "website.has_website";
}

/** Google reads differently now than when the saved points were scored. */
function readsDifferently(now: CheckResult, saved: CheckResult): boolean {
  return now.earnedPoints !== saved.earnedPoints || now.confidence !== saved.confidence || now.maxPoints !== saved.maxPoints;
}

/** One check: the saved points and flags, today's words. The meta keys
 * a saved check no longer keeps (quoted counts) come from now. A
 * Google-side check that reads differently now is marked `liveDiffers`. */
function savedCheck(now: CheckResult, saved: CheckResult, liveUnavailable: boolean): CheckResult {
  const differs = isGoogleSideCheck(now.id) && (liveUnavailable || readsDifferently(now, saved));
  return {
    ...now,
    ...(differs ? { liveDiffers: liveUnavailable ? ("unavailable" as const) : ("changed" as const) } : {}),
    maxPoints: saved.maxPoints,
    earnedPoints: saved.earnedPoints,
    confidence: saved.confidence,
    ...("gaps" in saved ? { gaps: saved.gaps } : {}),
    meta: saved.meta || now.meta ? { ...(now.meta ?? {}), ...(saved.meta ?? {}) } : null,
  };
}

/**
 * The breakdown a page shows: `now`'s words on the saved scan's points.
 * Null when the saved scan can't stand in for it — no saved scan, a
 * different scoring version, or a different set of checks — and the
 * caller saves a new scan first (syncScoreSnapshot).
 */
export function withSavedScore(now: ScoreBreakdown, saved: SavedScoreRow | null, options: { liveUnavailable?: boolean } = {}): ScoreBreakdown | null {
  if (!saved || !isBreakdown(saved.breakdown_json)) return null;
  const s = saved.breakdown_json;
  if (!savedVersionStandsIn(saved.scoring_version ?? s.scoringVersion ?? null, now) || !sameChecks(now.checks, s.checks)) return null;
  const savedById = new Map(s.checks.map((c) => [c.id, c]));
  const check = (c: CheckResult) => savedCheck(c, savedById.get(c.id)!, options.liveUnavailable === true);
  const savedCategory = new Map(s.categories.map((c) => [c.id, c]));
  const categories: CategoryResult[] = now.categories.map((c) => {
    const sc = savedCategory.get(c.id);
    return {
      ...c,
      ...(sc ? { weight: sc.weight, possiblePoints: sc.possiblePoints, earnedPoints: sc.earnedPoints, relativeScore: sc.relativeScore, partlyChecked: sc.partlyChecked === true ? true : undefined } : {}),
      checks: c.checks.map(check),
    };
  });
  return { ...now, total: saved.total, grade: saved.grade as ScoreBreakdown["grade"], categories, checks: now.checks.map(check) };
}

/**
 * Scoring versions whose rules a business's saved scan can still stand in
 * for, when the newer rules don't change that business. v1.16.0 only adds
 * the speed rule ("one test so far"): a 1.15.0 scan stands until the next
 * real scan — unless the rule applies to it (those were re-scored as
 * "PostScore updated how it scores", Day 23). v1.17.0 only adds the
 * partly-checked Website cap: 1.16.0 and 1.15.0 scans stand unless the cap
 * applies (or, for a 1.15.0 scan, the speed rule). v1.18.0 only adds the
 * Speed Index stand-in: earlier scans stand unless it's in use.
 */
const oneTestSoFar = (now: ScoreBreakdown) => now.checks.some((c) => c.meta?.noScoreCause === "one_test");
const usesSpeedIndex = (now: ScoreBreakdown) => now.checks.some((c) => c.meta?.speedMetric === "speed_index");
const websitePartlyChecked = (now: ScoreBreakdown) => now.categories.some((c) => c.id === "website" && c.partlyChecked === true);
const STANDS_IN_FOR: Record<string, { versions: string[]; unless: (now: ScoreBreakdown, savedVersion: string) => boolean }> = {
  "1.16.0": { versions: ["1.15.0"], unless: (now) => oneTestSoFar(now) },
  "1.17.0": { versions: ["1.16.0", "1.15.0"], unless: (now, saved) => websitePartlyChecked(now) || (saved === "1.15.0" && oneTestSoFar(now)) },
  // v1.18.0 only adds Speed Index when the main content can't be measured — a value saved by scans from this
  // version on, so older scans stand until the next real scan (no re-score needed).
  "1.18.0": { versions: ["1.17.0", "1.16.0", "1.15.0"], unless: (now, saved) => usesSpeedIndex(now) || (saved !== "1.17.0" && (websitePartlyChecked(now) || (saved === "1.15.0" && oneTestSoFar(now)))) },
};

/** Whether a saved scan of `savedVersion` can stand in for `now`'s version. */
export function savedVersionStandsIn(savedVersion: string | null, now: ScoreBreakdown): boolean {
  if (savedVersion === now.scoringVersion) return true;
  const rule = STANDS_IN_FOR[now.scoringVersion];
  return !!savedVersion && !!rule && rule.versions.includes(savedVersion) && !rule.unless(now, savedVersion);
}

/** The same total, grade and scoring version as the saved scan — what
 * syncScoreSnapshot itself compares before saving a new scan. */
export function sameTotal(now: ScoreBreakdown, saved: SavedScoreRow): boolean {
  return saved.total === now.total && saved.grade === now.grade && (saved.scoring_version ?? null) === now.scoringVersion;
}

/** Whether the saved scan shows the same score, check by check, as `now`. */
export function savedScoreMatches(now: ScoreBreakdown, shown: ScoreBreakdown | null): shown is ScoreBreakdown {
  return !!shown && shown.total === now.total && shown.grade === now.grade && shown.checks.every((c, i) => c.earnedPoints === now.checks[i].earnedPoints);
}
