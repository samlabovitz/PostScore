// Day 25B step 3: Presence → Fix plan (docs/plans/day25a-spec.md §2b,
// mockup 07). Every score fix in one ranked list — Urgent → High → Medium →
// Low, most points first within a level (lib/overviewTiles.ts rankFixes) —
// each with "+N pts" and the running score down the list, from the saved
// scan's total. The top card: "This week: 78 → 87" (the "This week" fixes)
// and "When every fix is done: 100 · A" (the Overview's projection). The
// weekly "+14 within reach" cap is gone: the rows are the action plan's own
// tasks at their real points (lib/actionPlan.ts), never apportioned. Pure.

import { GOOGLE_MISMATCH_CHECK_ID, type ActionPlanTask, type FixWhen, type WebsiteBanner } from "@/lib/actionPlan";
import { fixPriority, isHighByRule, isReviewGrowthRow, rankFixes, type FixPriority } from "@/lib/overviewTiles";
import type { CheckResult, ScoreBreakdown } from "@/lib/scoring";

export type FixPlanRow =
  | { kind: "task"; key: string; task: ActionPlanTask; points: number; upTo: boolean; when: FixWhen; priority: FixPriority; running: number }
  | { kind: "website"; key: "website"; banner: Extract<WebsiteBanner, { kind: "improve" }>; points: number; upTo: false; when: FixWhen; priority: FixPriority; running: number };

export interface FixPlan {
  rows: FixPlanRow[];
  /** The saved scan's score. */
  today: number;
  /** today + every "This week" fix not yet confirmed, rounded ("78 → 87"). */
  thisWeek: number;
  thisWeekCount: number;
  /** Every "This week" fix is marked done (or there are none), while the list isn't empty. */
  thisWeekDone: boolean;
  /** The most urgent fix left that isn't "This week" (for "Next: …"). */
  next: FixPlanRow | null;
  /** "Website speed: not scored yet" — no button, no points in the list. */
  speed: { explanation: string; upTo: number } | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The speed check left out of the score (one test so far, or no reading). */
export function speedNotScored(breakdown: Pick<ScoreBreakdown, "checks">): { explanation: string; upTo: number } | null {
  const check: CheckResult | undefined = breakdown.checks.find((c) => c.id === "website.performance_mobile");
  const hasSite = breakdown.checks.find((c) => c.id === "website.has_website")?.earnedPoints !== 0;
  if (!check || !hasSite || check.earnedPoints !== null) return null;
  return { explanation: check.explanation, upTo: check.maxPoints };
}

export function buildFixPlan(input: {
  /** getActionPlan's `tasks`: every open (or marked-done, not yet confirmed) score fix. */
  tasks: ActionPlanTask[];
  websiteBanner: WebsiteBanner | null;
  breakdown: Pick<ScoreBreakdown, "total" | "checks">;
}): FixPlan {
  const today = input.breakdown.total;
  type Item = (FixPlanRow extends infer R ? (R extends FixPlanRow ? Omit<R, "running" | "priority"> : never) : never) & { urgent: boolean };
  const items: Item[] = [];
  const high = (i: Item) => i.kind === "task" && isHighByRule(i.task);
  for (const task of input.tasks) {
    if (task.effort === "setup" || task.weightedPoints <= 0) continue;
    items.push({ kind: "task", key: task.checkId, task, points: task.weightedPoints, upTo: task.upTo === true, when: task.when ?? "weeks", urgent: task.urgent === true });
  }
  // The other website checks, as on the Growth recap: one row to the Website page.
  if (input.websiteBanner?.kind === "improve" && input.websiteBanner.points > 0) {
    items.push({ kind: "website", key: "website", banner: input.websiteBanner, points: input.websiteBanner.points, upTo: false, when: "weeks", urgent: false });
  }
  // Marked-done fixes keep their place (their points aren't confirmed yet).
  const ranked = rankFixes(items, (i) => ({ points: i.points, urgent: i.urgent, when: i.when, reviewGrowth: i.kind === "task" && isReviewGrowthRow(i.task), checkId: i.key, high: high(i) }));
  let sum = 0;
  const rows = ranked.map((full) => {
    const { urgent, ...item } = full;
    sum += item.points;
    return { ...item, priority: fixPriority(item.points, urgent, item.when, high(full)), running: Math.min(100, Math.round(today + round1(sum))) } as FixPlanRow;
  });
  const weekRows = rows.filter((r) => r.when === "this_week");
  const pending = (r: FixPlanRow) => r.kind === "task" && r.task.status === "pending_verification";
  const thisWeekPoints = weekRows.reduce((a, r) => a + r.points, 0);
  const openWeek = weekRows.filter((r) => !pending(r));
  const rest = rows.filter((r) => r.when !== "this_week" && !pending(r));
  return {
    rows,
    today,
    thisWeek: Math.min(100, Math.round(today + round1(thisWeekPoints))),
    thisWeekCount: weekRows.length,
    thisWeekDone: openWeek.length === 0 && rows.length > 0,
    next: rest[0] ?? null,
    speed: speedNotScored(input.breakdown),
  };
}

/**
 * The Website page's one-line summary (spec §2b): "Fix this 1 and your
 * Website goes 29 → 29.6 pts (score 78 → 79)". The fixes are the Website
 * checks losing points (the banner's) plus the Google-mismatch check;
 * the points are their real effect on the total. Null: nothing to fix.
 */
export function websiteFixSummary(input: {
  breakdown: Pick<ScoreBreakdown, "total" | "categories">;
  websiteBanner: WebsiteBanner | null;
  /** getActionPlan's tasks (the Google-mismatch task is one of them when open). */
  tasks: ActionPlanTask[];
}): { count: number; from: number; to: number; score: number; after: number } | null {
  const website = input.breakdown.categories.find((c) => c.id === "website");
  if (!website || website.relativeScore === null) return null;
  const mismatch = input.tasks.find((t) => t.checkId === GOOGLE_MISMATCH_CHECK_ID && t.weightedPoints > 0);
  const banner = input.websiteBanner?.kind === "improve" ? input.websiteBanner : null;
  const count = (banner?.improvements ?? 0) + (mismatch ? 1 : 0);
  if (count === 0) return null;
  const points = (banner?.points ?? 0) + (mismatch?.weightedPoints ?? 0);
  const from = round1((website.relativeScore * website.weight) / 100);
  return { count, from, to: Math.min(website.weight, round1(from + points)), score: input.breakdown.total, after: Math.min(100, Math.round(input.breakdown.total + round1(points))) };
}
