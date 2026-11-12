// The Overview's numbers, each traced to real saved data — pure, so every
// label on the page is testable. Nothing here invents a value: when the
// data isn't there, the result says so ("none", null) and the UI shows
// an honest empty state instead.

import { isScoringUpdate } from "@/lib/websiteRecheckPolicy";
import { checkOutcome } from "@/components/scoring/CategoryCard";
import type { ActionPlanTask, WebsiteBanner } from "@/lib/actionPlan";
import type { ProfileSnapshot } from "@/lib/profileChanges";
import { resolveLinkTarget, type LinkOptions } from "@/lib/postaiLinks";
import type { CategoryResult, Suggestion } from "@/lib/scoring";
import { t, type Locale, type MessageKey } from "@/lib/i18n";
import { urgentIssueForCheck, type UrgentIssue } from "@/lib/urgency";

/** A category's real contribution to the 0–100 total — its own 0–100
 * score scaled to its weight (40 / 30 / 30), so the three tiles add up
 * to the total. null when nothing in the category could be checked. */
export function weightedCategoryPoints(category: Pick<CategoryResult, "relativeScore" | "weight">): number | null {
  if (category.relativeScore === null) return null;
  return Math.round(((category.relativeScore * category.weight) / 100) * 10) / 10;
}

export { wholeCategoryPoints } from "@/lib/categoryPoints";

/** Shares of the category's full points (every check's max): earned,
 * missing, and couldn't-check (only when some points couldn't be checked).
 * Exported for tests. */
export function categoryBarShares(category: Pick<CategoryResult, "checks" | "earnedPoints" | "possiblePoints">) {
  const max = category.checks.reduce((sum, c) => sum + c.maxPoints, 0);
  if (max <= 0) return { earned: 0, missing: 0, unchecked: 0 };
  const earned = Math.max(0, Math.min(1, category.earnedPoints / max));
  const unchecked = Math.max(0, Math.min(1 - earned, (max - category.possiblePoints) / max));
  return { earned, missing: Math.max(0, 1 - earned - unchecked), unchecked };
}

/** Done / needs work / couldn't check, per the same rule the check rows use. */
export function categoryOutcomeCounts(category: Pick<CategoryResult, "checks">): { done: number; needsWork: number; couldntCheck: number } {
  let done = 0;
  let needsWork = 0;
  let couldntCheck = 0;
  for (const check of category.checks) {
    const outcome = checkOutcome(check);
    if (outcome === "couldnt_check") couldntCheck++;
    else if (outcome === "needs_work") needsWork++;
    else done++;
  }
  return { done, needsWork, couldntCheck };
}

export type ScoreChange =
  | { kind: "first" }
  /** The two scans were scored by different PostScore versions — a
   * point-for-point delta would be misleading. */
  | { kind: "scoring_updated" }
  /** `google`: the change came from connecting Google (its real +/−). */
  | { kind: "delta"; delta: number; google?: boolean };

/** Change since the previous saved scan (history is newest first). */
export function scoreChangeSinceLastScan(history: { total: number; scoring_version: string; scan_kind?: string | null }[]): ScoreChange {
  if (history.length < 2) return { kind: "first" };
  const [current, previous] = history;
  if (isScoringUpdate(previous.scoring_version, current.scoring_version, current.scan_kind)) return { kind: "scoring_updated" };
  return { kind: "delta", delta: current.total - previous.total, ...(current.scan_kind === "google_connected" ? { google: true } : {}) };
}

/** New Google reviews between the two latest saved scans — only when
 * both scans recorded a review count (older scans predate the listing
 * snapshot and are never guessed as "no change"). */
export function reviewCountChange(
  snapshots: { profile_snapshot_json: ProfileSnapshot | null }[]
): number | null {
  if (snapshots.length < 2) return null;
  const now = snapshots[0].profile_snapshot_json?.reviewCount;
  const before = snapshots[1].profile_snapshot_json?.reviewCount;
  if (typeof now !== "number" || typeof before !== "number") return null;
  return now - before;
}

// ---------------------------------------------------------------------------
// Top recommendations
// ---------------------------------------------------------------------------

/** Urgent: customers are hitting a problem right now (lib/urgency.ts) —
 * whatever its points. Otherwise points on the 0–100 total: High, one fix
 * worth 5+ points; Medium, 2+. Smaller items show their points with no
 * priority pill. */
export const HIGH_PRIORITY_POINTS = 5;
export const MEDIUM_PRIORITY_POINTS = 2;
export const TOP_RECOMMENDATIONS = 3;

export type Priority = "urgent" | "high" | "medium";

export function recommendationPriority(points: number, urgent = false): Priority | null {
  if (urgent) return "urgent";
  if (points >= HIGH_PRIORITY_POINTS) return "high";
  if (points >= MEDIUM_PRIORITY_POINTS) return "medium";
  return null;
}

/** The scoring check id → PostAI's link-target id (lib/postaiLinks.ts). */
export function postaiTargetForCheck(checkId: string): string {
  const [category, rest] = [checkId.slice(0, checkId.indexOf(".")), checkId.slice(checkId.indexOf(".") + 1)];
  if (category === "visibility") return `reviews.${rest}`;
  if (category === "completeness") return `listing.${rest}`;
  if (checkId === "website.starter_site_merged") return "website.starter_site";
  if (checkId === "website.info_consistency") return "listing.mismatch";
  if (category === "website") return checkId;
  return "growth";
}

