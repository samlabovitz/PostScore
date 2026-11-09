// "Urgent": customers hit a dead end or wrong information RIGHT NOW. It
// decides the ORDER of recommendations everywhere (Top recommendations,
// Biggest boost, the Growth weekly plan, PostAI, the monthly report's next
// steps) and the Overview's red alert — never points. Exactly these, and
// nothing else:
//   - the Google listing's website link is parked, broken or a dead page
//   - the phone number on Google doesn't match the website
//   - the website is down, or flagged unsafe by Google Safe Browsing
//   - no phone number, or no hours, on the Google listing
// Every surface asks this one module, so they always agree. Pure.

import type { ActionPlanTask } from "@/lib/actionPlan";
import type { BusinessScoringInput, ScoreBreakdown } from "@/lib/scoring";
import { keyForInfoConflict } from "@/lib/websiteTrust";

export type UrgentIssue = "listing_link" | "phone_mismatch" | "site_down" | "site_unsafe" | "no_phone" | "no_hours";

/** The order the Overview's alert lists them in: dead ends first. */
export const URGENT_ISSUES: readonly UrgentIssue[] = ["listing_link", "site_down", "site_unsafe", "phone_mismatch", "no_phone", "no_hours"];

/** The scoring checks (action-plan task ids) each issue is fixed by. */
const CHECKS_FOR_ISSUE: Record<UrgentIssue, readonly string[]> = {
  // has_website too: with no verified site, its "listing parked/broken" gap is the same dead link.
  listing_link: ["completeness.website_link", "website.has_website"],
  phone_mismatch: ["website.info_consistency"],
  site_down: [],
  site_unsafe: ["website.security"],
  no_phone: ["completeness.phone"],
  no_hours: ["completeness.hours"],
};

type Check = Pick<ScoreBreakdown["checks"][number], "id" | "earnedPoints" | "maxPoints">;

function check(checks: readonly Check[], id: string): Check | undefined {
  return checks.find((c) => c.id === id);
}

/**
 * What's urgent for this business now, from the same saved data and the
 * same scored checks as the score. `hasListing` false (a website-only
 * business): nothing about a Google listing is urgent.
 */
export function urgentIssues(
  input: Pick<BusinessScoringInput, "website" | "phone" | "openingHours" | "httpsStatus" | "websiteAnalysis" | "websiteTrustOverrides">,
  breakdown: { checks: readonly Check[] },
  options: { hasListing?: boolean } = {}
): UrgentIssue[] {
  const hasListing = options.hasListing !== false;
  const trust = input.websiteAnalysis?.websiteTrust ?? null;
  const issues = new Set<UrgentIssue>();

  // The listing's own link: a parked page, a 404/410, a dead page — the
  // website_link check scores 0 for exactly that.
  const link = check(breakdown.checks, "completeness.website_link");
  if (hasListing && trust?.listingLinkBroken && !!input.website?.trim() && link && link.earnedPoints === 0) issues.add("listing_link");

  // A real phone conflict the scored mismatch check counts (the page was
  // readable, and the owner hasn't said it's fine).
  const consistency = check(breakdown.checks, "website.info_consistency");
  const overridden = new Set((input.websiteTrustOverrides ?? []).map((o) => o.key));
  const phoneConflict = (trust?.infoConflicts ?? []).some((f) => f.field === "phone" && f.comparison === "conflicts" && !overridden.has(keyForInfoConflict(f)));
  if (hasListing && phoneConflict && consistency && consistency.earnedPoints !== null && consistency.earnedPoints < consistency.maxPoints) issues.add("phone_mismatch");

  // Down: no answer at all — never a timeout, a block of automated checks,
  // or an HTTP error page (those prove nothing about what people see).
  if (input.httpsStatus === "unreachable" && input.websiteAnalysis?.httpsUnreachableReason === "down") issues.add("site_down");

  // Google Safe Browsing flagged it (spam signals alone aren't a dead end).
  if (trust?.safeBrowsingThreat?.threatFound) issues.add("site_unsafe");

  const phone = check(breakdown.checks, "completeness.phone");
  if (hasListing && phone && phone.earnedPoints === 0) issues.add("no_phone");
  const hours = check(breakdown.checks, "completeness.hours");
  if (hasListing && hours && hours.earnedPoints === 0) issues.add("no_hours");

  return URGENT_ISSUES.filter((i) => issues.has(i));
}

/** The urgent issue an action-plan task (or the Growth page's website
 * summary, id "website") fixes, or null. */
export function urgentIssueForCheck(checkId: string, issues: readonly UrgentIssue[]): UrgentIssue | null {
  if (checkId === "website") return issues.find((i) => i === "site_down" || i === "site_unsafe") ?? null;
  return issues.find((i) => CHECKS_FOR_ISSUE[i].includes(checkId)) ?? null;
}

/** A task is urgent when it — or any check merged into it — fixes an urgent issue. */
export function isUrgentTask(task: Pick<ActionPlanTask, "checkId" | "mergedCheckIds">, issues: readonly UrgentIssue[]): boolean {
  return [task.checkId, ...(task.mergedCheckIds ?? [])].some((id) => urgentIssueForCheck(id, issues) !== null);
}

/** The check ids urgent right now — for pinning in the weekly plan. */
export function urgentCheckIds(issues: readonly UrgentIssue[]): string[] {
  return issues.flatMap((i) => CHECKS_FOR_ISSUE[i]);
}

/** Urgent first, the rest after, each group keeping its own order
 * (points, as today). Marks each task's `urgent`. */
export function orderByUrgency<T extends Pick<ActionPlanTask, "checkId" | "mergedCheckIds">>(tasks: T[], issues: readonly UrgentIssue[]): Array<T & { urgent: boolean }> {
  const marked = tasks.map((task) => ({ ...task, urgent: isUrgentTask(task, issues) }));
  return [...marked.filter((t) => t.urgent), ...marked.filter((t) => !t.urgent)];
}
