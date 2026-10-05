// Whether a growth move's real-world action ALSO happens to be a check
// the owner can earn real PostScore points for right now — computed
// from the REAL, live action-plan task list (never a static "this move
// id always overlaps" assumption), so the Growth page's growth-move
// badge stays honest even as the plan's real state changes (e.g. once
// a pending-verification check moves off the open-task list, the badge
// reverts on its own, with no extra code needed here).
//
// Deliberately its own module, not inside lib/growthMoves.ts — that
// file documents itself as "kept entirely separate from lib/scoring.ts
// and lib/actionPlan.ts on purpose: a growth move never earns points...
// and never claims to." This module is the one place allowed to know
// about both, so that separation stays true everywhere else.

import type { GrowthMoveId } from "@/lib/growthMoves";

/**
 * The real checkId(s) each growth move's underlying real-world action
 * corresponds to, when any exist. Coupons, referrals, and price checks
 * are never scored at all, so they're always empty — those moves can
 * never overlap the action plan, by construction. Photos and website
 * quality ARE real scored checks, so their real ids are listed here —
 * but appearing here only means "this move COULD overlap"; whether it
 * actually does, right now, for this business, is decided by
 * growthMoveOverlapsActionPlan below against the real, live task list,
 * never assumed from this table alone.
 */
const GROWTH_MOVE_CHECK_IDS: Record<GrowthMoveId, readonly string[]> = {
  start_coupon: [],
  start_referral: [],
  run_price_check: [],
  add_photos_vs_competitors: ["completeness.photos"],
  // Both real checks mergeWebsiteTasks can combine into one merged
  // card (see MERGED_WEBSITE_CHECK_ID in lib/actionPlan.ts) — listed
  // individually here since the merge is a pure display-time transform
  // and a merged task still carries both real ids in its own
  // mergedCheckIds, which the matcher below also checks.
  build_starter_site: ["website.has_website", "completeness.website_link"],
  improve_website: ["website.performance_mobile", "website.contact_conversion"],
};

/** The minimal shape this needs from a real ActionPlanTask — kept as a
 * narrow structural type (not an import of the full ActionPlanTask
 * interface) so this module's only real dependency is lib/growthMoves.ts
 * for GrowthMoveId, never lib/actionPlan.ts itself. */
export interface OverlapCheckableTask {
  checkId: string;
  mergedCheckIds: string[] | null;
}

/**
 * True when `moveId`'s real underlying check is currently an OPEN task
 * in `openTasks` — pass the Growth page's own "This week's plan" +
 * "Bigger projects" lists together (every open, real score-gap task),
 * never a filtered subset. Matches by a task's own `checkId`, or by
 * `mergedCheckIds` for a merged card (e.g. the merged website card uses
 * a synthetic checkId but still lists the real ones it stands in for).
 */
export function growthMoveOverlapsActionPlan(
  moveId: GrowthMoveId,
  openTasks: readonly OverlapCheckableTask[]
): boolean {
  const relatedCheckIds = GROWTH_MOVE_CHECK_IDS[moveId];
  if (relatedCheckIds.length === 0) return false;
  return openTasks.some(
    (task) =>
      relatedCheckIds.includes(task.checkId) ||
      (task.mergedCheckIds?.some((id) => relatedCheckIds.includes(id)) ?? false)
  );
}