export interface Recommendation {
  key: string;
  /** A real action-plan task, or the Growth page's website summary. */
  source: { kind: "task"; task: ActionPlanTask } | { kind: "website"; banner: WebsiteBanner };
  /** The real weighted gain on the 0–100 total (low end of a range). */
  points: number;
  pointsHigh: number | null;
  priority: Priority | null;
  href: string;
  /** The PostAI hotlink wording, or null for a link back to the Overview's
   * own check row (the UI says "See this check"). */
  linkLabel: MessageKey | null;
  /** The owner marked it done; its points count once a scan confirms it. */
  pending: boolean;
  /** Customers are hitting it right now (lib/urgency.ts): listed first. */
  urgent: boolean;
}

/** Where a check is fixed — the same link PostAI and the Overview use.
 * label null = a check row on the Overview itself ("See this check"). */
export function taskFixLink(checkId: string, businessId: string, options: LinkOptions): { href: string; label: MessageKey | null } {
  return linkForCheck(checkId, businessId, options);
}

function linkForCheck(checkId: string, businessId: string, options: LinkOptions): { href: string; label: MessageKey | null } {
  const target =
    resolveLinkTarget(postaiTargetForCheck(checkId), businessId, options) ??
    // A merged card (e.g. the reviews card) has a synthetic id — fall back
    // to its category's page, then to Growth.
    resolveLinkTarget(checkId.startsWith("visibility") || checkId.startsWith("reviews") ? "reviews" : checkId.startsWith("website") ? "website" : "growth", businessId, options);
  if (!target) return { href: `/business/${businessId}/growth`, label: "dashboard.assistant.link.growth" };
  const onOverview = target.href.startsWith(`/business/${businessId}#`);
  return { href: target.href, label: onOverview ? null : target.label };
}

/** The action plan's own open items (the same list as Growth), plus the
 * Growth page's website summary: urgent first, then biggest real gain.
 * Items marked done stay (flagged pending) until a re-scan confirms them,
 * after every open one; setup steps (no points) are left out.
 * `urgentIssues`: for the website summary (a task carries its own `urgent`). */
export function topRecommendations(
  tasks: ActionPlanTask[],
  websiteBanner: WebsiteBanner | null,
  businessId: string,
  options: LinkOptions = {},
  limit: number = TOP_RECOMMENDATIONS,
  urgentIssues: readonly UrgentIssue[] = []
): Recommendation[] {
  const items: Recommendation[] = tasks
    // "Marked done" items stay until a scan confirms them: their points
    // aren't earned yet (they're still in the projected score).
    .filter((task) => (task.status === "open" || task.status === "pending_verification") && task.effort !== "setup" && task.weightedPoints > 0)
    .map((task) => {
      const link = linkForCheck(task.checkId, businessId, options);
      const urgent = task.urgent === true;
      return {
        key: task.checkId,
        source: { kind: "task" as const, task },
        points: task.weightedPoints,
        pointsHigh: task.weightedPointsHigh,
        priority: recommendationPriority(task.weightedPoints, urgent),
        href: link.href,
        linkLabel: link.label,
        pending: task.status === "pending_verification",
        urgent,
      };
    });
  if (websiteBanner) {
    const points = websiteBanner.kind === "improve" ? websiteBanner.points : websiteBanner.low;
    if (points > 0) {
      const target = resolveLinkTarget(websiteBanner.kind === "improve" ? "website" : "website.starter_site", businessId, options);
      // The site is down or flagged unsafe: the website summary is where it's fixed.
      const urgent = urgentIssueForCheck("website", urgentIssues) !== null;
      items.push({
        key: "website",
        source: { kind: "website", banner: websiteBanner },
        points,
        pointsHigh: websiteBanner.kind === "get_website" ? websiteBanner.high : null,
        priority: recommendationPriority(points, urgent),
        href: target?.href ?? `/business/${businessId}/website`,
        linkLabel: target?.label ?? "dashboard.assistant.link.website",
        pending: false,
        urgent,
      });
    }
  }
  // Open items first — urgent ones first, then biggest first — then
  // marked-done ones, so items waiting for a scan never push out what the
  // owner still has to do.
  return items.sort((a, b) => Number(a.pending) - Number(b.pending) || Number(b.urgent) - Number(a.urgent) || b.points - a.points).slice(0, limit);
}

/** The monthly report's next steps: open items only — never something the
 * owner already marked done (it's waiting for a scan) — at most 3. */
export function reportNextSteps(recs: Recommendation[], limit = 3): Recommendation[] {
  return recs.filter((r) => !r.pending).slice(0, limit);
}

/** The score card's "Biggest boost": points only — the OPEN recommendation
 * worth the most points, never picked by urgency (a marked-done one only
 * when nothing is open: the real Hair Express case, every item marked
 * done, Biggest boost +9 · Review count, Top recommendations "Nothing
 * open"). Pass the full list, not the top 3 — urgent items can fill
 * those. Without recommendations (Free hides them), the biggest
 * suggestion. */
export function biggestBoostFrom(
  recommendations: Recommendation[] | null,
  suggestions: Suggestion[],
  locale: Locale
): { label: string; promisedPoints: number; weightedPoints: number } | null {
  const open = (recommendations ?? []).filter((r) => !r.pending);
  // Most points first; ties keep the list's order.
  const top = open.reduce<Recommendation | undefined>((best, r) => (!best || r.points > best.points ? r : best), undefined) ?? recommendations?.[0];
  if (top) {
    const label =
      top.source.kind === "task"
        ? top.source.task.label
        : t(locale, top.source.banner.kind === "improve" ? "dashboard.overview.recs.improveWebsite" : "dashboard.growth.websiteBanner.getWebsite.title");
    const points = top.pointsHigh ?? top.points;
    return { label, promisedPoints: points, weightedPoints: points };
  }
  if (recommendations) return null;
  const s = suggestions[0];
  return s ? { label: s.label, promisedPoints: s.promisedPoints, weightedPoints: s.weightedPoints ?? s.promisedPoints } : null;
}
