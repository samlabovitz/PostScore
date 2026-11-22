// Day 23B: the ONE place a fix happens, for every button that points to it
// — the Overview score breakdown, "Top recommendations", the Growth recap
// steps and the details-mismatch tasks. One button per item, always the
// same destination:
//   - Premium with the Google Profile tab (connected or practice): the tab,
//     that row's editor open (#edit-…) — "PostScore can do this for you"
//     when Google writes are allowed (GOOGLE_WRITES_LIVE_PLACES), else the
//     verb (the editor opens read-only and says so).
//   - Otherwise a Google-listing item → its Growth recap step with "How to
//     fix it" open and "Open on Google ↗"; an hours mismatch with the
//     website → the Website page's fix steps ("or update it on Google").
//   - Website items → the Website page, that check. Reviews → Reviews.
// Pure.

import { fixPlanHref, getReviewsHref, googleListingHref, reviewsHref } from "@/lib/routes";

export interface FixContext {
  businessId: string;
  /** Premium or Multi. */
  premium: boolean;
  connected: boolean;
  practice: boolean;
  /** Google writes allowed for this place (practice, or GOOGLE_WRITES_LIVE_PLACES). */
  canEdit: boolean;
}

export interface FixItem {
  checkId: string;
  mergedCheckIds?: string[] | null;
  /** Customer details: the scored parts still missing. */
  missingParts?: string[];
  /** The Google-vs-website mismatch is about the hours. */
  hoursMismatch?: boolean;
}

export type FixDestination = {
  /** "do_it": PostScore makes the change (preview → approve → undo). */
  kind: "do_it" | "steps";
  /** dashboard.breakdown.action.<key>, or dashboard.fix.doItForYou for "do_it". */
  key: string;
  params?: Record<string, string>;
  href: string;
};

/** The Google Profile tab row each listing check's editor opens. */
const EDITOR_HASH: Record<string, string> = {
  "completeness.hours": "edit-hours",
  "completeness.phone": "edit-phone",
  "completeness.website_link": "edit-website-link",
  "completeness.customer_details": "edit-customer-details",
  "completeness.photos": "edit-photos",
};

/** Listing checks PostScore has no editor for: the tab's row (Premium) or the steps. */
const ROW_HASH: Record<string, string> = {
  "completeness.categories": "listing-category",
  "completeness.address": "listing",
  "completeness.business_status": "listing",
};

/** Premium's Google Profile tab is open to this business. */
export function hasGoogleTab(ctx: FixContext): boolean {
  return ctx.premium && (ctx.connected || ctx.practice);
}

/** PostScore can make this kind of change for this business now. */
export function canDoForYou(ctx: FixContext): boolean {
  return hasGoogleTab(ctx) && (ctx.practice || ctx.canEdit);
}

/** Premium (connected, writes on) does this fix for you in one click — hours,
 * phone, website link, customer details, photos, review replies and the hours
 * compare. Grow and Free show "Premium does this for you in one click →". */
export function premiumDoesInOneClick(item: FixItem): boolean {
  return fixDestination(item, { businessId: "x", premium: true, connected: true, practice: false, canEdit: true }).kind === "do_it";
}

/** "?from=score": the destination shows "← Back to your score". */
export function withFromScore(href: string): string {
  const [path, hash] = href.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}from=score${hash ? `#${hash}` : ""}`;
}

const stepId = (checkId: string) => `task-${checkId.replace(/\./g, "-")}`;

export function fixDestination(item: FixItem, ctx: FixContext): FixDestination {
  const base = `/business/${ctx.businessId}`;
  const tab = (hash: string) => googleListingHref(ctx.businessId, { hash });
  // The step-by-step: the Growth recap step, "How to fix it" open.
  const steps = (checkId: string) => fixPlanHref(ctx.businessId, { query: { open: "howto" }, hash: stepId(checkId) });
  const doIt = canDoForYou(ctx);
  const id = item.checkId;

  if (id === "visibility.review_replies" || (item.mergedCheckIds ?? []).includes("visibility.review_replies")) {
    // Premium + connected: the replies go out from PostScore's inbox.
    return { kind: doIt ? "do_it" : "steps", key: doIt ? "doItForYou" : "replyReviews", href: reviewsHref(ctx.businessId, { hash: "google-reviews" }) };
  }
  if (id.startsWith("visibility.") || id.startsWith("reviews")) return { kind: "steps", key: "moreReviews", href: getReviewsHref(ctx.businessId, { hash: "review-link" }) };

  if (EDITOR_HASH[id]) {
    const key =
      id === "completeness.customer_details"
        ? (item.missingParts ?? []).length
          ? "addParts"
          : "addDetails"
        : ({ "completeness.hours": "setHours", "completeness.phone": "addPhone", "completeness.website_link": "fixWebsiteLink", "completeness.photos": "addPhotos" } as Record<string, string>)[id];
    const params = id === "completeness.customer_details" && (item.missingParts ?? []).length ? { parts: item.missingParts!.join("|") } : undefined;
    if (doIt) return { kind: "do_it", key: "doItForYou", href: tab(EDITOR_HASH[id]) };
    // On the tab without writes for this place: the editor opens read-only and says so.
    if (hasGoogleTab(ctx)) return { kind: "steps", key, params, href: tab(EDITOR_HASH[id]) };
    return { kind: "steps", key, params, href: steps(id) };
  }
  if (ROW_HASH[id]) {
    const key = id === "completeness.categories" ? "chooseCategory" : "fixOnGoogle";
    return { kind: "steps", key, href: hasGoogleTab(ctx) ? tab(ROW_HASH[id]) : steps(id) };
  }
  if (id === "website.info_consistency") {
    if (item.hoursMismatch && doIt) return { kind: "do_it", key: "doItForYou", href: tab("compare-hours") };
    if (item.hoursMismatch && hasGoogleTab(ctx)) return { kind: "steps", key: "compareHours", href: tab("compare-hours") };
    return { kind: "steps", key: item.hoursMismatch ? "compareHours" : "fixWebsite", href: `${base}/website#check-info_consistency` };
  }
  if (id.startsWith("website.")) return { kind: "steps", key: "fixWebsite", href: `${base}/website#check-${id.slice("website.".length)}` };
  // Anything else: its Growth recap step.
  return { kind: "steps", key: "fixIt", href: steps(id) };
}
