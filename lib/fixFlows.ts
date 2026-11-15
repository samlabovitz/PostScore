// Where each check's built editor is — the "Fix it with PostScore" button
// (components/gbp/FixWithPostScore.tsx) and the weekly report's steps
// point to the same place. Pure.

const PROFILE = (id: string, anchor: string) => `/business/${id}/growth?tab=google-profile#${anchor}`;

/** Where each check's editor is. */
const FLOWS: Record<string, (businessId: string) => string> = {
  "completeness.hours": (id) => PROFILE(id, "edit-hours"),
  "completeness.phone": (id) => PROFILE(id, "edit-phone"),
  "completeness.website_link": (id) => PROFILE(id, "edit-website-link"),
  "visibility.review_replies": (id) => `/business/${id}/website-reviews#google-reviews`,
};

/** The check of these that has an editor, or null. The merged reviews card
 * counts when it stands for review replies. */
export function fixFlowCheck(checkId: string, mergedCheckIds?: string[] | null): string | null {
  return FLOWS[checkId] ? checkId : ((mergedCheckIds ?? []).find((c) => FLOWS[c]) ?? null);
}

/** The editor for this step, or null. */
export function fixFlowHref(businessId: string, checkId: string, mergedCheckIds?: string[] | null): string | null {
  const id = fixFlowCheck(checkId, mergedCheckIds);
  return id ? FLOWS[id](businessId) : null;
}
