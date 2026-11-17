// Day 23 2d-1: pages show the SAVED score — the latest scan's total,
// grade, category points and each check's points (our own results in
// scores.breakdown_json) — instead of re-scoring Google's saved listing
// values. The saved breakdown keeps no words (lib/breakdownStorage.ts),
// so labels and explanations come from the breakdown built now. Pure.

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

/** One check: the saved points and flags, today's words. The meta keys
 * a saved check no longer keeps (quoted counts) come from now. */
function savedCheck(now: CheckResult, saved: CheckResult): CheckResult {
  return {
    ...now,
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
export function withSavedScore(now: ScoreBreakdown, saved: SavedScoreRow | null): ScoreBreakdown | null {
  if (!saved || !isBreakdown(saved.breakdown_json)) return null;
  const s = saved.breakdown_json;
  if ((saved.scoring_version ?? s.scoringVersion) !== now.scoringVersion || !sameChecks(now.checks, s.checks)) return null;
  const savedById = new Map(s.checks.map((c) => [c.id, c]));
  const check = (c: CheckResult) => savedCheck(c, savedById.get(c.id)!);
  const savedCategory = new Map(s.categories.map((c) => [c.id, c]));
  const categories: CategoryResult[] = now.categories.map((c) => {
    const sc = savedCategory.get(c.id);
    return {
      ...c,
      ...(sc ? { weight: sc.weight, possiblePoints: sc.possiblePoints, earnedPoints: sc.earnedPoints, relativeScore: sc.relativeScore } : {}),
      checks: c.checks.map(check),
    };
  });
  return { ...now, total: saved.total, grade: saved.grade as ScoreBreakdown["grade"], categories, checks: now.checks.map(check) };
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
