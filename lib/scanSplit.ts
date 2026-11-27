// "Since your last scan" when PostScore changed how it scores between two scans: never hide the owner's real
// changes behind "PostScore updated how it scores". The earlier scan is re-scored under today's rules from its own
// SAVED check results (no Google calls, nothing read from Google), check by check:
//   - every check today's version didn't change keeps its saved points;
//   - a check a version changed is re-scored from what its saved result kept (VERSION_CHANGES' rescore), or, when
//     that result didn't keep what the new rule needs, it's "couldn't be re-scored for the earlier scan" and its
//     whole change counts as PostScore's update (never as the owner's gain or loss).
// Then: "From your changes" = today vs the re-scored earlier scan; "PostScore updated how it scores" = the rest.
// Same version: every check that moved, and the total. A version this file doesn't know: the per-check moves only,
// and it says it couldn't re-score. Pure.

import type { ScoreBreakdown } from "@/lib/scoring";

type Check = { id: string; earnedPoints: number | null; maxPoints: number; meta?: Record<string, string> | null; category?: string };
type Cat = { id: string; weight: number; earnedPoints: number; possiblePoints: number };
type Breakdown = { categories: Cat[]; checks: Check[] };

/** What each scoring version changed, oldest first (lib/scoring.ts SCORING_VERSION's notes). `rescore`: an earlier
 * scan's saved result under this version's rule (null: the saved result doesn't keep what the rule needs). A version
 * that changed how a whole category adds up (`category`) can't be re-scored check by check. */
export const VERSION_CHANGES: Array<{ version: string; checks: string[]; category?: boolean; rescore?: (saved: Check) => Pick<Check, "earnedPoints" | "maxPoints"> | null }> = [
  { version: "1.12.0", checks: [], category: true },
  { version: "1.13.0", checks: [], category: true },
  { version: "1.13.1", checks: [], category: true },
  { version: "1.14.0", checks: ["website.performance_mobile"] },
  { version: "1.15.0", checks: [], category: true },
  { version: "1.16.0", checks: ["website.performance_mobile"] },
  { version: "1.17.0", checks: [], category: true },
  {
    version: "1.18.0",
    checks: ["website.performance_mobile"],
    // The main-content route and real-visitor data are unchanged: a speed result the earlier scan scored stands.
    // Not scored then: the new Speed Index route needs a measurement that scan didn't keep.
    rescore: (saved) => (saved.earnedPoints !== null ? { earnedPoints: saved.earnedPoints, maxPoints: saved.maxPoints } : null),
  },
];

