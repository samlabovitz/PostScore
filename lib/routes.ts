// Every link to a page that moves in Day 25B goes through these helpers
// (docs/plans/day25a-spec.md §3). Until the new pages exist,
// NEW_PAGES_LIVE is false and each helper returns TODAY's URL, so owners
// see no change. Flipping it (one line) points every link at the new
// pages and turns on the old-URL redirects (legacyRedirect below).
// test/routesNoHandWritten.test.ts fails on any hand-written link to
// these pages outside this file. Pure.

/** One switch for the new Presence/Growth pages and their redirects.
 * Off for owners (production) and on localhost:3000. On only for the
 * new-design preview, `npm run dev:new` on localhost:3001
 * (NEXT_PUBLIC_NEW_DESIGN_PREVIEW=true, never in a production build).
 * Going live for owners needs Sam's OK on the full version (CLAUDE.md). */
export const NEW_PAGES_LIVE: boolean = newDesignPreview({ NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_NEW_DESIGN_PREVIEW: process.env.NEXT_PUBLIC_NEW_DESIGN_PREVIEW });

/** The preview flag, never in production. (process.env is read literally
 * above so Next inlines it into the browser bundle.) */
export function newDesignPreview(env: { NODE_ENV?: string; NEXT_PUBLIC_NEW_DESIGN_PREVIEW?: string }): boolean {
  return env.NODE_ENV !== "production" && env.NEXT_PUBLIC_NEW_DESIGN_PREVIEW === "true";
}

/** The new pages built so far (Day 25B steps 2–3). A link or redirect to a
 * page not built yet keeps today's URL until its step (5–6). */
export const BUILT_NEW_PAGES: ReadonlySet<string> = new Set(["fix-plan", "google-listing", "google-results", "get-reviews", "offers", "print-kit", "local-events", "growth"]);
const built = (page: string) => NEW_PAGES_LIVE && BUILT_NEW_PAGES.has(page);

/** Customer offers' tabs ("all" = Running now). First-time and Loyalty are Coming soon until Day 25D. */
export type OffersTab = "all" | "coupons" | "referrals" | "first-time" | "loyalty";

export interface RouteOptions {
  /** With or without the leading "#". */
  hash?: string;
  /** Extra query parameters, after the page's own (e.g. ?tab=google). */
  query?: Record<string, string>;
}

function build(path: string, base: Record<string, string>, opts: RouteOptions = {}): string {
  const params = new URLSearchParams(base);
  for (const [k, v] of Object.entries(opts.query ?? {})) params.set(k, v);
  const q = params.toString();
  const hash = opts.hash ? (opts.hash.startsWith("#") ? opts.hash : `#${opts.hash}`) : "";
  return `${path}${q ? `?${q}` : ""}${hash}`;
}

const biz = (businessId: string) => `/business/${businessId}`;

/** Presence → Fix plan. Today: the Growth page's Growth recap tab. */
export function fixPlanHref(businessId: string, opts?: RouteOptions): string {
  return NEW_PAGES_LIVE ? build(`${biz(businessId)}/fix-plan`, {}, opts) : build(`${biz(businessId)}/growth`, {}, opts);
}

/** The Fix plan page itself, whatever the switch: for links shown only
 * where the new pages can be opened (NEW_PAGES_LIVE, or the dev test login). */
export function fixPlanPageHref(businessId: string, opts?: RouteOptions): string {
  return build(`${biz(businessId)}/fix-plan`, {}, opts);
}

/** Presence → Google listing (listing rows, ideas, protection). Today: the Growth page's Google tab. */
export function googleListingHref(businessId: string, opts?: RouteOptions): string {
  return NEW_PAGES_LIVE ? build(`${biz(businessId)}/google-listing`, {}, opts) : build(`${biz(businessId)}/growth`, { tab: "google" }, opts);
}

/** Growth → Google results (last month, this week, searches). Today: the Growth page's Google tab. */
export function googleResultsHref(businessId: string, opts?: RouteOptions): string {
  return NEW_PAGES_LIVE ? build(`${biz(businessId)}/google-results`, {}, opts) : build(`${biz(businessId)}/growth`, { tab: "google" }, opts);
}

/** Growth → Growth plan. Today: the Growth page. */
export function growthPlanHref(businessId: string, opts?: RouteOptions): string {
  return build(`${biz(businessId)}/growth`, {}, opts);
}

/** Presence → Reviews (rating, replies, review points). The URL stays /website-reviews. */
export function reviewsHref(businessId: string, opts?: RouteOptions): string {
  return build(`${biz(businessId)}/website-reviews`, {}, opts);
}

/** Growth → Get more reviews (asking: link, QR, guide, signs). Today: the Reviews page. */
export function getReviewsHref(businessId: string, opts?: RouteOptions): string {
  return built("get-reviews") ? build(`${biz(businessId)}/get-reviews`, {}, opts) : build(`${biz(businessId)}/website-reviews`, {}, opts);
}

/** Growth → Customer offers, on a tab. Today: the Campaigns page's tabs. */
export function offersHref(businessId: string, tab: OffersTab = "all", opts?: RouteOptions): string {
  if (built("offers")) return build(`${biz(businessId)}/offers`, tab === "all" ? {} : { tab }, opts);
  // Today's Campaigns page has only the coupon and referral tabs.
  return build(`${biz(businessId)}/campaigns`, tab === "coupons" || tab === "referrals" ? { tab } : {}, opts);
}

/** Growth → Print kit & QR (every printable, with its QR). Today: the review QR on the Reviews page. */
/** Print kit & QR is hidden until Day 34 / 37-Core: off the sidebar and the Growth tools; its route stays and
 * sends owners to Get more reviews #review-link (the review link & QR). Flip to bring it back. */
