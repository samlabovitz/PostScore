// The one shared answer to "what is this business's real website?" — the
// site PostScore grades, screenshots and shows, everywhere:
//   1. the site the owner confirmed with "Wrong site?" (owner_website_url —
//      the owner's own correction wins, labelled "Confirmed by you");
//   2. a real site PostScore verified (verified_website_url: the real Bánh
//      Mì Boy and Colorful Yun Nan cases), "Verified by PostScore";
//   3. the Google listing's own URL, "From your Google listing".
// Every place that decides "has a website" or picks a URL to show, open,
// scan or screenshot reads this, never `website` alone. shownWebsite adds
// the one thing a link needs on top: never open a listing link that's
// parked or broken. Code that is
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
  /** supabase/owner-website.sql — absent before it's run. */
  owner_website_url?: string | null;
}

/** Where the graded site came from. */
export type WebsiteSource = "owner" | "verified" | "listing";

/** The site PostScore grades and screenshots, and where it came from —
 * null when there's no real site at all. A parked or broken listing link
 * is still returned (the scan must read it to know); shownWebsite never
 * opens it. */
export function gradedWebsite(row: BusinessWebsiteSource): { url: string; source: WebsiteSource } | null {
  const owner = realSite(row.owner_website_url);
  if (owner) return { url: owner, source: "owner" };
  const verified = realSite(row.verified_website_url);
  if (verified) return { url: verified, source: "verified" };
  const listing = realSite(row.website);
  return listing ? { url: listing, source: "listing" } : null;
}

/** For shownWebsite: the saved analysis, read only for whether the Google
 * listing's own link is parked or broken (websiteTrust.listingLinkBroken,
 * or a screenshot of the listing link that came back 404/410 — see listingLinkBroken). */
export interface ShownWebsiteSource extends BusinessWebsiteSource {
  website_analysis_json?: unknown;
}

function clean(url: string | null | undefined): string | null {
  return typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
}

/** Same address, ignoring case, "www.", a trailing slash and the scheme. */
function sameSiteUrl(a: string, b: string): boolean {
  const norm = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  return norm(a) === norm(b);
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

/** The business's real website URL (gradedWebsite), or null when it truly has none. */
export function businessWebsiteUrl(row: BusinessWebsiteSource): string | null {
  return gradedWebsite(row)?.url ?? null;
}

/** The Google listing's own link is a parked page, a 404/410 or a dead
 * page (saved by the last scan — lib/websiteAnalysisForSave.ts). */
export function listingLinkBroken(row: ShownWebsiteSource): boolean {
  const json = row.website_analysis_json;
  const analysis = json && typeof json === "object" ? (json as { websiteTrust?: { listingLinkBroken?: unknown }; screenshotSiteUrl?: unknown; screenshotHttpStatus?: unknown }) : null;
  const listing = realSite(row.website);
  if (!listing) return false;
  if (analysis?.websiteTrust?.listingLinkBroken === true) return true;
  // Our page fetch read a page, but ScreenshotOne — a real browser — got a
  // 404/410 for the same listing link: they disagree, so it's broken.
  const shotOfListing = typeof analysis?.screenshotSiteUrl === "string" && sameSiteUrl(analysis.screenshotSiteUrl, listing);
  return shotOfListing && (analysis?.screenshotHttpStatus === 404 || analysis?.screenshotHttpStatus === 410);
}

export type ShownWebsite =
  /** Show and open `url` (from `source`). `listingDiffers`: it's not the
   * listing's link, which is parked or broken — say so. */
  | { kind: "site"; url: string; source: WebsiteSource; listingDiffers: boolean }
  /** The listing's link is parked or broken and no real site is known:
   * never open it, never guess another — point to the fix. */
  | { kind: "broken"; listingUrl: string }
  | { kind: "none" };

/**
 * The website PostScore shows and opens — "View live site", the header
 * chip, the Website page, PostAI, reports, print kit QR codes: the
 * verified site when there is one, otherwise the listing's own link — but
 * never a listing link that's parked or broken.
 */
export function shownWebsite(row: ShownWebsiteSource): ShownWebsite {
  const graded = gradedWebsite(row);
  if (!graded) return { kind: "none" };
  const broken = listingLinkBroken(row);
  if (graded.source !== "listing") return { kind: "site", url: graded.url, source: graded.source, listingDiffers: broken };
  return broken ? { kind: "broken", listingUrl: graded.url } : { kind: "site", url: graded.url, source: "listing", listingDiffers: false };
}

/** The URL to open, or null (none, or only a broken listing link). */
export function shownWebsiteUrl(row: ShownWebsiteSource): string | null {
  const shown = shownWebsite(row);
  return shown.kind === "site" ? shown.url : null;
}

/** True when the real website is one verified elsewhere — i.e. it is NOT
 * on the Google listing yet. */
export function isWebsiteVerifiedElsewhereOnly(row: BusinessWebsiteSource): boolean {
  return realSite(row.website) === null && (realSite(row.owner_website_url) ?? realSite(row.verified_website_url)) !== null;
}