const cmp = (a: string, b: string) => {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

/** The 0–100 total from category points (each category's weight × its share of points it could score). */
export function totalOf(b: Breakdown): number {
  const scored = b.categories.filter((c) => c.possiblePoints > 0);
  const weights = scored.reduce((n, c) => n + c.weight, 0);
  if (weights <= 0) return 0;
  return scored.reduce((n, c) => n + (c.weight / weights) * (c.earnedPoints / c.possiblePoints) * 100, 0);
}

const categoryOf = (b: Breakdown, id: string) => b.checks.find((c) => c.id === id)?.category ?? id.slice(0, id.indexOf("."));

/** `b` with some checks' results swapped, its categories' points moved by the same amounts. */
function withChecks(b: Breakdown, swap: Map<string, Pick<Check, "earnedPoints" | "maxPoints">>): Breakdown {
  const categories = b.categories.map((c) => ({ ...c }));
  const checks = b.checks.map((c) => {
    const to = swap.get(c.id);
    if (!to) return c;
    const cat = categories.find((x) => x.id === categoryOf(b, c.id));
    if (cat) {
      cat.earnedPoints += (to.earnedPoints ?? 0) - (c.earnedPoints ?? 0);
      // A check counts toward what the category could score only when it was scored.
      cat.possiblePoints += (to.earnedPoints !== null ? to.maxPoints : 0) - (c.earnedPoints !== null ? c.maxPoints : 0);
    }
    return { ...c, ...to };
  });
  return { categories, checks };
}

export interface CheckMove {
  id: string;
  from: number | null;
  to: number | null;
  max: number;
}

export type ScanSplit =
  /** Same version: every check that moved, and the total change. */
  | { kind: "same_version"; moves: CheckMove[]; yoursPoints: number }
  /** A scoring update between: the owner's changes (re-scored), the update, and what couldn't be re-scored. */
  | { kind: "split"; moves: CheckMove[]; yoursPoints: number; versionPoints: number; notRescored: string[] }
  /** The earlier scan can't be re-scored under today's rules: the per-check moves only. */
  | { kind: "cant_rescore"; moves: CheckMove[] };

function movesBetween(a: Breakdown, b: Breakdown, skip: Set<string> = new Set()): CheckMove[] {
  const out: CheckMove[] = [];
  for (const c of b.checks) {
    if (skip.has(c.id)) continue;
    const p = a.checks.find((x) => x.id === c.id);
    if (!p) continue;
    if (p.earnedPoints !== c.earnedPoints) out.push({ id: c.id, from: p.earnedPoints, to: c.earnedPoints, max: c.maxPoints });
  }
  return out.sort((x, y) => Math.abs((y.to ?? 0) - (y.from ?? 0)) - Math.abs((x.to ?? 0) - (x.from ?? 0)));
}

const valid = (b: unknown): b is Breakdown => !!b && Array.isArray((b as Breakdown).categories) && Array.isArray((b as Breakdown).checks);

/** The split between two saved scans (`previous` older). `sameVersion`: no scoring update between them. */
export function splitScanChange(previous: { total: number; scoring_version: string | null; breakdown_json: ScoreBreakdown | unknown }, current: { total: number; scoring_version: string | null; breakdown_json: ScoreBreakdown | unknown }, sameVersion: boolean): ScanSplit | null {
  const a = previous.breakdown_json;
  const b = current.breakdown_json;
  if (!valid(a) || !valid(b)) return null;
  if (sameVersion) return { kind: "same_version", moves: movesBetween(a, b), yoursPoints: current.total - previous.total };
  const from = previous.scoring_version;
  const to = current.scoring_version;
  const between = from && to ? VERSION_CHANGES.filter((v) => cmp(v.version, from) > 0 && cmp(v.version, to) <= 0) : [];
  // Unknown versions, a whole-category change, or no versions to explain it: the honest per-check moves only.
  if (!from || !to || between.length === 0 || between.some((v) => v.category) || !VERSION_CHANGES.some((v) => v.version === to)) return { kind: "cant_rescore", moves: movesBetween(a, b) };
  const changed = Array.from(new Set(between.flatMap((v) => v.checks)));
  const rescored = new Map<string, Pick<Check, "earnedPoints" | "maxPoints">>();
  const notRescored: string[] = [];
  for (const id of changed) {
    const saved = a.checks.find((c) => c.id === id);
    const now = b.checks.find((c) => c.id === id);
    if (!saved || !now) continue;
    let value: Pick<Check, "earnedPoints" | "maxPoints"> | null = { earnedPoints: saved.earnedPoints, maxPoints: saved.maxPoints };
    for (const v of between) if (v.checks.includes(id)) value = value && v.rescore ? v.rescore({ ...saved, ...value }) : null;
    if (value) rescored.set(id, value);
    else if (saved.earnedPoints !== now.earnedPoints || saved.maxPoints !== now.maxPoints) notRescored.push(id);
  }
  const earlier = withChecks(a, rescored);
  // Today, with each check that couldn't be re-scored held at the earlier scan's result: that change is the update's.
  const held = withChecks(b, new Map(notRescored.map((id) => [id, a.checks.find((c) => c.id === id)!])));
  const yoursPoints = totalOf(held) - totalOf(earlier);
  const versionPoints = totalOf(b) - totalOf(held) + (totalOf(earlier) - totalOf(a));
  return { kind: "split", moves: movesBetween(earlier, held, new Set(notRescored)), yoursPoints, versionPoints, notRescored };
}

export interface ScoreMove extends CheckMove {
  /** What this check's move did to the 0–100 score (the moves, applied one after another, add up to the change). */
  impact: number;
  /** It moved because of PostScore's scoring update (it wasn't scored on the earlier scan, or couldn't be re-scored). */
  byUpdate: boolean;
}

/** "Gained +3.8" / "Lost −2.9": every check that moved between the two saved scans, each with its effect on the
 * score, gains and losses alike. A check the scoring update started counting is a loss (or gain) like any other,
 * marked `byUpdate`. Null when a scan has no saved checks. */
export function scoreMoves(previous: Parameters<typeof splitScanChange>[0], current: Parameters<typeof splitScanChange>[1], sameVersion: boolean): { moves: ScoreMove[]; gained: number; lost: number; rescored: boolean } | null {
  const a = previous.breakdown_json;
  const b = current.breakdown_json;
  if (!valid(a) || !valid(b)) return null;
  const split = sameVersion ? null : splitScanChange(previous, current, false);
  const updateChecks = new Set(split?.kind === "split" ? split.notRescored : []);
  const versionChecks = new Set(sameVersion ? [] : VERSION_CHANGES.filter((v) => previous.scoring_version && current.scoring_version && cmp(v.version, previous.scoring_version) > 0 && cmp(v.version, current.scoring_version) <= 0).flatMap((v) => v.checks));
  const moved = movesBetween(a, b).sort((x, y) => x.id.localeCompare(y.id));
  let state: Breakdown = a;
  const moves: ScoreMove[] = moved.map((m) => {
    const before = totalOf(state);
    state = withChecks(state, new Map([[m.id, { earnedPoints: m.to, maxPoints: m.max }]]));
    const byUpdate = !sameVersion && (updateChecks.has(m.id) || (versionChecks.has(m.id) && m.from === null));
    return { ...m, impact: totalOf(state) - before, byUpdate };
  });
  moves.sort((x, y) => Math.abs(y.impact) - Math.abs(x.impact));
  const gained = moves.filter((m) => m.impact > 0).reduce((n, m) => n + m.impact, 0);
  const lost = moves.filter((m) => m.impact < 0).reduce((n, m) => n + m.impact, 0);
  return { moves, gained, lost, rescored: sameVersion || split?.kind === "split" };
}