export const PRINT_KIT_LIVE = false;

export function printKitHref(businessId: string, opts?: RouteOptions): string {
  if (!PRINT_KIT_LIVE) return getReviewsHref(businessId, { hash: "review-link", ...opts });
  return built("print-kit") ? build(`${biz(businessId)}/print-kit`, {}, opts) : build(`${biz(businessId)}/website-reviews`, {}, { hash: "get-more-reviews", ...opts });
}

/** Growth → Local events ("Coming soon" until Day 25D). Null where the page isn't live yet. */
export function localEventsHref(businessId: string, opts?: RouteOptions): string | null {
  return built("local-events") ? build(`${biz(businessId)}/local-events`, {}, opts) : null;
}

/** Growth → Campaigns (email, text, social). The URL stays /campaigns. */
export function campaignsPageHref(businessId: string, opts?: RouteOptions): string {
  return build(`${biz(businessId)}/campaigns`, {}, opts);
}

/** The pages that show Google listing data, to revalidate after a Google
 * change (each once; today they are all the Growth page). */
export function googlePagePaths(businessId: string): string[] {
  const paths = [googleResultsHref(businessId), googleListingHref(businessId), growthPlanHref(businessId)].map((h) => h.split(/[?#]/)[0]);
  return Array.from(new Set(paths));
}

/** Whether a fix link opens a fix's own steps ("How to fix it" open) on Fix plan. */
export function isFixPlanStepsHref(href: string): boolean {
  const path = NEW_PAGES_LIVE ? "/fix-plan?" : "/growth?";
  return href.includes(`${path}open=howto#`);
}

// ---------------------------------------------------------------------------
// Old URLs → new pages (spec §3 "Redirects"). Used only when NEW_PAGES_LIVE.
// Server pages can see the path and query; the hash only reaches the
// browser, so components/layout/LegacyHashRedirect.tsx handles hash rows.
// ---------------------------------------------------------------------------

/** Google tab anchors that belong to Google results; every other anchor
 * on the old tab (listing rows, editors, ideas, protection) is Google listing. */
const RESULTS_HASHES = new Set(["last-month", "this-week", "since", "funnel", "searches", "search-demand", "google-tab-levers", "google-connection"]);

export interface LegacyUrl {
  pathname: string;
  /** "?a=b" or "a=b" or "". */
  search?: string;
  /** "#x" or "x" or "". */
  hash?: string;
}

/** The new URL for an old one, or null when it's already right. Pure. */
export function legacyRedirect(url: LegacyUrl): string | null {
  const m = url.pathname.match(/^\/business\/([A-Za-z0-9-]+)\/(growth|google-profile|search-demand|campaigns|website-reviews)\/?$/);
  if (!m) return null;
  const [, id, page] = m;
  const params = new URLSearchParams((url.search ?? "").replace(/^\?/, ""));
  const hash = (url.hash ?? "").replace(/^#/, "");
  const tab = params.get("tab");
  const keep = (names: string[]): Record<string, string> => Object.fromEntries(names.flatMap((n) => (params.get(n) ? [[n, params.get(n)!]] : [])));

  if (page === "google-profile") return `/business/${id}/google-results${hash ? `#${hash}` : ""}`;
  if (page === "search-demand") return `/business/${id}/google-results#searches`;

  if (page === "growth") {
    if (tab === "google" || tab === "google-profile") {
      const extra = keep(["gbp", "open"]);
      const q = new URLSearchParams(extra).toString();
      const target = hash && !RESULTS_HASHES.has(hash) ? "google-listing" : "google-results";
      return `/business/${id}/${target}${q ? `?${q}` : ""}${hash ? `#${hash}` : ""}`;
    }
    if (tab === "coupons") return `/business/${id}/offers?tab=coupons${hash ? `#${hash}` : ""}`;
    if (tab === "referral" || tab === "referrals") return `/business/${id}/offers?tab=referrals${hash ? `#${hash}` : ""}`;
    if (hash === "ways-to-grow") return `/business/${id}/growth#more`;
    // The weekly routine folds into This week's plan; "More ways to bring people in" keeps its own block (#more-ways).
    if (hash === "weekly-routine") return `/business/${id}/growth#this-week`;
    if (hash === "weekly-plan" || hash.startsWith("task-") || params.get("open") === "howto") {
      const q = new URLSearchParams(keep(["open"])).toString();
      return `/business/${id}/fix-plan${q ? `?${q}` : ""}${hash ? `#${hash}` : ""}`;
    }
    return null;
  }

  if (page === "campaigns") {
    if (tab === "all") return `/business/${id}/offers${hash ? `#${hash}` : ""}`;
    if (tab === "coupons") return `/business/${id}/offers?tab=coupons${hash ? `#${hash}` : ""}`;
    if (tab === "referral" || tab === "referrals") return `/business/${id}/offers?tab=referrals${hash ? `#${hash}` : ""}`;
    return null;
  }

  // website-reviews: asking moved to Get more reviews; replies and points stay.
  if (hash === "get-more-reviews" || hash === "review-link") return `/business/${id}/get-reviews#${hash}`;
  return null;
}

/** legacyRedirect, only once the new pages are live. */
export function legacyRedirectIfLive(url: LegacyUrl): string | null {
  if (!NEW_PAGES_LIVE) return null;
  return redirectToBuilt(legacyRedirect(url));
}

/** A redirect only to a page that exists (else null: the old page stays). */
export function redirectToBuilt(to: string | null, builtPages: ReadonlySet<string> = BUILT_NEW_PAGES): string | null {
  const page = to?.match(/^\/business\/[A-Za-z0-9-]+\/([a-z-]+)/)?.[1];
  return page && builtPages.has(page) ? to : null;
}
