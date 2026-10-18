// The Overview's numbers, each traced to real saved data — pure, so every
// label on the page is testable. Nothing here invents a value: when the
// data isn't there, the result says so ("none", null) and the UI shows
// an honest empty state instead.

import { checkOutcome } from "@/components/scoring/CategoryCard";
import type { ActionPlanTask, WebsiteBanner } from "@/lib/actionPlan";
import type { ProfileSnapshot } from "@/lib/profileChanges";
import { resolveLinkTarget, type LinkOptions } from "@/lib/postaiLinks";
import type { CategoryResult } from "@/lib/scoring";
import type { MessageKey } from "@/lib/i18n";

/** A category's real contribution to the 0–100 total — its own 0–100
 * score scaled to its weight (40 / 30 / 30), so the three tiles add up
 * to the total. null when nothing in the category could be checked. */
export function weightedCategoryPoints(category: Pick<CategoryResult, "relativeScore" | "weight">): number | null {
  if (category.relativeScore === null) return null;
  return Math.round(((category.relativeScore * category.weight) / 100) * 10) / 10;
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
  | { kind: "delta"; delta: number };

/** Change since the previous saved scan (history is newest first). */
export function scoreChangeSinceLastScan(history: { total: number; scoring_version: string }[]): ScoreChange {
  if (history.length < 2) return { kind: "first" };
  const [current, previous] = history;
  if (current.scoring_version !== previous.scoring_version) return { kind: "scoring_updated" };
  return { kind: "delta", delta: current.total - previous.total };
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

/** Points on the 0–100 total. High: one fix worth 5+ points; Medium: 2+.
 * Smaller items show their points with no priority pill. */
export const HIGH_PRIORITY_POINTS = 5;
export const MEDIUM_PRIORITY_POINTS = 2;
export const TOP_RECOMMENDATIONS = 3;

export type Priority = "high" | "medium";

export function recommendationPriority(points: number): Priority | null {
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
 * Growth page's website summary, biggest real gain first. Items already
 * marked done (waiting for a re-scan) and setup steps (no points) are left
 * out. */
export function topRecommendations(
  tasks: ActionPlanTask[],
  websiteBanner: WebsiteBanner | null,
  businessId: string,
  options: LinkOptions = {},
  limit: number = TOP_RECOMMENDATIONS
): Recommendation[] {
  const items: Recommendation[] = tasks
    .filter((task) => task.status === "open" && task.effort !== "setup" && task.weightedPoints > 0)
    .map((task) => {
      const link = linkForCheck(task.checkId, businessId, options);
      return {
        key: task.checkId,
        source: { kind: "task" as const, task },
        points: task.weightedPoints,
        pointsHigh: task.weightedPointsHigh,
        priority: recommendationPriority(task.weightedPoints),
        href: link.href,
        linkLabel: link.label,
      };
    });
  if (websiteBanner) {
    const points = websiteBanner.kind === "improve" ? websiteBanner.points : websiteBanner.low;
    if (points > 0) {
      const target = resolveLinkTarget(websiteBanner.kind === "improve" ? "website" : "website.starter_site", businessId, options);
      items.push({
        key: "website",
        source: { kind: "website", banner: websiteBanner },
        points,
        pointsHigh: websiteBanner.kind === "get_website" ? websiteBanner.high : null,
        priority: recommendationPriority(points),
        href: target?.href ?? `/business/${businessId}/website`,
        linkLabel: target?.label ?? "dashboard.assistant.link.website",
      });
    }
  }
  return items.sort((a, b) => b.points - a.points).slice(0, limit);
}
