// "Re-check my website": how many website-only re-checks a business has
// left today, and what one changed. Pure.
//
// - 3 per business per calendar day in the business's own time zone,
//   separate from the 1 full re-scan a day (lib/rescanPolicy.ts). A
//   re-check is PageSpeed + Safe Browsing + the site read — no Google
//   Places call.
// - A re-check is saved as a normal scan (scores row) whose breakdown
//   carries scanKind "website_recheck", so history, reports and rank all
//   read it like any scan, while the full re-scan limit ignores it.

import { checkLabelKey, type CheckResult, type ScoreBreakdown } from "@/lib/scoring";
import { zonedDayKey } from "@/lib/i18n/format";

export const WEBSITE_RECHECKS_PER_DAY = 3;
export const WEBSITE_RECHECK_KIND = "website_recheck" as const;

export interface WebsiteRecheckAvailability {
  used: number;
  left: number;
  allowed: boolean;
}

/** `recheckDates`: when this business's recent website re-checks ran. */
export function websiteRecheckAvailability(recheckDates: string[], now: Date, timeZone: string): WebsiteRecheckAvailability {
  const today = zonedDayKey(now.toISOString(), timeZone);
  const used = recheckDates.filter((d) => zonedDayKey(d, timeZone) === today).length;
  const left = Math.max(0, WEBSITE_RECHECKS_PER_DAY - used);
  return { used, left, allowed: left > 0 };
}

/** Is this saved scan a full scan (the one the 1-a-day limit counts)? */
export function isFullScan(breakdown: Pick<ScoreBreakdown, "scanKind"> | null | undefined): boolean {
  return breakdown?.scanKind !== WEBSITE_RECHECK_KIND;
}

export type CheckStatus = "done" | "needs_work" | "couldnt_check";

export function checkStatus(check: Pick<CheckResult, "confidence" | "earnedPoints" | "maxPoints">): CheckStatus {
  const determinable = check.confidence === "VERIFIED" || check.confidence === "LIKELY";
  if (!determinable || check.earnedPoints === null) return "couldnt_check";
  return check.earnedPoints >= check.maxPoints ? "done" : "needs_work";
}

export interface WebsiteCheckChange {
  checkId: string;
  labelKey: ReturnType<typeof checkLabelKey>;
  label: string;
  from: CheckStatus;
  to: CheckStatus;
  /** Point change, whole and signed (0 when only "couldn't check" moved). */
  points: number;
}

/** Website checks whose status or points changed between two scans,
 * biggest change first. */
export function websiteCheckChanges(before: ScoreBreakdown | null, after: ScoreBreakdown): WebsiteCheckChange[] {
  if (!before) return [];
  const changes: WebsiteCheckChange[] = [];
  for (const check of after.checks) {
    if (!check.id.startsWith("website.")) continue;
    const prev = before.checks.find((c) => c.id === check.id);
    if (!prev) continue;
    const from = checkStatus(prev);
    const to = checkStatus(check);
    const points = Math.round((check.earnedPoints ?? 0) - (prev.earnedPoints ?? 0));
    const pointsMoved = from !== "couldnt_check" && to !== "couldnt_check" && points !== 0;
    if (from === to && !pointsMoved) continue;
    changes.push({ checkId: check.id, labelKey: checkLabelKey(check.id), label: check.label, from, to, points: from === "couldnt_check" || to === "couldnt_check" ? 0 : points });
  }
  return changes.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
}

/** The website category's 0–100 score in a breakdown, or null. */
export function websiteScoreOf(breakdown: ScoreBreakdown | null): number | null {
  const cat = breakdown?.categories.find((c) => c.id === "website");
  return cat?.relativeScore === null || cat?.relativeScore === undefined ? null : Math.round(cat.relativeScore);
}
