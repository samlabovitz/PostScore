// The Overview score breakdown: ONE button per check that's missing points,
// labelled with a verb, taking the owner to where it's fixed (the Google
// Profile tab's editor when the business has it, the Reviews or Website
// page, or the check's own fix page). The "How to fix it" steps live on the
// destination, never in the breakdown. Pure.

export interface BreakdownAction {
  /** dashboard.breakdown.action.<key> */
  key: string;
  params?: Record<string, string>;
  href: string;
}

export interface BreakdownActionInput {
  businessId: string;
  checkId: string;
  /** The Google Profile tab is open to this business (Premium, connected or practice). */
  googleTab: boolean;
  /** The check's existing fix page (ScoreBreakdownPanel's fixLinks), if any. */
  fixHref?: string | null;
  /** Customer details: the scored parts still missing ("parking", "accessibility"…). */
  missingParts?: string[];
  /** The website check's explanation mentions the hours (the hours mismatch). */
  hoursMismatch?: boolean;
}

export function breakdownAction(i: BreakdownActionInput): BreakdownAction | null {
  const base = `/business/${i.businessId}`;
  const tab = (hash: string) => `${base}/growth?tab=google${hash}`;
  const orFix = (hash: string) => (i.googleTab ? tab(hash) : (i.fixHref ?? tab(hash)));
  switch (i.checkId) {
    case "visibility.review_replies":
      return { key: "replyReviews", href: `${base}/website-reviews#google-reviews` };
    case "visibility.review_count":
    case "visibility.review_recency":
    case "visibility.rating":
      return { key: "moreReviews", href: i.fixHref ?? `${base}/website-reviews#review-link` };
    case "completeness.customer_details": {
      const parts = (i.missingParts ?? []).filter(Boolean);
      return { key: parts.length ? "addParts" : "addDetails", params: parts.length ? { parts: parts.join("|") } : undefined, href: orFix("#edit-customer-details") };
    }
    case "completeness.photos":
      return { key: "addPhotos", href: orFix("#edit-photos") };
    case "completeness.hours":
      return { key: "setHours", href: orFix("#edit-hours") };
    case "completeness.phone":
      return { key: "addPhone", href: orFix("#edit-phone") };
    case "completeness.website_link":
      return { key: "fixWebsiteLink", href: orFix("#edit-website-link") };
    case "completeness.categories":
      return { key: "chooseCategory", href: i.fixHref ?? tab("#listing-category") };
    case "completeness.address":
    case "completeness.business_status":
      return { key: "fixOnGoogle", href: i.fixHref ?? tab("#listing") };
    case "website.info_consistency":
      if (i.hoursMismatch && i.googleTab) return { key: "compareHours", href: tab("#compare-hours") };
      return { key: "fixWebsite", href: `${base}/website#check-info_consistency` };
  }
  if (i.checkId.startsWith("website.")) return { key: "fixWebsite", href: `${base}/website#check-${i.checkId.slice("website.".length)}` };
  return i.fixHref ? { key: "fixIt", href: i.fixHref } : null;
}
