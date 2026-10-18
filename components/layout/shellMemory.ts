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

