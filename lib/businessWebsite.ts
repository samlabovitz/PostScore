// The one shared answer to "what is this business's real website?"
// (Step 2d) — the Google listing's own URL when it has one, otherwise a
// real site verified elsewhere (businesses.verified_website_url; the real
// Bánh Mì Boy case). Every place that decides "has a website" or picks a
// URL to scan/screenshot reads this, never `website` alone. Code that is
// specifically about the Google LISTING (completeness.website_link,
// listing-change diffs, resolveListingWebsite) keeps reading `website`.
//
// A social page (Facebook, Instagram, Yelp, …) in the listing's website
// field is never the website — for owners and competitors alike — so it's
// never scanned or screenshotted as one (socialPagePlatform).

import { socialPagePlatform } from "@/lib/websiteTrust";

export interface BusinessWebsiteSource {
  website?: string | null;
  verified_website_url?: string | null;
}

function clean(url: string | null | undefined): string | null {
  return typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
}

/** A real website address — not empty, not a social/profile page. */
function realSite(url: string | null | undefined): string | null {
  const c = clean(url);
  return c && socialPagePlatform(c) === null ? c : null;
}

/** The social platform the Google listing links to instead of a website
 * ("Facebook"), or null. */
export function listingSocialPlatform(row: BusinessWebsiteSource): string | null {
  return socialPagePlatform(clean(row.website));
}

/** The business's real website URL, or null when it truly has none. */
export function businessWebsiteUrl(row: BusinessWebsiteSource): string | null {
  return realSite(row.website) ?? realSite(row.verified_website_url);
}

/** True when the real website is one verified elsewhere — i.e. it is NOT
 * on the Google listing yet. */
export function isWebsiteVerifiedElsewhereOnly(row: BusinessWebsiteSource): boolean {
  return realSite(row.website) === null && realSite(row.verified_website_url) !== null;
}
