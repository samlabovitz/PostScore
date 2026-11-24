// The business the dashboard shell last showed, kept in the browser's
// memory only (never stored), so a page's loading skeleton can keep the
// same sidebar, name and language while the next page loads — no flash of
// placeholders. Unknown (e.g. a hard reload) → the skeleton shows a blank
// name area rather than a wrong one.

import type { BusinessSummary } from "@/app/actions/businesses";

let last: BusinessSummary | null = null;

export function rememberShellBusiness(business: BusinessSummary | null): void {
  if (business) last = business;
}

export function shellBusinessFor(id: string | undefined): BusinessSummary | null {
  return id && last?.id === id ? last : null;
}


// Day 25B step 4: the sidebar tab open last, for the shared pages (Reports,
// Settings, Connect Google, PostStudio) — memory only, never stored.
let lastTab: "presence" | "growth" = "presence";

export function rememberNavTab(tab: "presence" | "growth"): void {
  lastTab = tab;
}

export function lastNavTab(): "presence" | "growth" {
  return lastTab;
}

// Reports was opened in this browser session: the "New" dot stays off
// (the layout's value is from before the open). Memory only.
const reportsSeen = new Set<string>();

export function markReportsSeen(businessId: string): void {
  reportsSeen.add(businessId);
}

export function reportsSeenFor(businessId: string): boolean {
  return reportsSeen.has(businessId);
}
