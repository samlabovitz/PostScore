// Day 25B step 4 (spec §1): the sidebar's Reports "New" dot — the newest
// monthly report is ready and this owner hasn't opened Reports since.
// Never on Free (no monthly report). While MONTHLY_REPORTS_LIVE isn't
// "true" (testing mode), only test reports count, and only under `next
// dev` — never shown to owners. Pure.

import type { Plan } from "@/lib/plan";

export function reportDotVisible(input: {
  plan: Plan;
  /** isMonthlyReportsLive() */
  live: boolean;
  /** NODE_ENV === "development" */
  dev: boolean;
  /** The newest report: a real one when live, else a test run that included this business. */
  newestAt: string | null;
  /** When this owner last opened Reports for this business (report_opens). */
  openedAt: string | null;
}): boolean {
  if (input.plan === "free" || !input.newestAt) return false;
  if (!input.live && !input.dev) return false;
  return !input.openedAt || Date.parse(input.newestAt) > Date.parse(input.openedAt);
}
