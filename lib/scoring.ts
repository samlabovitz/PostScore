// PostScore scoring engine.
//
// This module is pure: every exported function is a deterministic
// mapping from input data to output data. No randomness, no dates read
// from the system clock, no network calls, no AI/LLM calls. Given the
// same BusinessScoringInput, scoreBusiness() will always return the
// exact same ScoreBreakdown, today or in ten years — that's what makes
// scores comparable over time and what makes the suggestion→score
// guarantee below possible to prove with a test.
//
// A couple of input fields (mostRecentReviewDaysAgo, httpsStatus)
// represent facts that can only be established by doing real work
// outside this module — reading the clock, or making a network
// request — at data-collection time. That work happens elsewhere (see
// lib/websiteHttps.ts for the HTTPS probe) and its result is frozen
// into the input once, before scoreBusiness ever runs. This module
// never re-derives those facts itself and never makes them up.
//
// Every point on the board is tied to a real field that Google Places
// returned, or a real fact established some other honest way (like an
// actual network probe of the business's website — see httpsStatus).
// Nothing here estimates search rank, invents an SEO score, or asks an
// LLM to guess a quality level. Where
// we can't determine a check from real data (Google didn't return the
// field, or we haven't built the underlying data collection yet), the
// check is marked NOT_FOUND/UNCERTAIN and is excluded from scoring —
// never silently treated as a failing zero.
//
// Every check's label/advice/explanation is sourced from lib/i18n's
// message dictionary via t()/tPlural(), keyed under "content.checks.<id>.*"
// — the same shared-content-layer pattern lib/monthlyReport.ts and
// emails/MonthlyReportEmail.tsx use for report.* copy. scoreBusiness() and
// generateSuggestions() both default their `locale` parameter to
// DEFAULT_LOCALE, so every existing caller that doesn't pass one keeps
// getting the exact same English text this file used to hardcode.

import { isWebsiteBuilderId, type WebsiteBuilderDetection, type WebsiteBuilderId } from "@/lib/websiteBuilder";
import { DEFAULT_LOCALE, formatShortDate, t, tPlural, type Locale, type MessageKey } from "@/lib/i18n";
import { GOOGLE_PHOTO_CAP } from "@/lib/googlePhotoCap";
import { reachabilityReasonMessageKey, type ReachabilityFailureReason } from "@/lib/websiteReachability";
import { spamTopic } from "@/lib/siteSecurity";
import { socialPagePlatform } from "@/lib/websiteTrust";
import { socialProfileCounts } from "@/lib/socialLinkCheck";
import { keyForInfoConflict, keyForStaleNotice, trimNoticeToSentences, type AbandonedSiteFinding, type EmbeddedMapFinding, type InfoFieldFinding, type SpamFinding, type StaleNoticeFinding, type WebsiteKind } from "@/lib/websiteTrust";

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

/**
 * Bump this whenever CHECKS, CATEGORY_WEIGHTS, curves, or grade thresholds
 * change in a way that would move existing scores. Every stored score row
 * records the version that produced it, so historical scores stay
 * interpretable even after the formula evolves.
 */
export const SCORING_VERSION = "1.11.0";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/**
 * How sure we are about a check's result:
 * - VERIFIED: Google returned the field outright, or a fact follows
 *   directly and unambiguously from a field it returned (including a
 *   field being genuinely absent, e.g. "no phone number on file").
 * - LIKELY: we could infer the check from a related field but not the
 *   most direct one (e.g. a primary category label stood in for a full
 *   category list).
 * - UNCERTAIN: Google returned something for this field, but its shape
 *   doesn't let us evaluate the check confidently (e.g. a website URL
 *   with no recognizable http/https scheme).
 * - NOT_FOUND: we have no data to evaluate this check at all — either
 *   Google didn't return the underlying field, or the check measures
 *   something PostScore doesn't collect yet.
 *
 * VERIFIED and LIKELY checks count toward scoring. UNCERTAIN and
 * NOT_FOUND checks are excluded from the total and are never treated
 * as a zero — absence of proof isn't proof of a problem.
 */
export type Confidence = "VERIFIED" | "LIKELY" | "UNCERTAIN" | "NOT_FOUND";

/**
 * Result of an actual network probe of a business's website — see
 * lib/websiteHttps.ts for how this gets computed (a real HTTPS
 * request, following redirects, made outside this module and once per
 * save, not per score) and app/actions/businesses.ts for where it's
 * cached onto the business row. lib/scoring.ts never makes the
 * request itself; website.https below only scores whatever fact was
 * frozen into the input, same as mostRecentReviewDaysAgo.
 * - "https": the site was reached and responded successfully over
 *   HTTPS, after following any redirects. This is deliberately
 *   independent of what scheme Google's listed URL uses — a business
 *   can list "http://example.com" on Google while the real site
 *   redirects to HTTPS, and this correctly reflects the real site.
 * - "http_only": the site was reached over HTTP, but no working HTTPS
 *   endpoint could be confirmed even when requested directly.
 * - "unreachable": the probe could not complete at all (timeout,
 *   network error, DNS failure, or the site blocked the request).
 *   This proves nothing about whether HTTPS actually works, so it
 *   must never be scored as a failure.
 */
export type HttpsCheckStatus = "https" | "http_only" | "unreachable";

/**
 * Real signals read off a business's own live HTML by an actual
 * server-side fetch — see lib/websiteContentAnalysis.ts's
 * analyzeWebsiteHtml(), which is pure and network-free (it just reads a
 * string of HTML someone else already fetched). Every field here is a
 * literal, checkable fact about the page's markup/text; nothing is
 * inferred or guessed. Used by website.content_depth and
 * website.contact_conversion below.
 */
/** A real social media profile the site links to (Step 2d) — e.g.
 * { platform: "Instagram", url: "instagram.com/mainstreetsweets" }. */
export interface SocialProfile {
  platform: string;
  url: string;
  /** v1.11.0: the full address the site actually links to (for the
   * one-request check below). Absent on profiles saved before. */
  href?: string;
  /** v1.11.0: what ONE plain request to `href` resolved to — saved so
   * every result can be audited (lib/socialLinkCheck.ts). Absent = not
   * checked (counts, as before). */
  check?: SocialLinkCheck;
}

/** See lib/socialLinkCheck.ts. "profile" and "unconfirmed" (the
 * platform blocked us but the address is a valid profile path) count;
 * the rest don't. */
export interface SocialLinkCheck {
  result: "profile" | "unconfirmed" | "own_site" | "elsewhere" | "not_found";
  /** Where the request ended up after redirects (null on a network error). */
  finalUrl: string | null;
  httpStatus: number | null;
  checkedAt: string;
}

export interface WebsiteContentSignals {
  hasTitle: boolean;
  hasMetaDescription: boolean;
  /** A <meta name="viewport"> tag with a real device-width directive —
   * the one concrete, checkable "responsive/modern site" signal we can
   * read from raw HTML without rendering it. */
  hasViewportTag: boolean;
  /** Count of <h1>-<h6> tags — a bare single-block page has ~0. */
  headingCount: number;
  /** Character count of visible text after stripping tags/scripts/styles. */
  visibleTextLength: number;
  /** A real tel: link. */
  hasPhoneLink: boolean;
  /** A real mailto: link. */
  hasEmailLink: boolean;
  /** A real link to the site's OWN contact page (Step 2d). Absent on
   * rows saved before this was detected. */
  hasContactPageLink?: boolean;
  /** Real social media profiles linked from the homepage or the Contact
   * page (Step 2d) — see detectSocialProfiles. Absent (undefined) on
   * rows saved before this was detected: never read as "none found". */
  socialProfiles?: SocialProfile[];
  /** The page's footer looks script-built (see
   * hasScriptBuiltFooterSigns in lib/websiteContentAnalysis.ts) — when
   * no social profiles were found, Social links is "couldn't check",
   * not a zero. Absent on rows saved before this was detected. */
  scriptBuiltFooter?: boolean;
  /** v1.10.0: the exact link/phrase behind each Contact & conversion
   * signal (audit evidence; never scored). Absent on older rows. */
  contactEvidence?: ContactEvidence;
  /** A curated call-to-action phrase ("book now", "contact us", etc.)
   * found in the page's visible text. */
  hasCtaText: boolean;
  /** True when this page reads as an empty client-side-rendered app
   * shell (near-zero visible text/headings, plus an actual technical
   * signal like id="__nuxt"/id="__next"/id="root"/id="app" or a
   * serverRendered:false flag) rather than a genuinely bare or broken
   * page — see lib/websiteContentAnalysis.ts's detectClientRenderedShell.
   * website.content_depth/website.contact_conversion below check this
   * FIRST and, when true, exclude themselves from scoring with an honest
   * "couldn't verify — renders with JavaScript" explanation instead of
   * scoring these (necessarily empty) signals as real failures. A site
   * that's genuinely thin/bare — no CSR marker present — still scores
   * normally on these same fields; this flag exists specifically so
   * "we couldn't read it" is never confused with "there's nothing
   * there." */
  isLikelyClientRenderedShell: boolean;
  /** Only meaningful when isLikelyClientRenderedShell is true: real
   * signals recovered from Google PageSpeed's own rendered-Chrome
   * Lighthouse audits (document-title/meta-description/viewport/
   * heading-order — see lib/websiteAnalysis.ts's
   * fetchMobilePerformance and PAGESPEED_CSR_RECOVERY_CATEGORIES),
   * requested only for a detected shell. null when this isn't a
   * client-rendered shell, or when it is but that widened PageSpeed call
   * didn't succeed — website.content_depth falls back to its full
   * "couldn't verify" exclusion in that case, exactly as before this
   * recovery existed. Deliberately kept separate from
   * hasTitle/hasMetaDescription/hasViewportTag/headingCount above rather
   * than overwriting them: those stay the real (if empty) static-fetch
   * result, so the raw static signal is never lost even once recovery
   * succeeds. */
  renderedContentSignals: RenderedContentSignals | null;
}

/** Real presence/absence signals Google PageSpeed's Lighthouse run can
 * confirm from a page's actual rendered DOM — see WebsiteContentSignals.
 * Each field is independently nullable: true/false is a real,
 * Lighthouse-confirmed presence/absence; null means that specific audit
 * wasn't present in the response (genuinely unknown — never credited,
 * and never reported as a confirmed failure either, by
 * website.content_depth). There's deliberately no "content length"
 * field here: no Lighthouse audit measures visible text depth, so that
 * dimension always stays unconfirmed for a client-rendered site. */
export interface RenderedContentSignals {
  hasTitle: boolean | null;
  hasMetaDescription: boolean | null;
  hasViewportTag: boolean | null;
  /** Derived from Lighthouse's heading-order audit: that audit's
   * scoreDisplayMode is "notApplicable" specifically when the rendered
   * page has zero heading elements (nothing to check the order of); any
   * other display mode means at least one heading exists. An indirect
   * proxy — heading-order's real purpose is order-correctness, not
   * counting — but a reliable presence signal in practice. */
  hasHeadings: boolean | null;
}

export type MobilePerformanceMethod = "field" | "lab";
export type FieldSpeedCategory = "FAST" | "AVERAGE" | "SLOW";

/**
 * How website.performance_mobile's real speed signal was determined for
 * a scan — see lib/websiteAnalysis.ts's fetchMobilePerformance for how
 * each is collected, and the check's own evaluate() below for how each
 * maps to points.
 *
 * "field" (Chrome UX Report real-visitor data — either for this exact
 * URL, or, failing that, the site's whole origin) is preferred whenever
 * Google has it: real visitors' actual phones over a real 28-day window
 * beat any single simulated run. "lab" (a Lighthouse performance score,
 * taken as the MEDIAN of 3 independent runs rather than trusting any
 * one of them) is the honest fallback for a newer or lower-traffic site
 * Google has no real-user data for yet — see mobile-speed-change.md's
 * investigation for how much a single lab run can swing between two
 * runs of the same live site minutes apart.
 */
export interface MobilePerformanceMeasurement {
  method: MobilePerformanceMethod;
  /** Google's own FAST/AVERAGE/SLOW real-user classification. Set only
   * when method === "field"; null otherwise. */
  fieldCategory: FieldSpeedCategory | null;
  /** 0-100, the median of 3 real Lighthouse mobile-performance runs. Set
   * only when method === "lab"; null otherwise. */
  labScore: number | null;
  /** Real ISO timestamp of when this measurement was actually taken —
   * set by fetchMobilePerformance (lib/websiteAnalysis.ts) the moment a
   * fresh field/lab measurement succeeds. Optional: absent on every
   * fixture/test that doesn't care, and on any row saved before this
   * field existed. Only ever READ when carriedForward is true below —
   * see carryForwardMobilePerformance's own doc. */
  measuredAt?: string;
  /** True only when this measurement is a reused, out-of-date value
   * carried forward because THIS scan's own PageSpeed attempt timed
   * out and a real measurement from within the last 30 days existed to
   * reuse (see carryForwardMobilePerformance below) — never set true
   * for a measurement that was actually just taken this scan. Optional;
   * absent/false both honestly mean "this is a fresh measurement" (or a
   * row from before this field existed, same honest meaning either
   * way). */
  carriedForward?: boolean;
  /** Step 2d: "origin" when this field measurement is Google's WHOLE-SITE
   * real-visitor data, used because the business's own URL landed on an
   * error page (a soft 404) — labeled "whole-site measurement". Absent =
   * the URL's own data (or a lab score). */
  fieldScope?: "origin";
  /** Step 2d: why this measurement was carried forward — absent = a
   * timeout (the original reason). */
  carriedForwardReason?: "error_page";
}

/** Why a PageSpeed Insights attempt didn't produce a usable measurement
 * — stored instead of collapsing straight to null, so the Website page
 * and PostAI can explain the real cause (Day 4 Part 3a) rather than a
 * bare "couldn't verify":
 *   - "timed_out": every attempt (including the one retry) ran past
 *     PageSpeed's own timeout with no response.
 *   - "http_error": PageSpeed itself returned a non-ok HTTP response
 *     (see `status`) that wasn't a timeout — a real PageSpeed-side
 *     failure, not a statement about the target site.
 *   - "no_api_key": PAGESPEED_API_KEY isn't configured — never
 *     attempted at all.
 *   - "error": some other failure (a thrown exception, malformed
 *     response body) not covered by the above. */
export interface MobilePerformanceFailure {
  /** Step 2d: "error_page" = PageSpeed loaded an error page (soft 404,
   * runtime error, non-2xx main document, or another site) instead of
   * the business's real page — never scored. */
  kind: "timed_out" | "http_error" | "no_api_key" | "error" | "error_page";
  /** Only set when kind === "http_error" — the real HTTP status
   * PageSpeed itself returned. */
  status: number | null;
}

/**
 * The one real mapping from a PageSpeed failure kind to its honest,
 * owner-facing message key — shared by the Website page
 * (WebsiteScoreBreakdown's CheckRow, for website.performance_mobile
 * when excluded) and PostAI's own REAL DATA CONTEXT (lib/assistant.ts)
 * (Day 4 Part 3c). null for "no_api_key"/"error" — neither is a fact
 * about the OWNER's site worth a specific sentence (one is an internal
 * config gap, the other a generic anomaly), so both fall back to the
 * existing generic "couldn't verify" wording instead of a guessed-at
 * specific one. */
export function performanceFailureMessageKey(
  failure: MobilePerformanceFailure
): "dashboard.website.performanceTimedOut" | "dashboard.website.performanceHttpError" | "dashboard.website.performanceErrorPage" | null {
  switch (failure.kind) {
    case "timed_out":
      return "dashboard.website.performanceTimedOut";
    case "error_page":
      return "dashboard.website.performanceErrorPage";
    case "http_error":
      return "dashboard.website.performanceHttpError";
    case "no_api_key":
    case "error":
      return null;
  }
}

/** How far back a real prior measurement can still be honestly reused
 * on a timeout — see carryForwardMobilePerformance's own doc. 30 real
 * days: long enough that a single bad PageSpeed run never has to fall
 * back to a flat "couldn't verify," short enough that a genuinely
 * stale number is never passed off as current. */
export const MAX_PERFORMANCE_CARRY_FORWARD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Decides the real mobilePerformance/mobilePerformanceFailureReason
 * pair to actually save for this scan — reusing a real PRIOR
 * measurement, labeled honestly as "last measured {date}" (see
 * website.performance_mobile's own evaluate()), rather than excluding
 * the check outright, when and ONLY when:
 *   - this scan's own PageSpeed attempt genuinely timed out (never on
 *     any other failure kind — http_error/no_api_key/error are real,
 *     different facts a stale reuse would misrepresent), AND
 *   - a real prior measurement exists, with its own real measuredAt,
 *     from within MAX_PERFORMANCE_CARRY_FORWARD_MS.
 *
 * The real Blue Bottle Coffee case this fixes: a single flaky PageSpeed
 * timeout was swinging its total score up by double digits (excluding
 * a real, recent 27/100 measurement entirely) purely because that one
 * scan's own attempt happened to time out, not because anything about
 * the site changed. Deliberately does NOT help the Qamaria Yemeni
 * Coffee Co. case (a genuinely new real measurement succeeding for the
 * first time, not a timeout reusing a stale one) — that's a different,
 * real volatility problem (lab-score noise between runs), not this
 * function's job.
 */
export function carryForwardMobilePerformance(
  fresh: MobilePerformanceMeasurement | null,
  freshFailureReason: MobilePerformanceFailure | null,
  existing: MobilePerformanceMeasurement | null | undefined,
  now: Date = new Date()
): { mobilePerformance: MobilePerformanceMeasurement | null; mobilePerformanceFailureReason: MobilePerformanceFailure | null } {
  if (fresh) return { mobilePerformance: fresh, mobilePerformanceFailureReason: null };
  // Step 2d: an error-page run is just as unmeasured as a timeout — reuse
  // a real measurement from the last 30 days the same way.
  if ((freshFailureReason?.kind !== "timed_out" && freshFailureReason?.kind !== "error_page") || !existing?.measuredAt) {
    return { mobilePerformance: null, mobilePerformanceFailureReason: freshFailureReason };
  }
  const age = now.getTime() - new Date(existing.measuredAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > MAX_PERFORMANCE_CARRY_FORWARD_MS) {
    return { mobilePerformance: null, mobilePerformanceFailureReason: freshFailureReason };
  }
  return {
    mobilePerformance: {
      ...existing,
      carriedForward: true,
      ...(freshFailureReason.kind === "error_page" ? { carriedForwardReason: "error_page" as const } : {}),
    },
    mobilePerformanceFailureReason: null,
  };
}

/** Three honest states for whether a real About/Our-Story or
 * Services/Products page or homepage section was actually found — see
 * website.about_presence/website.services_presence below. "found" means
 * real, substantial content was actually read (see
 * lib/pagePresenceDetection.ts for the word-count/listed-items rules);
 * "not_found" means we looked (a dedicated page and/or the homepage)
 * and genuinely didn't find enough; "couldnt_check" means a real
 * attempt failed before we could tell either way (timeout/block/down/
 * error on a MATCHED candidate page — never guessed). */
export type PagePresenceState = "found" | "not_found" | "couldnt_check";

/** Extra honest facts beyond the 3 core states, real enough to earn
 * their own line on the Website page and their own sentence to PostAI:
 * "pdf_only" (Services only) — a real PDF menu/services list was found
 * and loads fine, but its content is never read (still counts as
 * found: the list demonstrably exists for a real visitor, even though
 * PostScore can't verify what's in it). "broken_link" — a nav/sitemap
 * link that matched an About/Services keyword returns a real 404: the
 * link itself is broken, which is stronger, more actionable evidence
 * than a plain "nothing found," so it's reported as not_found with
 * this specific note rather than folded into couldnt_check (which is
 * reserved for genuinely inconclusive failures — timeouts, blocks,
 * 5xx/other errors — see lib/websiteAnalysis.ts's detectPagePresence).
 * "online_ordering" (Services only) — a real "Order online"/"View
 * menu" link to this same brand or a known ordering platform (Toast,
 * ChowNow, ...) loads fine; the menu demonstrably exists, we just
 * can't read its text. "image_only" (Services only) — a real Menu/
 * Services candidate page loads fine with real intro content, but its
 * actual items are rendered as images, not text. */
export type PagePresenceNote = "pdf_only" | "broken_link" | "online_ordering" | "image_only" | "brand_page" | null;

/** Why a page-presence check is couldnt_check — every real
 * ReachabilityFailureReason (the page itself was unreachable), plus
 * "js_rendered": the page loaded FINE (200), but its static HTML is a
 * JS-framework loading shell with essentially no real text at all (see
 * lib/pagePresenceDetection.ts's isLikelyJsRenderedShell) — a
 * fundamentally different, non-reachability reason we genuinely can't
 * see past, so it lives in its own union rather than widening
 * ReachabilityFailureReason itself (which every OTHER reachability
 * field in this file still uses unmodified). */
export type PagePresenceFailureReason = ReachabilityFailureReason | "js_rendered";

/** The real result of looking for About/Our-Story or Services/Products
 * content — see lib/websiteAnalysis.ts's detectPagePresence for how
 * this gets produced (candidate page discovery, an extra-page fetch
 * with its own timeout/retry, PDF/404 handling, a homepage-section
 * fallback) and lib/pagePresenceDetection.ts for the pure content rules
 * (main-content-only word counts, real listed items). */
export interface PagePresenceResult {
  state: PagePresenceState;
  /** The real URL where content was found/checked — a dedicated page's
   * URL, or null when found in a homepage section (see
   * locatedOnHomepage) or when nothing was ever fetched at all (a plain
   * not_found with no matching link and no matching homepage heading). */
  url: string | null;
  /** True only when state === "found" and the real content lives in a
   * section of the homepage itself, not a separate page. */
  locatedOnHomepage: boolean;
  /** Only set when state === "couldnt_check" — WHY (see
   * PagePresenceFailureReason's own doc). Always null otherwise. */
  reason: PagePresenceFailureReason | null;
  /** See PagePresenceNote's own doc. Always null except the real cases
   * it documents. */
  note: PagePresenceNote;
  /** v1.9.0: how much real content a found section/page has — "thin"
   * scores 0.5, "descriptive" 1. Absent/null on a result saved before
   * v1.9.0, and on the cases we can't count (a PDF menu, an image-only
   * menu, an ordering link): those keep their full point. */
  depth?: PresenceDepth | null;
  /** v1.9.0: the counts the depth was decided from, saved so a future
   * rule change can be re-graded from saved data. null when no matching
   * section/page was read. */
  counts?: PresenceCounts | null;
}

/** v1.10.0 — what counted for Contact & conversion: the first tel: and
 * mailto: links, the first same-site contact-page link, the action text
 * of a contact link ("Call us"), and the matched call-to-action phrase.
 * null = that signal wasn't found. */
export interface ContactEvidence {
  phoneLink: string | null;
  emailLink: string | null;
  contactPageLink: string | null;
  actionLinkText: string | null;
  ctaPhrase: string | null;
}

/** v1.9.0 — see lib/pagePresenceDetection.ts's aboutDepth/servicesDepth. */
export type PresenceDepth = "thin" | "descriptive";

/** v1.9.0 — countable signals for one About or Services/products result:
 * W words, N distinct named items, D items with a price/size/
 * description, P distinct prices. */
export interface PresenceCounts {
  words: number;
  items: number;
  detailedItems: number;
  prices: number;
}

/**
 * Real site-trust signals, collected once per scan alongside the rest
 * of WebsiteAnalysis — see lib/websiteTrust.ts for the pure detection
 * rules (spam-content/stale-notice/abandoned-site patterns, the info-
 * consistency comparisons) and lib/websiteAnalysis.ts for the one real
 * network call this adds (Google Safe Browsing). Every finding here
 * carries its own real evidence (the exact matched text/URL) — never a
 * summary — so the Website page and PostAI can both show owners exactly
 * what was found, not just a verdict.
 */
export interface WebsiteTrustAnalysis {
  /** Real hacked/injected spam content found anywhere in the page's raw
   * HTML — see detectSpamSignals' own doc (lib/websiteTrust.ts). Empty
   * when none found; never guessed. */
  spamSignals: SpamFinding[];
  /** Google Safe Browsing's own real verdict for this exact URL — null
   * when GOOGLE_SAFE_BROWSING_API_KEY isn't configured (see
   * safeBrowsingChecked below) or the check itself failed (a real
   * network/API error, distinct from "not configured") — never treated
   * as "clean" in either case, only as "not checked." */
  safeBrowsingThreat: { threatFound: boolean; threatTypes: string[] } | null;
  /** True only when a real Safe Browsing API call actually completed
   * (success or failure) — false means no API key was configured, so
   * website.security's own score relies on spamSignals alone and says
   * so honestly. */
  safeBrowsingChecked: boolean;
  /** Always exactly 3 entries (phone, address, hours) — see
   * compareListingInfo's own doc (lib/websiteTrust.ts). A field the
   * site simply doesn't mention is "not_found_on_site," never treated
   * as a conflict. */
  infoConflicts: InfoFieldFinding[];
  /** Real closure/holiday/event notices whose own date has already
   * passed (with grace — see STALE_NOTICE_GRACE_DAYS) — see
   * findStaleNotices' own doc. Empty when none found. */
  staleNotices: StaleNoticeFinding[];
  /** The newest real date found anywhere on the page, and any real
   * unfilled-template leftovers — see detectAbandonedSignals' own doc.
   * Both fields can independently be "nothing found," which is never
   * itself evidence of abandonment (see website.site_freshness). */
  abandonedSignals: AbandonedSiteFinding;
  /** How the Google-listing website's own real hostname classifies —
   * see classifyWebsiteKind's own doc (lib/websiteTrust.ts). null when
   * there's no listing website at all to classify. Read by
   * website.has_website: "independent" and "free_builder" both count as
   * a real site; "directory" never does (the real Modern Liquors
   * [free_builder, counts] vs. a Yelp/Facebook page [directory, never
   * counts] distinction). */
  websiteKind: WebsiteKind | null;
  /** True only when the listing website's own page loaded fine (a real
   * 200) but reads as a genuine "this page doesn't exist" error — see
   * looksLikePageNotFound's own doc. The real Wonder The Grove Newark
   * case. Always false when the page couldn't be read at all (blocked/
   * timed out is a wholly different, already-honest couldnt_check
   * story, never guessed as "probably broken"). */
  listingLinkBroken: boolean;
  /** An embedded Google Map found on the homepage or Contact page (Step
   * 2d) — readableAddress only when the map's own URL states a street
   * address. Absent on rows saved before this was detected. */
  embeddedMap?: EmbeddedMapFinding | null;
  /** Step 2d: the error page the Google listing's website link actually
   * opens in a real browser (PageSpeed's finalDisplayedUrl, e.g.
   * "https://www.wonder.com/order/404") — set with listingLinkBroken. */
  listingLinkErrorPageUrl?: string | null;
  /** Step 2d: the error page an AUTOMATED browser (PageSpeed) was shown
   * for this site — real people may well see the real page (the real
   * Wonder case). Never marks the listing link broken; it means the
   * page itself couldn't be checked by automated means. */
  automatedErrorPageUrl?: string | null;
  /** ISO timestamp of this real scan — display only, same reasoning as
   * WebsiteAnalysis.checkedAt below. */
  checkedAt: string;
}

/** A real owner decision that a specific stale notice or info conflict
 * finding is actually still accurate — removes that ONE finding's
 * penalty on every future scan without suppressing the OTHER findings,
 * or needing the underlying page content to stop matching. Matched
 * against freshly-computed findings by `key` (see keyForStaleNotice/
 * keyForInfoConflict in lib/websiteTrust.ts) — stable across re-scans
 * even as exact wording drifts slightly, since it's keyed to the real
 * finding identity (which notice, which field), not a byte-for-byte
 * snapshot of its text. Stored as the owner (or, today, whoever is
 * acting on the owner's behalf) actually provided it — never inferred
 * or auto-generated. */
export interface WebsiteTrustOverride {
  key: string;
  /** The real reason given for the override, shown back labeled on the
   * Website page (e.g. "Marked accurate by the owner, Oct 10, 2026") —
   * stored exactly as provided, never reworded. */
  note: string;
  overriddenAt: string;
}

/**
 * The frozen result of analyzing a business's live website — see
 * lib/websiteAnalysis.ts for how this gets collected (real network
 * calls: an HTML fetch, a PageSpeed Insights API call, a screenshot
 * capture) once per save/re-scan, same timing and caching model as
 * HttpsCheckStatus above. lib/scoring.ts never makes any of these calls
 * itself.
 *
 * Every field is independently nullable on purpose: a site can serve
 * HTTPS fine and pass PageSpeed while blocking PostScore's own HTML
 * fetch (e.g. Cloudflare bot protection), so one failed signal must
 * never suppress or zero out the others.
 */
export interface WebsiteAnalysis {
  /** null = the server-side HTML fetch failed or was blocked — excluded
   * from content_depth/contact_conversion, never scored as a failure. */
  content: WebsiteContentSignals | null;
  /** How fast this site really is on mobile — see
   * MobilePerformanceMeasurement's own doc for the field-vs-lab method
   * and lib/websiteAnalysis.ts's fetchMobilePerformance for how it's
   * collected. null = no PAGESPEED_API_KEY configured, or every attempt
   * (real-user field data AND all 3 lab runs) failed or timed out —
   * excluded, never scored as a failure. */
  mobilePerformance: MobilePerformanceMeasurement | null;
  /** WHY mobilePerformance is null — see MobilePerformanceFailure's own
   * doc. Always null when mobilePerformance is non-null (a successful
   * measurement has no failure to explain). null on a row saved before
   * this field existed, even if mobilePerformance is also null there —
   * an honestly unknown reason, not a guessed one. */
  mobilePerformanceFailureReason: MobilePerformanceFailure | null;
  /** WHY the server-side HTML fetch (content below) failed or was
   * blocked — see ReachabilityFailureReason's own doc
   * (lib/websiteReachability.ts). Always null when content is non-null.
   * null on a row saved before this field existed. */
  contentFetchFailureReason: ReachabilityFailureReason | null;
  /** WHY the HTTPS probe came back "unreachable" (businesses.https_status
   * — a separate column, not read or written by this module). Stored
   * here, inside the existing website-analysis JSON, rather than as a
   * new column (Day 4 Part 3b) — null whenever https_status isn't
   * "unreachable", and null on a row saved before this field existed. */
  httpsUnreachableReason: ReachabilityFailureReason | null;
  /** Public URL of a real captured screenshot. null = no
   * SCREENSHOT_API_KEY configured, or capture failed/was blocked. */
  screenshotUrl: string | null;
  /** Up to ~4 other real internal pages (services/about/contact/menu)
   * discovered on the homepage's nav and/or sitemap.xml during the same
   * scan, each with its own best-effort screenshot. Display only, purely
   * additive to the Website page's visual analysis section —
   * scoreBusiness() never reads this, and a page whose screenshot
   * couldn't be captured stays in the list with screenshotUrl: null
   * rather than being dropped, so the UI can show an honest "couldn't
   * capture this page" instead of silently having fewer pages. Always
   * [], never undefined, when nothing was discovered. */
  additionalPages: WebsiteAnalysisPage[];
  /** ISO timestamp of the most recent real screenshot CAPTURE attempt
   * (homepage + any discovered pages) — distinct from checkedAt below,
   * which updates on every re-scan whether or not screenshots were
   * touched. null = screenshots have never been captured for this
   * business; the next scan (of any kind) will capture them for the
   * first time. Screenshots are otherwise only ever re-captured through
   * the explicit, SCREENSHOT_REFRESH_COOLDOWN_DAYS-limited "Refresh
   * screenshots" action (see app/actions/websiteScreenshots.ts) — a
   * regular re-scan reuses whatever's already stored here rather than
   * spending another ScreenshotOne call, which is exactly what this
   * field exists to make possible. Display only; scoreBusiness() never
   * reads it. */
  lastScreenshotRefreshAt: string | null;
  /** The homepage's own HTTP status as ScreenshotOne saw it on the most
   * recent capture (Step 2d) — a 4xx/5xx capture is never stored as an
   * image. Absent/null on captures from before this was recorded. */
  screenshotHttpStatus?: number | null;
  /** The most recent capture's real ScreenshotOne usage — counted toward
   * the monthly automatic-capture cap (see lib/screenshotBudget.ts). */
  screenshotCaptureLog?: ScreenshotCaptureLog | null;
  /** Day 4 Step 3: the website builder detected on this scan (no extra
   * request — lib/websiteBuilder.ts). `id: null` = scanned, not detected;
   * absent = scanned before this existed. */
  builder?: WebsiteBuilderDetection;
  /** Step 2g: the checks whose findings were read from the page as a
   * browser shows it (a JavaScript-built page rendered via Browserless) —
   * their evidence says so. */
  readViaBrowserChecks?: string[];
  /** Step 2g: real Browserless renders used for this business in a
   * calendar month ("YYYY-MM") — counted toward the monthly cap. */
  browserRenderLog?: { month: string; renders: number } | null;
  /** The real result of looking for About/Our-Story content — see
   * PagePresenceResult's own doc and lib/websiteAnalysis.ts's
   * detectPagePresence for how it's produced. null on a row saved
   * before this detection existed (always excluded/"not yet analyzed",
   * same honest fallback as every other field saved before it existed
   * — never guessed as a real not_found). */
  aboutPresence: PagePresenceResult | null;
  /** Same real detection as aboutPresence, for Services/Products/Menu
   * content — see website.services_presence. */
  servicesPresence: PagePresenceResult | null;
  /** Real site-trust signals (hacked/injected spam, stale notices, an
   * abandoned-looking site, and the site's own stated hours/phone/
   * address vs. the Google listing) — see WebsiteTrustAnalysis's own
   * doc and website.security/info_consistency/notice_freshness/
   * site_freshness below. Optional (not just nullable) so every
   * existing fixture/test and every row saved before this detection
   * existed stays valid without a mass update — undefined and null both
   * honestly mean "not yet analyzed," same fallback as every other
   * field added here over time. */
  websiteTrust?: WebsiteTrustAnalysis | null;
  /** ISO timestamp of collection — display only; scoreBusiness() never
   * reads this (it must stay clock-free), it's for UI "checked X ago"
   * copy. */
  checkedAt: string;
}

/** How often screenshots can be manually re-captured via the "Refresh
 * screenshots" action — real ScreenshotOne cost, so kept deliberately
 * infrequent. Shared by the server action that enforces it
 * (app/actions/websiteScreenshots.ts) and the Website page button that
 * shows the honest "available in N days" countdown, so the two can never
 * drift out of sync. */
export const SCREENSHOT_REFRESH_COOLDOWN_DAYS = 30;

/** One other real internal page discovered alongside the homepage — see
 * WebsiteAnalysis.additionalPages. */
export interface ScreenshotCaptureLog {
  /** ISO time the capture ran. */
  at: string;
  /** Real ScreenshotOne requests made (homepage + discovered pages). */
  calls: number;
  /** "auto" = during a scan; "manual" = the Refresh screenshots button. */
  source: "auto" | "manual";
}

export interface WebsiteAnalysisPage {
  /** Human-readable label for the UI (e.g. "Services", "About",
   * "Contact"), derived from the real nav link text or, failing that,
   * the URL's path segment — never invented. */
  label: string;
  /** The real, discovered page URL (absolute). */
  url: string;
  /** Public URL of a real captured screenshot of this page. null = the
   * capture failed or was blocked — shown honestly, not guessed. */
  screenshotUrl: string | null;
  /** This page's own HTTP status as ScreenshotOne saw it (Step 2d). */
  httpStatus?: number | null;
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export type CategoryId = "visibility" | "completeness" | "website";

/**
 * The data a score is computed from. This intentionally mirrors what a
 * saved business (Google Places data) can supply, plus a couple of
 * fields we don't collect yet (see the comments below) so the engine is
 * ready for them without needing to change shape later.
 *
 * A field being `null` always means "Google didn't give us this" (or,
 * for count-like fields, a real verified zero — see each field's
 * comment). It never means "unknown" in a way that should be scored as
 * a failure — that distinction is handled per-check via Confidence.
 */
export interface BusinessScoringInput {
  /**
   * Star rating 0–5 as returned by Google. null = Google returned no
   * rating — see visibility.rating's evaluate() for how this combines
   * with reviewCount to distinguish "confirmed no reviews, so no rating
   * exists" (scored) from a genuinely inconsistent response (excluded).
   */
  rating: number | null;
  /**
   * Total review count. A saved business only reaches this input after
   * a real, successful Places fetch that always requests this field, so
   * null here means the same thing as an explicit 0: Google confirmed
   * there's no count to report. Both are treated identically by
   * visibility.review_count and visibility.rating below — a real,
   * scored weakness, never excluded as unknown.
   */
  reviewCount: number | null;
  /**
   * Days since the most recent review, as of when this input was
   * captured. This is a plain number (not a Date) on purpose: the
   * scoring engine must never read the system clock, so "how recent"
   * has to be computed once, outside the engine, at data-collection
   * time, and frozen into the input. null = not collected — the
   * current Google Places integration doesn't fetch per-review
   * timestamps, so this is always null today. Wiring it up later (via
   * the Places `reviews` field) will activate the check automatically.
   */
  mostRecentReviewDaysAgo: number | null;

  /** Phone number on the Google listing. null = not on file. */
  phone: string | null;
  /** Formatted address on the Google listing. null = not on file. */
  address: string | null;
  /** Weekday hours descriptions. null/empty = not on file. */
  openingHours: string[] | null;
  /** Website URL on the Google listing (same field the Website category evaluates). */
  website: string | null;
  /**
   * Whether the website actually serves HTTPS, from a real network
   * probe — see HttpsCheckStatus above. null = not yet checked (either
   * this business has never been saved/re-saved since the probe was
   * added, or it has no website to check). Never inferred from the
   * `website` string's scheme.
   */
  httpsStatus: HttpsCheckStatus | null;
  /**
   * Category/type strings from Google (e.g. `types`). null/empty =
   * Google returned no category list.
   */
  categories: string[] | null;
  /**
   * A single primary category label, when Google gives us one even
   * without a full `categories` list (Places' `primaryTypeDisplayName`).
   */
  primaryCategory: string | null;
  /**
   * Number of photos on the listing. null = Google didn't return a
   * photos field at all (data not collected). 0 = verified, listing
   * has no photos.
   */
  photoCount: number | null;
  /** Google's businessStatus enum, e.g. "OPERATIONAL". null = not returned. */
  businessStatus: string | null;
  /**
   * The frozen result of a real, server-side analysis of this
   * business's live website — see WebsiteAnalysis above. null = never
   * analyzed (no website, or a row saved before this analysis existed).
   * Feeds website.performance_mobile/content_depth/contact_conversion
   * below; never re-derived or estimated inside this module.
   */
  websiteAnalysis: WebsiteAnalysis | null;
  /**
   * Real owner overrides on specific website.notice_freshness/
   * info_consistency findings — see WebsiteTrustOverride's own doc.
   * null/undefined/empty = no overrides on file, the honest default for
   * every business today. Optional (not just nullable) for the same
   * reason as WebsiteAnalysis.websiteTrust — avoids a mass fixture
   * update across every existing test.
   */
  websiteTrustOverrides?: WebsiteTrustOverride[] | null;
  /**
   * A real website found and verified separately from the Google
   * listing (by phone or address match, never a directory/marketplace
   * — see lib/websiteTrust.ts's compareListingInfo) — the real Bánh Mì
   * Boy case: no website on the listing at all, but banhmiboy.com's own
   * page states the exact same phone number. Read by website.has_website
   * only; website.listing_link never counts this — the listing itself
   * still shows nothing. Today this is set manually (no automated
   * web-search step exists in the scan pipeline); null/undefined means
   * none on file. Optional for the same mass-fixture reason as above.
   */
  verifiedElsewhereUrl?: string | null;
  /** The business's own IANA time zone — display only (the date in an
   * explanation like "measured on Oct 3"); never changes any points.
   * Set by server callers via lib/businessTimeZone.ts; omitted = New York. */
  timeZone?: string | null;
}

/** A single check's result, always expressed on the same 0–100 point scale as the total. */
export interface CheckResult {
  id: string;
  label: string;
  category: CategoryId;
  /** This check's maximum possible contribution to the 0–100 total. */
  maxPoints: number;
  /**
   * Points earned toward maxPoints. Always `null` when confidence is
   * UNCERTAIN or NOT_FOUND — never a numeric zero — so callers can't
   * accidentally sum it in as a failure.
   */
  earnedPoints: number | null;
  confidence: Confidence;
  /** Human-readable explanation of why the check earned what it earned. */
  explanation: string;
  /** Optional machine-readable detail about HOW this check's value was
   * determined — currently set only by website.performance_mobile
   * (`{ method: "field" | "lab" }`), read by lib/scoreChanges.ts to tell
   * a genuine speed change apart from a change caused purely by
   * switching measurement method between two scans. null for every
   * other check, and for performance_mobile itself whenever it's
   * NOT_FOUND (nothing was actually measured). */
  meta: Record<string, string> | null;
  /** Step 2d: set ONLY when this check was excluded because we couldn't
   * reach the site (bot-blocked, timed out, down/HTTP error, JavaScript-
   * only, or an error page shown to automated checks) — never for "not
   * checked yet" or "nothing to compare". Drives the "Based on {n} of
   * {total} website checks" note. */
  excludedReason?: "unreachable" | "not_checked_yet";
  /** Day 4 Step 3: what exactly is missing, as stable codes (e.g.
   * content depth "viewport"/"meta", contact "contact"/"cta", has-website
   * "missing"/"directory"/"listing_broken"). Drives per-item advice and
   * the fix labels (lib/websiteFixes.ts); never changes points. Absent
   * when nothing specific applies, and on breakdowns saved before. */
  gaps?: string[];
}

export interface CategoryResult {
  id: CategoryId;
  label: string;
  /** This category's full weight in the 0–100 total (40/30/30 in v1). */
  weight: number;
  /** Sum of maxPoints across this category's determinable (VERIFIED/LIKELY) checks. */
  possiblePoints: number;
  /** Sum of earnedPoints across this category's determinable checks. */
  earnedPoints: number;
  /**
   * This category's own 0–100 score, based only on determinable checks.
   * `null` if literally nothing in the category could be determined
   * (a theoretical edge case — every category has at least one check
   * whose presence/absence is always knowable).
   */
  relativeScore: number | null;
  checks: CheckResult[];
}

export interface ScoreBreakdown {
  scoringVersion: string;
  /** Final 0–100 score, rounded to the nearest whole number. */
  total: number;
  grade: Grade;
  categories: CategoryResult[];
  /** Flat list of every check, in CHECKS order — convenient for tables/exports. */
  checks: CheckResult[];
}

export interface Suggestion {
  checkId: string;
  category: CategoryId;
  label: string;
  /**
   * Exactly (check.maxPoints - check.earnedPoints) for the check this
   * suggestion came from — never a hand-written number. See
   * generateSuggestions() below.
   */
  promisedPoints: number;
  /** Actionable copy describing what to do. */
  advice: string;
}

export interface ScoreWithSuggestions {
  breakdown: ScoreBreakdown;
  suggestions: Suggestion[];
  /**
   * The exact input you'd have if every current suggestion were acted
   * on. Produced by applying each losing check's own simulateFix to a
   * copy of the input — nothing hand-tuned.
   */
  projectedInput: BusinessScoringInput;
  /**
   * scoreBusiness(projectedInput) — literally re-running the same
   * scoring function on the projected input, not an estimate built by
   * summing promised points. See the guarantee test in scoring.test.ts.
   */
  projectedBreakdown: ScoreBreakdown;
}

// ---------------------------------------------------------------------------
// Category weights (must sum to 100; a test asserts this stays true)
// ---------------------------------------------------------------------------

/** Values are i18n MessageKeys, not literal display text — resolve via
 * t(locale, CATEGORY_LABELS[id]) at every read site (see scoreBusiness()
 * below and lib/assistant.ts's two direct readers). Never read this
 * record's values directly as English. */
export const CATEGORY_LABELS: Record<CategoryId, MessageKey> = {
  visibility: "content.categories.visibility",
  completeness: "content.categories.completeness",
  website: "content.categories.website",
};

/** website stays at its original 30 (Oct 10 revision): the 4 new
 * site-trust checks were fit INSIDE the existing 30 rather than growing
 * the category — website.performance_mobile gave up 4 of its 10 points
 * (now 6) to make room, and the 4 new checks themselves are
 * deliberately light (security=2, info_consistency=1,
 * notice_freshness=0.5, site_freshness=0.5 — 4 points total) since a
 * hacked/stale/abandoned site is real, important evidence but
 * shouldn't swing the Website category's own internal balance the way
 * an earlier draft's 8/4/3/3 split would have. See
 * ~/Desktop/website-trust-dry-run.md for the real effect across all 53
 * businesses. These three weights are never required to sum to 100 —
 * the real total (see scoreBusiness's own renormalization) always
 * divides by whatever they actually sum to. (The separate, pre-existing
 * completeness.website_link check is "the honest 'does the listing show
 * a URL, period' fact" the Oct 10 proposal calls "Website link on
 * listing" — it already lived in Completeness, not Website, before this
 * session; see its own doc for the Oct 10 broken-link addition.) */
export const CATEGORY_WEIGHTS: Record<CategoryId, number> = {
  visibility: 40,
  completeness: 30,
  website: 30,
};

// ---------------------------------------------------------------------------
// Grade thresholds — tunable, checked in order, first match wins.
// ---------------------------------------------------------------------------

// Exported read-only so UI copy explaining "what does grade X mean" can
// read the real ranges instead of hand-copying them somewhere else and
// risking drift if these ever change. Purely a data export — the
// thresholds and the logic that uses them are unchanged.
export const GRADE_THRESHOLDS: ReadonlyArray<{ grade: Grade; min: number }> = [
  { grade: "A", min: 90 },
  { grade: "B", min: 80 },
  { grade: "C", min: 70 },
  { grade: "D", min: 60 },
  { grade: "F", min: 0 },
];

export function gradeFromTotal(total: number): Grade {
  return GRADE_THRESHOLDS.find((t) => total >= t.min)!.grade;
}

// ---------------------------------------------------------------------------
// Scoring curves — the "how many points does this raw value earn" math.
// Kept as small, named, pure functions so each one is independently
// testable and each constant is easy to find and tune.
// ---------------------------------------------------------------------------

/**
 * Star rating → fraction of that check's points, as a piecewise-linear
 * curve. Ratings below ~3.0 fall off fast (a genuinely bad rating should
 * hurt), and the curve tops out at 4.9 rather than a perfect 5.0 so a
 * couple of stray reviews don't make "great" and "flawless" behave
 * identically. Deliberately demanding in the middle of the range too — a
 * 4.0 (0.55) or even a 4.5 (0.8) is real, visible room to improve, not a
 * near-full score, so only businesses that are genuinely excellent land
 * in the 90s+ on this check.
 */
const RATING_CURVE: Array<[rating: number, fraction: number]> = [
  [0, 0],
  [3.0, 0.15],
  [3.5, 0.35],
  [4.0, 0.55],
  [4.3, 0.68],
  [4.5, 0.8],
  [4.7, 0.9],
  [4.9, 1.0],
];

function ratingFraction(rating: number): number {
  const r = Math.max(0, Math.min(5, rating));
  for (let i = 0; i < RATING_CURVE.length - 1; i++) {
    const [r0, f0] = RATING_CURVE[i];
    const [r1, f1] = RATING_CURVE[i + 1];
    if (r <= r1) {
      if (r <= r0) return f0;
      const t = (r - r0) / (r1 - r0);
      return f0 + t * (f1 - f0);
    }
  }
  return 1;
}

/**
 * How many reviews it takes before we fully trust a business's star
 * rating. A 5.0 average from a handful of reviews could easily be
 * friends and employees — it isn't the same claim as a 5.0 from dozens
 * of independent customers. This is deliberately a LOWER bar than
 * REVIEW_COUNT_SATURATION: the review-count check separately measures
 * "how much social proof volume do you have" (full credit needs ~150),
 * while this measures "how much do we trust the star number itself" —
 * that only needs enough reviews to rule out a small, unrepresentative
 * sample, not the same volume a strong reputation requires.
 */
const RATING_CONFIDENCE_FULL_AT_REVIEWS = 40;

/**
 * Review count → confidence multiplier applied to the rating check's
 * earned points (see visibility.rating below), as a piecewise-linear
 * curve mirroring RATING_CURVE's style. Clearly discounted under ~15
 * reviews, ramping smoothly (no cliffs) to full trust by
 * RATING_CONFIDENCE_FULL_AT_REVIEWS. This is a genuinely different axis
 * from the review-count check's own curve — a business can lose points
 * on both for the same underlying "not enough reviews yet" weakness,
 * which is honest: a thin sample really does hurt both how much we
 * trust the star value AND how much social proof it represents.
 */
const RATING_CONFIDENCE_CURVE: Array<[reviewCount: number, factor: number]> = [
  [0, 0.3],
  [5, 0.4],
  [10, 0.55],
  [15, 0.68],
  [25, 0.85],
  [RATING_CONFIDENCE_FULL_AT_REVIEWS, 1.0],
];

function ratingConfidenceFactor(reviewCount: number | null): number {
  // No review count on file at all means we have no evidence backing the
  // star value — treat it the same as zero reviews rather than assuming
  // it's trustworthy.
  const c = Math.max(0, reviewCount ?? 0);
  for (let i = 0; i < RATING_CONFIDENCE_CURVE.length - 1; i++) {
    const [c0, f0] = RATING_CONFIDENCE_CURVE[i];
    const [c1, f1] = RATING_CONFIDENCE_CURVE[i + 1];
    if (c <= c1) {
      if (c <= c0) return f0;
      const t = (c - c0) / (c1 - c0);
      return f0 + t * (f1 - f0);
    }
  }
  return 1;
}

/**
 * Review count at which this check reaches full points. A square-root
 * curve still gives diminishing returns (5 to 50 reviews matters far more
 * than 500 to 545 would), but rises much more steeply than a log curve
 * would at the low end, so a handful of reviews only earns a small
 * fraction of credit instead of nearly half — full credit genuinely
 * requires sustained review volume, not just a few happy customers.
 */
const REVIEW_COUNT_SATURATION = 150;

function reviewCountFraction(count: number): number {
  const c = Math.max(0, count);
  return Math.min(1, Math.sqrt(c / REVIEW_COUNT_SATURATION));
}

/** Below this many visible characters, a page reads as a bare single
 * block (a default landing-page template, "under construction," etc.)
 * and earns no content-depth credit for length. */
const THIN_CONTENT_CHARS = 100;
/** At or above this many visible characters, a page has genuinely
 * substantial content and earns full length credit — picked well below
 * a real multi-section small-business site's typical length so this
 * isn't a hard ceiling businesses realistically can't clear. */
const FULL_CONTENT_CHARS = 600;

function contentLengthFraction(chars: number): number {
  const c = Math.max(0, chars);
  if (c <= THIN_CONTENT_CHARS) return 0;
  if (c >= FULL_CONTENT_CHARS) return 1;
  return (c - THIN_CONTENT_CHARS) / (FULL_CONTENT_CHARS - THIN_CONTENT_CHARS);
}

/** A review within this many days counts as fully "recent." */
const RECENCY_FULL_CREDIT_DAYS = 90;
/** No review within this many days earns zero recency credit. */
const RECENCY_ZERO_CREDIT_DAYS = 730;

function recencyFraction(daysAgo: number): number {
  const d = Math.max(0, daysAgo);
  if (d <= RECENCY_FULL_CREDIT_DAYS) return 1;
  if (d >= RECENCY_ZERO_CREDIT_DAYS) return 0;
  return (
    1 -
    (d - RECENCY_FULL_CREDIT_DAYS) /
      (RECENCY_ZERO_CREDIT_DAYS - RECENCY_FULL_CREDIT_DAYS)
  );
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

// ---------------------------------------------------------------------------
// Check definitions — THE config. Every category weight and per-check
// point value lives here. `evaluate` scores a check from real input
// data; `simulateFix` returns the minimal input change that would make
// this exact check earn full points, and is what powers the
// suggestion→projected-score guarantee (see generateSuggestions below).
// ---------------------------------------------------------------------------

interface CheckDefinition {
  id: string;
  /** i18n key for this check's display label — see content.checks.<id>.label. */
  labelKey: MessageKey;
  category: CategoryId;
  maxPoints: number;
  /** i18n key for the copy shown on a suggestion generated from this
   * check while it's losing points — see content.checks.<id>.advice. */
  adviceKey: MessageKey;
  /** v1.9.0: used instead of adviceKey when the check earned SOME but
   * not all of its points (e.g. a brief About section scoring 0.5) —
   * "add an About page" is the wrong advice when one already exists. */
  partialAdviceKey?: MessageKey;
  /** Day 4 Step 3: advice per missing item (CheckResult.gaps) — when a
   * check reports gaps, only the advice for those gaps is shown. */
  gapAdviceKeys?: Partial<Record<string, MessageKey>>;
  evaluate(
    input: BusinessScoringInput,
    locale: Locale
  ): {
    earnedPoints: number | null;
    confidence: Confidence;
    explanation: string;
    /** See CheckResult.meta's own doc — omitted (defaults to null) by
     * every check except website.performance_mobile. */
    meta?: Record<string, string> | null;
    /** See CheckResult.gaps. */
    gaps?: string[];
  };
  simulateFix(input: BusinessScoringInput): BusinessScoringInput;
}

// Visibility's two data-driven checks (rating, review count) share their
// point ceiling between `maxPoints` below and the `* N` multiplier inside
// each check's own `evaluate` — named here so a future rebalance can't
// repeat the bug where only one of the two got updated.
const RATING_CHECK_MAX_POINTS = 16;
const REVIEW_COUNT_CHECK_MAX_POINTS = 18;

/**
 * website.performance_mobile's points for real-user field data (Google's
 * coarse FAST/AVERAGE/SLOW classification), on the check's own 5-point
 * scale (Oct 10 revision: 10 -> 6 to make room for the site-trust checks;
 * Step 2d: 6 -> 5 for website.social_links — always the same original
 * 10/6/2 proportions, i.e. 100% / 60% / 20%, never re-derived):
 *
 * - FAST -> 5 (full points): FAST is Google's TOP real-user category —
 *   real visitors' actual phones, over a real 28-day window, confirming
 *   this site is genuinely fast. That's at least as strong a claim as a
 *   single perfect (100/100) simulated lab run, so a fast site backed by
 *   real visitor data must be able to earn full points exactly like a
 *   perfect lab result — never capped below it just for being measured a
 *   different, more accurate way.
 * - AVERAGE -> 3.6: CrUX's "AVERAGE" ("needs improvement") lines up with
 *   the lab "slowish" band; same reasoning as before (stay on the
 *   cautious side of "needs improvement," never rounding a middling
 *   result up toward "fast"), just scaled to the new 6-point ceiling.
 * - SLOW -> 1.2: CrUX's "SLOW" ("poor") lines up with the lab "slow"
 *   band; same reasoning as before, scaled to the new ceiling.
 */
// Step 2d: mobile speed is worth 5 (was 6) to make room for the new
// 1-point website.social_links — same proportions (100% / 60% / 20%).
const MOBILE_SPEED_MAX_POINTS = 5;
const FIELD_CATEGORY_POINTS: Record<FieldSpeedCategory, number> = {
  FAST: 5,
  AVERAGE: 3,
  SLOW: 1,
};

const FIELD_CATEGORY_LABEL_KEYS: Record<FieldSpeedCategory, MessageKey> = {
  FAST: "content.checks.website.performance_mobile.fieldCategory.fast",
  AVERAGE: "content.checks.website.performance_mobile.fieldCategory.average",
  SLOW: "content.checks.website.performance_mobile.fieldCategory.slow",
};

/** A fully-good WebsiteAnalysis, used only by the Website quality checks'
 * simulateFix (mirrors PLACEHOLDER_HOURS's role below) — never shown to
 * a real business, only fed through scoreBusiness() to prove the
 * suggestion→projected-score guarantee for these checks. */
const PERFECT_WEBSITE_ANALYSIS: WebsiteAnalysis = {
  content: {
    hasTitle: true,
    hasMetaDescription: true,
    hasViewportTag: true,
    headingCount: 4,
    visibleTextLength: FULL_CONTENT_CHARS,
    hasPhoneLink: true,
    hasEmailLink: true,
    hasCtaText: true,
    socialProfiles: [{ platform: "Instagram", url: "instagram.com/example" }],
    isLikelyClientRenderedShell: false,
    renderedContentSignals: null,
  },
  mobilePerformance: { method: "lab", fieldCategory: null, labScore: 100 },
  mobilePerformanceFailureReason: null,
  contentFetchFailureReason: null,
  httpsUnreachableReason: null,
  screenshotUrl: null,
  additionalPages: [],
  lastScreenshotRefreshAt: null,
  aboutPresence: { state: "found", url: "https://example.com/about", locatedOnHomepage: false, reason: null, note: null },
  servicesPresence: { state: "found", url: "https://example.com/services", locatedOnHomepage: false, reason: null, note: null },
  websiteTrust: {
    spamSignals: [],
    safeBrowsingThreat: null,
    safeBrowsingChecked: true,
    infoConflicts: [
      { field: "phone", comparison: "matches", siteValue: "555-5555", googleValue: "555-5555" },
      { field: "address", comparison: "matches", siteValue: "123 Main St", googleValue: "123 Main St" },
      { field: "hours", comparison: "matches", siteValue: "see site", googleValue: "see listing" },
    ],
    staleNotices: [],
    abandonedSignals: { newestDateFound: new Date().toISOString().slice(0, 10), templateLeftovers: [], looksAbandoned: false },
    websiteKind: "independent",
    listingLinkBroken: false,
    checkedAt: new Date(0).toISOString(),
  },
  checkedAt: new Date(0).toISOString(),
};

/** Curated, specific action phrases — not generic verbs like "learn
 * more" that a thin page could contain incidentally — used by
 * lib/websiteContentAnalysis.ts to detect a genuine call-to-action.
 * Exported so that module (and its tests) share this single list rather
 * than each keeping its own copy. */
export const WEBSITE_CTA_PHRASES: string[] = [
  "book now",
  "book an appointment",
  "book online",
  "make an appointment",
  "schedule an appointment",
  "schedule now",
  "schedule a consultation",
  "order now",
  "order online",
  "contact us",
  "get a quote",
  "request a quote",
  "call now",
  "buy now",
  "shop now",
  "reserve a table",
  "reserve now",
  "get started",
  "sign up now",
  "request an appointment",
];

const PLACEHOLDER_HOURS = [
  "Monday: 9:00 AM – 5:00 PM",
  "Tuesday: 9:00 AM – 5:00 PM",
  "Wednesday: 9:00 AM – 5:00 PM",
  "Thursday: 9:00 AM – 5:00 PM",
  "Friday: 9:00 AM – 5:00 PM",
];

/**
 * Whether this business has a real website to analyze and score — the
 * listing's own URL, OR a real site verified elsewhere by phone/address
 * match (verifiedElsewhereUrl — the real Bánh Mì Boy case). A verified-
 * elsewhere site is scored exactly like a listing website by every
 * website.* quality check; only completeness.website_link (which reflects
 * the LISTING's own URL state) still ignores it.
 */
export function hasAnalyzableWebsite(input: BusinessScoringInput): boolean {
  return isRealWebsite(input.website) || isRealWebsite(input.verifiedElsewhereUrl);
}

/** v1.11.0: an address that is a website at all — a Facebook/Instagram/
 * Linktree/Yelp/ordering page is not (socialPagePlatform). */
export function isRealWebsite(url: string | null | undefined): boolean {
  return !!url && url.trim().length > 0 && socialPagePlatform(url) === null;
}

/** Step 2d: our own plain fetch couldn't access the site — it was
 * bot-blocked, or the site showed automated checks an error page (see
 * WebsiteTrustAnalysis.automatedErrorPageUrl). Exported for the Website
 * page's row wording. */
export function siteBlocksAutomatedChecks(input: Pick<BusinessScoringInput, "websiteAnalysis">): boolean {
  const a = input.websiteAnalysis;
  return a?.contentFetchFailureReason === "blocked_automated_check" || !!a?.websiteTrust?.automatedErrorPageUrl;
}

/**
 * Step 2d: when the latest scan couldn't load the page itself (blocked
 * by a bot check, timed out, down, or an HTTP error), every check that
 * reads the page's content has nothing real to judge — its trust data
 * was computed from no page at all, so an empty finding list is NOT a
 * clean result. Such checks return this "couldn't check" result with the
 * real stored reason (the same sentence the About/Services rows use),
 * excluded from scoring — never a pass. Null when the page loaded.
 */
function pageCouldntBeChecked(input: BusinessScoringInput, locale: Locale): ReturnType<CheckDefinition["evaluate"]> | null {
  const reason = input.websiteAnalysis?.contentFetchFailureReason ?? null;
  if (!reason) return null;
  return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, reachabilityReasonMessageKey(reason)) };
}

/**
 * Step 2d: the page-content trust checks also can't judge a
 * JavaScript-only site (the real Goldberg Hardware case) — our static
 * fetch only sees an empty app shell, so an empty finding list there is
 * NOT a pass. Couldn't check, excluded. Checked after a fetch failure,
 * whose own reason sentence takes precedence.
 */
function pageContentUnreadable(input: BusinessScoringInput, locale: Locale): ReturnType<CheckDefinition["evaluate"]> | null {
  const fetchFailure = pageCouldntBeChecked(input, locale);
  if (fetchFailure) return fetchFailure;
  if (input.websiteAnalysis?.content?.isLikelyClientRenderedShell) {
    return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.trust.explanation.javascriptOnly") };
  }
  return null;
}

export const CHECKS: CheckDefinition[] = [
  // --- Visibility & Reputation (40 pts) ------------------------------------
  {
    id: "visibility.rating",
    labelKey: "content.checks.visibility.rating.label",
    category: "visibility",
    maxPoints: RATING_CHECK_MAX_POINTS,
    adviceKey: "content.checks.visibility.rating.advice",
    evaluate(input, locale) {
      if (input.rating === null) {
        // Same reasoning as visibility.review_count: a successfully
        // fetched listing with zero reviews genuinely has no rating to
        // compute — that's a confirmed fact, not a data gap, and scores
        // as a real zero. Only when reviews genuinely exist (a positive
        // confirmed count) but rating is still missing is that a truly
        // inconsistent response we can't honestly explain — that stays
        // excluded.
        const reviewCount = input.reviewCount ?? 0;
        if (reviewCount === 0) {
          return {
            earnedPoints: 0,
            confidence: "VERIFIED",
            explanation: t(locale, "content.checks.visibility.rating.explanation.noReviews"),
          };
        }
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.visibility.rating.explanation.notFound"),
        };
      }
      const ratingFrac = ratingFraction(input.rating);
      const confidenceFactor = ratingConfidenceFactor(input.reviewCount);
      const earnedPoints = roundTo(ratingFrac * confidenceFactor * RATING_CHECK_MAX_POINTS, 1);
      const fullConfidence = confidenceFactor >= 1;

      let explanation: string;
      if (input.reviewCount === null) {
        explanation = t(locale, "content.checks.visibility.rating.explanation.noReviewCountBackup", {
          rating: input.rating.toFixed(1),
        });
      } else if (!fullConfidence) {
        explanation = tPlural(
          locale,
          "content.checks.visibility.rating.explanation.lowConfidence",
          input.reviewCount,
          { rating: input.rating.toFixed(1) }
        );
      } else {
        explanation = t(locale, "content.checks.visibility.rating.explanation.confident", {
          rating: input.rating.toFixed(1),
        });
      }

      return { earnedPoints, confidence: "VERIFIED", explanation };
    },
    // Full points require both a strong star value AND enough reviews to
    // trust it — reviewCount is only raised if it's currently below the
    // confidence threshold, never lowered, so this stays the minimal
    // change that guarantees this exact check reaches full points.
    simulateFix: (input) => ({
      ...input,
      rating: 4.9,
      reviewCount: Math.max(input.reviewCount ?? 0, RATING_CONFIDENCE_FULL_AT_REVIEWS),
    }),
  },
  {
    id: "visibility.review_count",
    labelKey: "content.checks.visibility.review_count.label",
    category: "visibility",
    maxPoints: REVIEW_COUNT_CHECK_MAX_POINTS,
    adviceKey: "content.checks.visibility.review_count.advice",
    evaluate(input, locale) {
      // A saved business only ever reaches scoring after a real,
      // successful Places fetch — we always request this field, and
      // Google always either returns the real count or omits it because
      // the true count is zero (there's no other reason a listing we
      // successfully fetched would lack it). So null here is a
      // CONFIRMED zero, not missing data: it gets scored low, same as
      // an explicit 0, never excluded.
      const reviewCount = input.reviewCount ?? 0;
      const fraction = reviewCountFraction(reviewCount);
      return {
        earnedPoints: roundTo(fraction * REVIEW_COUNT_CHECK_MAX_POINTS, 1),
        confidence: "VERIFIED",
        explanation:
          reviewCount === 0
            ? t(locale, "content.checks.visibility.review_count.explanation.zero")
            : tPlural(locale, "content.checks.visibility.review_count.explanation.nonzero", reviewCount, {
                saturation: REVIEW_COUNT_SATURATION,
              }),
      };
    },
    simulateFix: (input) => ({ ...input, reviewCount: REVIEW_COUNT_SATURATION }),
  },
  {
    id: "visibility.review_recency",
    labelKey: "content.checks.visibility.review_recency.label",
    category: "visibility",
    maxPoints: 6,
    adviceKey: "content.checks.visibility.review_recency.advice",
    evaluate(input, locale) {
      if (input.mostRecentReviewDaysAgo === null) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.visibility.review_recency.explanation.notCollected"),
        };
      }
      const fraction = recencyFraction(input.mostRecentReviewDaysAgo);
      return {
        earnedPoints: roundTo(fraction * 6, 1),
        confidence: "VERIFIED",
        explanation: t(locale, "content.checks.visibility.review_recency.explanation.recent", {
          days: input.mostRecentReviewDaysAgo,
        }),
      };
    },
    simulateFix: (input) => ({ ...input, mostRecentReviewDaysAgo: 0 }),
  },

  // --- Google Listing Completeness (30 pts) --------------------------------
  {
    id: "completeness.phone",
    labelKey: "content.checks.completeness.phone.label",
    category: "completeness",
    maxPoints: 4,
    adviceKey: "content.checks.completeness.phone.advice",
    evaluate(input, locale) {
      const has = !!input.phone && input.phone.trim().length > 0;
      return {
        earnedPoints: has ? 4 : 0,
        confidence: "VERIFIED",
        explanation: t(
          locale,
          has ? "content.checks.completeness.phone.explanation.present" : "content.checks.completeness.phone.explanation.missing"
        ),
      };
    },
    simulateFix: (input) => ({ ...input, phone: "+1-555-000-0000" }),
  },
  {
    id: "completeness.address",
    labelKey: "content.checks.completeness.address.label",
    category: "completeness",
    maxPoints: 4,
    adviceKey: "content.checks.completeness.address.advice",
    evaluate(input, locale) {
      const has = !!input.address && input.address.trim().length > 0;
      return {
        earnedPoints: has ? 4 : 0,
        confidence: "VERIFIED",
        explanation: t(
          locale,
          has
            ? "content.checks.completeness.address.explanation.present"
            : "content.checks.completeness.address.explanation.missing"
        ),
      };
    },
    simulateFix: (input) => ({ ...input, address: "123 Main St" }),
  },
  {
    id: "completeness.hours",
    labelKey: "content.checks.completeness.hours.label",
    category: "completeness",
    maxPoints: 4,
    adviceKey: "content.checks.completeness.hours.advice",
    evaluate(input, locale) {
      const has = !!input.openingHours && input.openingHours.length > 0;
      return {
        earnedPoints: has ? 4 : 0,
        confidence: "VERIFIED",
        explanation: t(
          locale,
          has
            ? "content.checks.completeness.hours.explanation.present"
            : "content.checks.completeness.hours.explanation.missing"
        ),
      };
    },
    simulateFix: (input) => ({ ...input, openingHours: PLACEHOLDER_HOURS }),
  },
  {
    id: "completeness.website_link",
    labelKey: "content.checks.completeness.website_link.label",
    category: "completeness",
    maxPoints: 4,
    adviceKey: "content.checks.completeness.website_link.advice",
    // The honest "does the Google listing itself show a website URL,
    // period" fact — kept deliberately separate from website.has_website
    // (which asks "is it a real, verified site," and can score full
    // marks via verifiedElsewhereUrl even when THIS check stays 0 — the
    // real Bánh Mì Boy case). Oct 10 addition: a listed URL that loads
    // fine but reads as a genuine "Page Not Found" (see
    // looksLikePageNotFound, lib/websiteTrust.ts — the real Wonder The
    // Grove Newark case) now also scores 0 here, since the link itself
    // doesn't actually work for a visitor.
    evaluate(input, locale) {
      const has = !!input.website && input.website.trim().length > 0;
      if (!has) {
        return { earnedPoints: 0, confidence: "VERIFIED", explanation: t(locale, "content.checks.completeness.website_link.explanation.missing") };
      }
      const trust = input.websiteAnalysis?.websiteTrust;
      if (trust?.listingLinkBroken) {
        return {
          earnedPoints: 0,
          confidence: "VERIFIED",
          explanation: trust.listingLinkErrorPageUrl
            ? t(locale, "content.checks.completeness.website_link.explanation.brokenErrorPage", { url: trust.listingLinkErrorPageUrl })
            : t(locale, "content.checks.completeness.website_link.explanation.broken"),
        };
      }
      return { earnedPoints: 4, confidence: "VERIFIED", explanation: t(locale, "content.checks.completeness.website_link.explanation.present") };
    },
    // A broken listing link (Step 2d) is fixed too — the fix is a working link.
    simulateFix: (input) => ({
      ...input,
      website: "https://example.com",
      websiteAnalysis: input.websiteAnalysis?.websiteTrust
        ? {
            ...input.websiteAnalysis,
            websiteTrust: { ...input.websiteAnalysis.websiteTrust, listingLinkBroken: false, listingLinkErrorPageUrl: null },
          }
        : input.websiteAnalysis,
    }),
  },
  {
    id: "completeness.categories",
    labelKey: "content.checks.completeness.categories.label",
    category: "completeness",
    maxPoints: 4,
    adviceKey: "content.checks.completeness.categories.advice",
    evaluate(input, locale) {
      if (input.categories && input.categories.length > 0) {
        return {
          earnedPoints: 4,
          confidence: "VERIFIED",
          explanation: tPlural(
            locale,
            "content.checks.completeness.categories.explanation.hasList",
            input.categories.length
          ),
        };
      }
      if (input.primaryCategory) {
        // We only have a single primary label, not the fuller category
        // list — a real signal, just a less direct one.
        return {
          earnedPoints: roundTo(4 * 0.75, 1),
          confidence: "LIKELY",
          explanation: t(locale, "content.checks.completeness.categories.explanation.primaryOnly", {
            category: input.primaryCategory,
          }),
        };
      }
      return {
        earnedPoints: 0,
        confidence: "VERIFIED",
        explanation: t(locale, "content.checks.completeness.categories.explanation.none"),
      };
    },
    simulateFix: (input) => ({ ...input, categories: ["placeholder_category"] }),
  },
  {
    id: "completeness.photos",
    labelKey: "content.checks.completeness.photos.label",
    category: "completeness",
    maxPoints: 4,
    adviceKey: "content.checks.completeness.photos.advice",
    evaluate(input, locale) {
      if (input.photoCount === null) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.completeness.photos.explanation.notFound"),
        };
      }
      const has = input.photoCount > 0;
      // Google's own Place Details `photos` field never returns more
      // than GOOGLE_PHOTO_CAP entries — once the real count hits that
      // cap, it's a lower bound, not an exact total, so the explanation
      // must say "or more" rather than implying the listing has exactly
      // this many photos and not one more.
      const atCap = input.photoCount >= GOOGLE_PHOTO_CAP;
      return {
        earnedPoints: has ? 4 : 0,
        confidence: "VERIFIED",
        explanation: has
          ? atCap
            ? t(locale, "content.checks.completeness.photos.explanation.hasAtCap", { cap: GOOGLE_PHOTO_CAP })
            : tPlural(locale, "content.checks.completeness.photos.explanation.has", input.photoCount)
          : t(locale, "content.checks.completeness.photos.explanation.none"),
      };
    },
    simulateFix: (input) => ({ ...input, photoCount: 5 }),
  },
  {
    id: "completeness.business_status",
    labelKey: "content.checks.completeness.business_status.label",
    category: "completeness",
    maxPoints: 6,
    adviceKey: "content.checks.completeness.business_status.advice",
    evaluate(input, locale) {
      if (input.businessStatus === null) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.completeness.business_status.explanation.notFound"),
        };
      }
      if (input.businessStatus === "OPERATIONAL") {
        return {
          earnedPoints: 6,
          confidence: "VERIFIED",
          explanation: t(locale, "content.checks.completeness.business_status.explanation.operational"),
        };
      }
      if (
        input.businessStatus === "CLOSED_TEMPORARILY" ||
        input.businessStatus === "CLOSED_PERMANENTLY"
      ) {
        return {
          earnedPoints: 0,
          confidence: "VERIFIED",
          explanation: t(locale, "content.checks.completeness.business_status.explanation.closed", {
            status: input.businessStatus.replace("_", " ").toLowerCase(),
          }),
        };
      }
      return {
        earnedPoints: null,
        confidence: "UNCERTAIN",
        explanation: t(locale, "content.checks.completeness.business_status.explanation.unrecognized", {
          status: input.businessStatus,
        }),
      };
    },
    simulateFix: (input) => ({ ...input, businessStatus: "OPERATIONAL" }),
  },

  // --- Website (30 pts) -----------------------------------------------------
  // v1.6.0 re-weight: merely having a URL on file used to be worth 20 of
  // these 30 points — a bare, single-block landing page and a fast,
  // complete site scored almost identically. Having a site is now a
  // small base (has_website, below) and the three real, measured
  // quality checks (performance_mobile/content_depth/contact_conversion)
  // carry the actual weight, fed by a real analysis of the live site —
  // see WebsiteAnalysis above and lib/websiteAnalysis.ts for how it's
  // collected (once per save/re-scan, exactly like the HTTPS probe).
  {
    id: "website.has_website",
    labelKey: "content.checks.website.has_website.label",
    category: "website",
    maxPoints: 4,
    adviceKey: "content.checks.website.has_website.advice",
    gapAdviceKeys: {
      social_page: "content.checks.website.has_website.advice.socialPage",
      listing_broken: "content.checks.website.has_website.advice.listingBroken",
      directory: "content.checks.website.has_website.advice.directory",
    },
    // Redefined (Oct 10): full credit for a real, verified site — the
    // listing's own website when it's reachable, loads real content,
    // and isn't a multi-business directory/marketplace (a free-builder
    // address like Google Sites DOES count — see classifyWebsiteKind's
    // own doc; only a true directory never does), OR a real site
    // verified elsewhere by phone/address match (verifiedElsewhereUrl —
    // the real Bánh Mì Boy case: no listing website at all, but
    // banhmiboy.com's own page states the exact same phone number).
    // website.listing_link below is the separate, honest "does the
    // LISTING itself show a URL" fact this check used to conflate with
    // "is there a real site."
    evaluate(input, locale) {
      const hasListingWebsite = !!input.website && input.website.trim().length > 0;
      // v1.11.0: a verified "website" that's itself a social page never counts.
      const verifiedElsewhere = isRealWebsite(input.verifiedElsewhereUrl) ? input.verifiedElsewhereUrl : null;
      // v1.11.0: the listing links to a social/profile page — not a website.
      const listingPlatform = hasListingWebsite ? socialPagePlatform(input.website) : null;
      if (listingPlatform && !verifiedElsewhere) {
        return {
          earnedPoints: 0,
          confidence: "VERIFIED",
          explanation: t(locale, "content.checks.website.has_website.explanation.socialPage", { platform: listingPlatform }),
          gaps: ["social_page"],
          meta: { socialPlatform: listingPlatform },
        };
      }

      if (!hasListingWebsite || listingPlatform) {
        if (verifiedElsewhere) {
          return {
            earnedPoints: 4,
            confidence: "VERIFIED",
            explanation: t(locale, "content.checks.website.has_website.explanation.verifiedElsewhere", { url: verifiedElsewhere }),
          };
        }
        return { earnedPoints: 0, confidence: "VERIFIED", explanation: t(locale, "content.checks.website.has_website.explanation.missing"), gaps: ["missing"] };
      }

      const trust = input.websiteAnalysis?.websiteTrust;
      if (!trust) {
        // No trust data yet (a row from before this detection existed,
        // or this scan's own fetch failed before reaching it) — fall
        // back to the ORIGINAL, simple "a website is on file" credit
        // rather than excluding the whole check. Never regress a
        // business that's always scored full marks here just because
        // the newer kind/broken-link classification hasn't run yet.
        return { earnedPoints: 4, confidence: "VERIFIED", explanation: t(locale, "content.checks.website.has_website.explanation.present") };
      }

      if (trust.listingLinkBroken || trust.websiteKind === "directory") {
        if (verifiedElsewhere) {
          return {
            earnedPoints: 4,
            confidence: "VERIFIED",
            explanation: t(locale, "content.checks.website.has_website.explanation.verifiedElsewhere", { url: verifiedElsewhere }),
          };
        }
        return {
          earnedPoints: 0,
          confidence: "VERIFIED",
          explanation: t(
            locale,
            trust.listingLinkBroken
              ? "content.checks.website.has_website.explanation.listingBroken"
              : "content.checks.website.has_website.explanation.directory"
          ),
          gaps: [trust.listingLinkBroken ? "listing_broken" : "directory"],
        };
      }

      return {
        earnedPoints: 4,
        confidence: "VERIFIED",
        explanation: t(
          locale,
          // Step 2d: the link is on file and scores as before, but the
          // page itself showed automated checks an error page — say we
          // couldn't check it, never that it's broken (the real Wonder case).
          trust.automatedErrorPageUrl
            ? "content.checks.website.has_website.explanation.presentAutomatedErrorPage"
            : trust.websiteKind === "free_builder"
              ? "content.checks.website.has_website.explanation.presentFreeBuilder"
              : "content.checks.website.has_website.explanation.present"
        ),
      };
    },
    // A broken listing link (Step 2d) is fixed too — the fix is a working link.
    simulateFix: (input) => ({
      ...input,
      website: "https://example.com",
      websiteAnalysis: input.websiteAnalysis?.websiteTrust
        ? {
            ...input.websiteAnalysis,
            websiteTrust: { ...input.websiteAnalysis.websiteTrust, listingLinkBroken: false, listingLinkErrorPageUrl: null },
          }
        : input.websiteAnalysis,
    }),
  },
  {
    id: "website.https",
    labelKey: "content.checks.website.https.label",
    category: "website",
    maxPoints: 6,
    adviceKey: "content.checks.website.https.advice",
    evaluate(input, locale) {
      if (!hasAnalyzableWebsite(input)) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.website.https.explanation.noWebsite"),
        };
      }
      if (input.httpsStatus === "https") {
        return {
          earnedPoints: 6,
          confidence: "VERIFIED",
          explanation: t(locale, "content.checks.website.https.explanation.https"),
        };
      }
      if (input.httpsStatus === "http_only") {
        return {
          earnedPoints: 0,
          confidence: "VERIFIED",
          explanation: t(locale, "content.checks.website.https.explanation.httpOnly"),
        };
      }
      // input.httpsStatus is "unreachable" or (more commonly) null — a
      // live check either couldn't complete or hasn't run yet. Either
      // way this is honestly excluded, never scored as a failure just
      // because we lack proof — a failed or missing probe says nothing
      // about whether the site's HTTPS actually works.
      return {
        earnedPoints: null,
        confidence: "NOT_FOUND",
        explanation: t(
          locale,
          input.httpsStatus === "unreachable"
            ? "content.checks.website.https.explanation.unreachable"
            : "content.checks.website.https.explanation.notChecked"
        ),
      };
    },
    simulateFix: (input) => {
      if (!hasAnalyzableWebsite(input)) {
        return { ...input, website: "https://example.com", httpsStatus: "https" };
      }
      return { ...input, httpsStatus: "https" };
    },
  },
  {
    id: "website.performance_mobile",
    labelKey: "content.checks.website.performance_mobile.label",
    category: "website",
    // Gave up 4 points (was 10) to make room for the 4 new site-trust
    // checks inside Website's unchanged 30-point total — see
    // CATEGORY_WEIGHTS' own doc.
    maxPoints: MOBILE_SPEED_MAX_POINTS,
    adviceKey: "content.checks.website.performance_mobile.advice",
    evaluate(input, locale) {
      if (!hasAnalyzableWebsite(input)) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.website.performance_mobile.explanation.noWebsite"),
        };
      }
      if (!input.websiteAnalysis) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.website.performance_mobile.explanation.notAnalyzed"),
        };
      }
      // Step 2d: a site our own fetch can't access (bot-blocked, or one
      // that shows automated checks an error page) — no LAB rating is
      // trusted for it (it would measure the block page), nor a carried-
      // forward lab one. v1.10.0: a REAL-VISITOR rating still counts —
      // real Chrome visitors aren't blocked, so it's genuine (the real
      // Qamaria / Wonder cases). Otherwise couldn't check, excluded,
      // never counted against.
      if (siteBlocksAutomatedChecks(input)) {
        // A real-visitor rating carried forward from a scan within the last
        // 30 days (when this scan's own speed test timed out — see
        // carryForwardMobilePerformance's 30-day limit) counts too, said
        // with its date (the real Blue Bottle case).
        const m = input.websiteAnalysis.mobilePerformance;
        if (m && m.method === "field" && m.fieldCategory) {
          const category = t(locale, FIELD_CATEGORY_LABEL_KEYS[m.fieldCategory]);
          return {
            earnedPoints: FIELD_CATEGORY_POINTS[m.fieldCategory],
            confidence: "VERIFIED",
            explanation:
              m.carriedForward && m.measuredAt
                ? t(locale, "content.checks.website.performance_mobile.explanation.fieldBlockedSiteLastMeasured", {
                    category,
                    date: formatShortDate(m.measuredAt, locale, input.timeZone || undefined),
                  })
                : t(locale, "content.checks.website.performance_mobile.explanation.fieldBlockedSite", { category }),
            meta: { method: "field" },
          };
        }
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.website.performance_mobile.explanation.blockedSite"),
        };
      }
      const measurement = input.websiteAnalysis.mobilePerformance;
      if (!measurement) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.website.performance_mobile.explanation.noScore"),
        };
      }
      // A carried-forward measurement (see carryForwardMobilePerformance)
      // is real data, just not from THIS scan — said honestly as "last
      // measured {date}" instead of the normal field/lab wording, for
      // either method, before either branch below ever runs.
      const lastMeasuredDate =
        measurement.carriedForward && measurement.measuredAt
          ? formatShortDate(measurement.measuredAt, locale, input.timeZone || undefined)
          : null;
      // Real-user field data (Chrome UX Report, either for this exact
      // URL or the site's whole origin — see fetchMobilePerformance in
      // lib/websiteAnalysis.ts) always wins when Google has it: it's
      // real visitors' real phones over a real 28-day window, not one
      // simulated run.
      if (measurement.method === "field" && measurement.fieldCategory) {
        const category = measurement.fieldCategory;
        return {
          earnedPoints: FIELD_CATEGORY_POINTS[category],
          confidence: "VERIFIED",
          explanation: lastMeasuredDate
            ? t(
                locale,
                measurement.carriedForwardReason === "error_page"
                  ? "content.checks.website.performance_mobile.explanation.fieldLastMeasuredErrorPage"
                  : "content.checks.website.performance_mobile.explanation.fieldLastMeasured",
                { category: t(locale, FIELD_CATEGORY_LABEL_KEYS[category]), date: lastMeasuredDate }
              )
            : t(
                locale,
                // Step 2d: whole-site real-visitor data, used because this
                // URL itself opens an error page — said so.
                measurement.fieldScope === "origin"
                  ? "content.checks.website.performance_mobile.explanation.fieldOrigin"
                  : "content.checks.website.performance_mobile.explanation.field",
                { category: t(locale, FIELD_CATEGORY_LABEL_KEYS[category]) }
              ),
          meta: { method: "field" },
        };
      }
      // No field data for this site (too little real traffic for Google
      // to have collected it) — fall back to the honest lab measurement,
      // already computed as the median of 3 independent runs rather
      // than trusting any single one (see MobilePerformanceMeasurement's
      // own doc).
      if (measurement.method === "lab" && measurement.labScore !== null) {
        const score = measurement.labScore;
        return {
          earnedPoints: roundTo((score / 100) * MOBILE_SPEED_MAX_POINTS, 1),
          confidence: "VERIFIED",
          explanation: lastMeasuredDate
            ? t(
                locale,
                measurement.carriedForwardReason === "error_page"
                  ? "content.checks.website.performance_mobile.explanation.labLastMeasuredErrorPage"
                  : "content.checks.website.performance_mobile.explanation.labLastMeasured",
                { score: Math.round(score), date: lastMeasuredDate }
              )
            : t(locale, "content.checks.website.performance_mobile.explanation.lab", {
                score: Math.round(score),
              }),
          meta: { method: "lab" },
        };
      }
      return {
        earnedPoints: null,
        confidence: "NOT_FOUND",
        explanation: t(locale, "content.checks.website.performance_mobile.explanation.noScore"),
      };
    },
    simulateFix: (input) => ({
      ...input,
      website: hasAnalyzableWebsite(input) ? input.website : "https://example.com",
      websiteAnalysis: {
        ...(input.websiteAnalysis ?? PERFECT_WEBSITE_ANALYSIS),
        mobilePerformance: PERFECT_WEBSITE_ANALYSIS.mobilePerformance,
      },
    }),
  },
  {
    id: "website.content_depth",
    labelKey: "content.checks.website.content_depth.label",
    category: "website",
    maxPoints: 5,
    adviceKey: "content.checks.website.content_depth.advice",
    gapAdviceKeys: {
      title: "content.checks.website.content_depth.advice.title",
      meta: "content.checks.website.content_depth.advice.meta",
      viewport: "content.checks.website.content_depth.advice.viewport",
      headings: "content.checks.website.content_depth.advice.headings",
      thin: "content.checks.website.content_depth.advice.thin",
    },
    evaluate(input, locale) {
      if (!hasAnalyzableWebsite(input)) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.website.content_depth.explanation.noWebsite"),
        };
      }
      const content = input.websiteAnalysis?.content ?? null;
      if (!content) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(
            locale,
            input.websiteAnalysis
              ? "content.checks.website.content_depth.explanation.couldntRead"
              : "content.checks.website.content_depth.explanation.notAnalyzed"
          ),
        };
      }
      if (content.isLikelyClientRenderedShell) {
        const recovered = content.renderedContentSignals;
        if (!recovered) {
          return {
            earnedPoints: null,
            confidence: "NOT_FOUND",
            explanation: t(locale, "content.checks.website.content_depth.explanation.clientRenderedShell"),
          };
        }
        // Recovered via Google PageSpeed's real rendered-Chrome Lighthouse
        // audits (see fetchMobilePerformance/PAGESPEED_CSR_RECOVERY_CATEGORIES
        // in lib/websiteAnalysis.ts) instead of our own static fetch, which
        // saw an empty shell. Deliberately capped at the sub-points these
        // audits can actually confirm — title 1 / meta description 1 /
        // viewport 1.5 / headings 1 = 4.5 of 5. No Lighthouse audit measures
        // visible text depth, so the remaining 0.5 "content length" point
        // is never earned here, but also never described as a failure —
        // see the explanation below.
        const titlePts = recovered.hasTitle ? 1 : 0;
        const metaPts = recovered.hasMetaDescription ? 1 : 0;
        const viewportPts = recovered.hasViewportTag ? 1.5 : 0;
        const headingPts = recovered.hasHeadings ? 1 : 0;
        const earnedPoints = roundTo(titlePts + metaPts + viewportPts + headingPts, 1);

        // Each sub-signal is tri-state: true/false is a real Lighthouse-
        // confirmed presence/absence (goes in one of these two honest
        // lists); null means that specific audit wasn't in the response —
        // silently uncredited, never reported as a confirmed failure.
        const confirmedPresent: string[] = [];
        const confirmedMissing: string[] = [];
        if (recovered.hasTitle === true) confirmedPresent.push(t(locale, "content.checks.website.content_depth.explanation.presentTitle"));
        else if (recovered.hasTitle === false) confirmedMissing.push(t(locale, "content.checks.website.content_depth.explanation.missingTitle"));
        if (recovered.hasMetaDescription === true) confirmedPresent.push(t(locale, "content.checks.website.content_depth.explanation.presentMeta"));
        else if (recovered.hasMetaDescription === false) confirmedMissing.push(t(locale, "content.checks.website.content_depth.explanation.missingMeta"));
        if (recovered.hasViewportTag === true) confirmedPresent.push(t(locale, "content.checks.website.content_depth.explanation.presentViewport"));
        else if (recovered.hasViewportTag === false) confirmedMissing.push(t(locale, "content.checks.website.content_depth.explanation.missingViewport"));
        if (recovered.hasHeadings === true) confirmedPresent.push(t(locale, "content.checks.website.content_depth.explanation.presentHeadings"));
        else if (recovered.hasHeadings === false) confirmedMissing.push(t(locale, "content.checks.website.content_depth.explanation.missingHeadings"));

        const explanationParts = [t(locale, "content.checks.website.content_depth.explanation.recoveredBase")];
        if (confirmedPresent.length > 0) {
          explanationParts.push(
            t(locale, "content.checks.website.content_depth.explanation.confirmedPresentTemplate", {
              items: confirmedPresent.join(", "),
            })
          );
        }
        if (confirmedMissing.length > 0) {
          explanationParts.push(
            t(locale, "content.checks.website.content_depth.explanation.confirmedMissingTemplate", {
              items: confirmedMissing.join("; "),
            })
          );
        }
        explanationParts.push(t(locale, "content.checks.website.content_depth.explanation.recoveredNote"));

        const gaps = [
          ...(recovered.hasTitle === false ? ["title"] : []),
          ...(recovered.hasMetaDescription === false ? ["meta"] : []),
          ...(recovered.hasViewportTag === false ? ["viewport"] : []),
          ...(recovered.hasHeadings === false ? ["headings"] : []),
        ];
        return { earnedPoints, confidence: "VERIFIED", explanation: explanationParts.join(" "), gaps };
      }
      // Sub-point weights: title 1 / meta description 1 / viewport 1.5 /
      // has a real heading 1 / genuine text length 0.5 — sums to 5. Length
      // carries the least weight of the five: it's the fuzziest signal (a
      // character-count proxy, not a hard verification), and the lightest
      // one to trim to make room for website.about_presence/
      // website.services_presence's real page-discovery signals.
      const titlePts = content.hasTitle ? 1 : 0;
      const metaPts = content.hasMetaDescription ? 1 : 0;
      const viewportPts = content.hasViewportTag ? 1.5 : 0;
      const headingPts = content.headingCount > 0 ? 1 : 0;
      const lengthPts = contentLengthFraction(content.visibleTextLength) * 0.5;
      const earnedPoints = roundTo(titlePts + metaPts + viewportPts + headingPts + lengthPts, 1);

      const missing: string[] = [];
      const gaps: string[] = [];
      if (!content.hasTitle) {
        missing.push(t(locale, "content.checks.website.content_depth.explanation.gapNoTitle"));
        gaps.push("title");
      }
      if (!content.hasMetaDescription) {
        missing.push(t(locale, "content.checks.website.content_depth.explanation.gapNoMeta"));
        gaps.push("meta");
      }
      if (!content.hasViewportTag) {
        missing.push(t(locale, "content.checks.website.content_depth.explanation.gapNoViewport"));
        gaps.push("viewport");
      }
      if (content.headingCount === 0) {
        missing.push(t(locale, "content.checks.website.content_depth.explanation.gapNoHeadings"));
        gaps.push("headings");
      }
      if (content.visibleTextLength <= THIN_CONTENT_CHARS) {
        missing.push(t(locale, "content.checks.website.content_depth.explanation.gapThinContent"));
        gaps.push("thin");
      }

      return {
        earnedPoints,
        confidence: "VERIFIED",
        gaps,
        explanation:
          missing.length === 0
            ? t(locale, "content.checks.website.content_depth.explanation.allGood")
            : t(locale, "content.checks.website.content_depth.explanation.gapsTemplate", { items: missing.join(", ") }),
      };
    },
    simulateFix: (input) => ({
      ...input,
      website: hasAnalyzableWebsite(input) ? input.website : "https://example.com",
      websiteAnalysis: {
        ...(input.websiteAnalysis ?? PERFECT_WEBSITE_ANALYSIS),
        content: PERFECT_WEBSITE_ANALYSIS.content,
      },
    }),
  },
  {
    id: "website.contact_conversion",
    labelKey: "content.checks.website.contact_conversion.label",
    category: "website",
    maxPoints: 3,
    adviceKey: "content.checks.website.contact_conversion.advice",
    gapAdviceKeys: {
      contact: "content.checks.website.contact_conversion.advice.contact",
      cta: "content.checks.website.contact_conversion.advice.cta",
    },
    evaluate(input, locale) {
      if (!hasAnalyzableWebsite(input)) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.website.contact_conversion.explanation.noWebsite"),
        };
      }
      const content = input.websiteAnalysis?.content ?? null;
      if (!content) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(
            locale,
            input.websiteAnalysis
              ? "content.checks.website.contact_conversion.explanation.couldntRead"
              : "content.checks.website.contact_conversion.explanation.notAnalyzed"
          ),
        };
      }
      if (content.isLikelyClientRenderedShell) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.website.contact_conversion.explanation.clientRenderedShell"),
        };
      }
      // Sub-point weights: a real contact link 2 / a clear CTA phrase 1 —
      // sums to 3. Contact link keeps its original weight (the more
      // reliable signal, a literal tel:/mailto: href); CTA phrase-matching
      // is the fuzzier heuristic, so it's the one trimmed to make room for
      // website.about_presence/website.services_presence.
      // Step 2d: a link to the site's own contact page counts too.
      const hasContact = content.hasPhoneLink || content.hasEmailLink || content.hasContactPageLink === true;
      const earnedPoints = (hasContact ? 2 : 0) + (content.hasCtaText ? 1 : 0);

      const problems: string[] = [];
      if (!hasContact) problems.push(t(locale, "content.checks.website.contact_conversion.explanation.noContact"));
      if (!content.hasCtaText) problems.push(t(locale, "content.checks.website.contact_conversion.explanation.noCta"));

      return {
        earnedPoints,
        confidence: "VERIFIED",
        gaps: [...(hasContact ? [] : ["contact"]), ...(content.hasCtaText ? [] : ["cta"])],
        explanation:
          problems.length === 0
            ? t(locale, "content.checks.website.contact_conversion.explanation.allGood")
            : problems.map((p) => p[0].toUpperCase() + p.slice(1)).join("; ") + ".",
      };
    },
    simulateFix: (input) => ({
      ...input,
      website: hasAnalyzableWebsite(input) ? input.website : "https://example.com",
      websiteAnalysis: {
        ...(input.websiteAnalysis ?? PERFECT_WEBSITE_ANALYSIS),
        content: {
          ...(input.websiteAnalysis?.content ?? PERFECT_WEBSITE_ANALYSIS.content!),
          hasPhoneLink: true,
          hasCtaText: true,
        },
      },
    }),
  },
  {
    id: "website.about_presence",
    labelKey: "content.checks.website.about_presence.label",
    category: "website",
    maxPoints: 1,
    adviceKey: "content.checks.website.about_presence.advice",
    partialAdviceKey: "content.checks.website.about_presence.explanation.thin",
    // Real three-state detection (Day 4 Step 2c) — see PagePresenceResult's
    // own doc and lib/websiteAnalysis.ts's detectPagePresence for how
    // aboutPresence is actually produced (a dedicated page or a homepage
    // section, with a real word-count/content check, never just a link).
    evaluate(input, locale) {
      if (!hasAnalyzableWebsite(input)) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.website.about_presence.explanation.noWebsite"),
        };
      }
      if (!input.websiteAnalysis) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.website.about_presence.explanation.notAnalyzed"),
        };
      }
      const presence = input.websiteAnalysis.aboutPresence;
      if (!presence) {
        // A row saved before this detection existed — honestly "not yet
        // analyzed," never a guessed not_found.
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.website.about_presence.explanation.notAnalyzed"),
        };
      }
      if (presence.state === "found" && presence.depth === "thin") {
        // v1.9.0: found, but brief (15–39 words) — see aboutDepth.
        return {
          earnedPoints: 0.5,
          confidence: "VERIFIED",
          explanation: t(locale, "content.checks.website.about_presence.explanation.thin"),
        };
      }
      if (presence.state === "found") {
        return {
          earnedPoints: 1,
          confidence: "VERIFIED",
          explanation: presence.locatedOnHomepage
            ? t(locale, "content.checks.website.about_presence.explanation.foundOnHomepage")
            : presence.note === "brand_page"
              ? t(locale, "content.checks.website.about_presence.explanation.foundBrandPage", { url: presence.url ?? "" })
              : t(locale, "content.checks.website.about_presence.explanation.foundOnPage", { url: presence.url ?? "" }),
        };
      }
      if (presence.state === "couldnt_check") {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation:
            presence.reason === "js_rendered"
              ? t(locale, "content.checks.website.about_presence.explanation.jsRendered")
              : presence.reason
                ? t(locale, reachabilityReasonMessageKey(presence.reason))
                : t(locale, "content.checks.website.about_presence.explanation.notFound"),
        };
      }
      // not_found — a real, confirmed absence (we looked, on a
      // dedicated page and/or the homepage, and genuinely didn't find
      // enough), unlike couldnt_check above (an inconclusive failure) —
      // so this one counts against the score, VERIFIED at 0, same as
      // any other real zero (e.g. website.https's http_only branch).
      return {
        earnedPoints: 0,
        confidence: "VERIFIED",
        explanation:
          presence.note === "broken_link"
            ? t(locale, "content.checks.website.about_presence.explanation.brokenLink", { url: presence.url ?? "" })
            : t(locale, "content.checks.website.about_presence.explanation.notFound"),
      };
    },
    simulateFix: (input) => ({
      ...input,
      website: hasAnalyzableWebsite(input) ? input.website : "https://example.com",
      websiteAnalysis: {
        ...(input.websiteAnalysis ?? PERFECT_WEBSITE_ANALYSIS),
        aboutPresence: { state: "found", url: "https://example.com/about", locatedOnHomepage: false, reason: null, note: null },
      },
    }),
  },
  {
    id: "website.services_presence",
    labelKey: "content.checks.website.services_presence.label",
    category: "website",
    maxPoints: 1,
    adviceKey: "content.checks.website.services_presence.advice",
    partialAdviceKey: "content.checks.website.services_presence.explanation.thin",
    // Same real three-state detection as website.about_presence above —
    // see servicesPresence's own doc. "pdf_only" is a real found: a real
    // PDF menu/list loads fine, we just never read its content.
    evaluate(input, locale) {
      if (!hasAnalyzableWebsite(input)) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.website.services_presence.explanation.noWebsite"),
        };
      }
      if (!input.websiteAnalysis) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.website.services_presence.explanation.notAnalyzed"),
        };
      }
      const presence = input.websiteAnalysis.servicesPresence;
      if (!presence) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: t(locale, "content.checks.website.services_presence.explanation.notAnalyzed"),
        };
      }
      if (presence.state === "found" && presence.depth === "thin") {
        // v1.9.0: found, but brief (bare names, no brands/sizes/prices) —
        // see servicesDepth. A PDF, image-only or ordering-link menu is
        // never "thin": we can't count it, so it keeps its point.
        return {
          earnedPoints: 0.5,
          confidence: "VERIFIED",
          explanation: t(locale, "content.checks.website.services_presence.explanation.thin"),
        };
      }
      if (presence.state === "found") {
        return {
          earnedPoints: 1,
          confidence: "VERIFIED",
          explanation:
            presence.note === "pdf_only"
              ? t(locale, "content.checks.website.services_presence.explanation.pdfOnly", { url: presence.url ?? "" })
              : presence.note === "online_ordering"
                ? t(locale, "content.checks.website.services_presence.explanation.onlineOrdering", { url: presence.url ?? "" })
                : presence.note === "image_only"
                  ? t(locale, "content.checks.website.services_presence.explanation.imageOnly", { url: presence.url ?? "" })
                  : presence.locatedOnHomepage
                    ? t(locale, "content.checks.website.services_presence.explanation.foundOnHomepage")
                    : t(locale, "content.checks.website.services_presence.explanation.foundOnPage", { url: presence.url ?? "" }),
        };
      }
      if (presence.state === "couldnt_check") {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation:
            presence.reason === "js_rendered"
              ? t(locale, "content.checks.website.services_presence.explanation.jsRendered")
              : presence.reason
                ? t(locale, reachabilityReasonMessageKey(presence.reason))
                : t(locale, "content.checks.website.services_presence.explanation.notFound"),
        };
      }
      // not_found — see website.about_presence's own comment on this
      // same branch: a real, confirmed absence counts against the
      // score, VERIFIED at 0, unlike couldnt_check's genuine exclusion.
      return {
        earnedPoints: 0,
        confidence: "VERIFIED",
        explanation:
          presence.note === "broken_link"
            ? t(locale, "content.checks.website.services_presence.explanation.brokenLink", { url: presence.url ?? "" })
            : t(locale, "content.checks.website.services_presence.explanation.notFound"),
      };
    },
    simulateFix: (input) => ({
      ...input,
      website: hasAnalyzableWebsite(input) ? input.website : "https://example.com",
      websiteAnalysis: {
        ...(input.websiteAnalysis ?? PERFECT_WEBSITE_ANALYSIS),
        servicesPresence: { state: "found", url: "https://example.com/services", locatedOnHomepage: false, reason: null, note: null },
      },
    }),
  },
  // ---------------------------------------------------------------------
  // Oct 10 site-trust checks (PROPOSED weights — see
  // ~/Desktop/website-trust-dry-run.md for the real dry-run effect
  // across all 53 businesses before these are finalized). All four read
  // WebsiteAnalysis.websiteTrust (see its own doc) — a row saved before
  // this detection existed has it undefined/null, same honest "not yet
  // analyzed" fallback as every other field added here over time. See
  // lib/websiteTrust.ts for the pure detection rules.
  // ---------------------------------------------------------------------
  {
    // Step 2d: a real social media PROFILE linked from the site (never a
    // share button or a bare platform homepage) — see
    // detectSocialProfiles (lib/websiteContentAnalysis.ts).
    id: "website.social_links",
    labelKey: "content.checks.website.social_links.label",
    category: "website",
    maxPoints: 1,
    adviceKey: "content.checks.website.social_links.advice",
    evaluate(input, locale) {
      if (!hasAnalyzableWebsite(input)) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.social_links.explanation.noWebsite") };
      }
      const couldntCheck = pageCouldntBeChecked(input, locale);
      if (couldntCheck) return couldntCheck;
      const content = input.websiteAnalysis?.content ?? null;
      // Never analyzed, or saved before this detection existed — not a
      // real "none found".
      if (!content || content.socialProfiles === undefined) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.social_links.explanation.notAnalyzed") };
      }
      // v1.11.0: only links that lead to a real profile count (each one
      // checked with a single plain request — lib/socialLinkCheck.ts).
      const counted = content.socialProfiles.filter(socialProfileCounts);
      const notCounted = content.socialProfiles.filter((p) => !socialProfileCounts(p));
      const whyNot = notCounted.map((p) => socialLinkProblem(p, locale));
      if (counted.length > 0) {
        return {
          earnedPoints: 1,
          confidence: "VERIFIED",
          explanation: [
            t(locale, "content.checks.website.social_links.explanation.found", {
              profiles: counted
                .map((p) =>
                  p.check?.result === "unconfirmed"
                    ? t(locale, "content.checks.website.social_links.explanation.unconfirmed", { platform: p.platform, url: p.url })
                    : `${p.platform}: ${p.url}`
                )
                .join(", "),
            }),
            ...whyNot,
          ].join(" "),
        };
      }
      if (notCounted.length > 0) {
        return { earnedPoints: 0, confidence: "VERIFIED", explanation: whyNot.join(" ") };
      }
      // A JavaScript-rendered page's links may simply not be in the HTML
      // we can read — honestly couldn't check, not a real "none".
      if (content.isLikelyClientRenderedShell) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.social_links.explanation.clientRenderedShell") };
      }
      // The real Chipotle case: the footer (and its social icons) is
      // built by a script, so "none found" would be a guess, not a fact.
      if (content.scriptBuiltFooter) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.social_links.explanation.scriptBuiltFooter") };
      }
      return { earnedPoints: 0, confidence: "VERIFIED", explanation: t(locale, "content.checks.website.social_links.explanation.none") };
    },
    simulateFix: (input) => ({
      ...input,
      website: hasAnalyzableWebsite(input) ? input.website : "https://example.com",
      websiteAnalysis: {
        ...(input.websiteAnalysis ?? PERFECT_WEBSITE_ANALYSIS),
        content: {
          ...(input.websiteAnalysis?.content ?? PERFECT_WEBSITE_ANALYSIS.content!),
          socialProfiles: [{ platform: "Instagram", url: "instagram.com/example" }],
        },
      },
    }),
  },
  {
    id: "website.security",
    labelKey: "content.checks.website.security.label",
    category: "website",
    // Oct 10 revision: fit inside Website's unchanged 30-point total
    // (see CATEGORY_WEIGHTS' own doc) rather than growing the category.
    // Still the heaviest of the 4 new trust checks — a hacked site is
    // the single worst real finding possible (actively dangerous to a
    // visitor, not just unpolished) — but no longer heavier than
    // performance_mobile in raw points.
    maxPoints: 2,
    adviceKey: "content.checks.website.security.advice",
    evaluate(input, locale) {
      // Same "real site, just not necessarily on the listing" reasoning
      // as website.has_website's own verifiedElsewhereUrl handling —
      // the real Bánh Mì Boy case: no website on the Google listing at
      // all, but a real, verified site DOES exist and WAS analyzed, so
      // these checks must still run against it rather than going
      // NOT_FOUND just because the listing itself shows nothing.
      if (!hasAnalyzableWebsite(input)) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.security.explanation.noWebsite") };
      }
      const trust = input.websiteAnalysis?.websiteTrust;
      if (!trust) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.security.explanation.notAnalyzed") };
      }
      const threat = trust.safeBrowsingThreat;
      // A real Safe Browsing threat doesn't need the page — it still
      // counts. Anything else needs the page itself.
      if (!threat?.threatFound) {
        const couldntCheck = pageContentUnreadable(input, locale);
        if (couldntCheck) return couldntCheck;
      }
      if (trust.spamSignals.length === 0 && !threat?.threatFound) {
        return {
          earnedPoints: 2,
          confidence: "VERIFIED",
          explanation: t(
            locale,
            trust.safeBrowsingChecked
              ? "content.checks.website.security.explanation.cleanChecked"
              : "content.checks.website.security.explanation.cleanNotChecked"
          ),
        };
      }
      if (threat?.threatFound) {
        return {
          earnedPoints: 0,
          confidence: "VERIFIED",
          explanation: t(locale, "content.checks.website.security.explanation.safeBrowsingThreat", {
            types: threat.threatTypes.join(", "),
          }),
        };
      }
      const spam = trust.spamSignals[0];
      return {
        earnedPoints: 0,
        confidence: "VERIFIED",
        // One line only, everywhere — the full evidence (phrase, hidden,
        // links, snippet, steps) lives on the Website page's Site
        // security row (see lib/siteSecurity.ts).
        explanation: t(locale, "content.checks.website.security.explanation.spamFound", { topic: spamTopic(spam.category, locale) }),
      };
    },
    simulateFix: (input) => ({
      ...input,
      websiteAnalysis: {
        ...(input.websiteAnalysis ?? PERFECT_WEBSITE_ANALYSIS),
        websiteTrust: {
          ...(input.websiteAnalysis?.websiteTrust ?? PERFECT_WEBSITE_ANALYSIS.websiteTrust!),
          spamSignals: [],
          safeBrowsingThreat: null,
        },
      },
    }),
  },
  {
    id: "website.info_consistency",
    labelKey: "content.checks.website.info_consistency.label",
    category: "website",
    // Oct 10 revision: fit inside Website's unchanged 30-point total —
    // see CATEGORY_WEIGHTS' own doc.
    maxPoints: 1,
    adviceKey: "content.checks.website.info_consistency.advice",
    evaluate(input, locale) {
      // Same "real site, just not necessarily on the listing" reasoning
      // as website.has_website's own verifiedElsewhereUrl handling —
      // the real Bánh Mì Boy case: no website on the Google listing at
      // all, but a real, verified site DOES exist and WAS analyzed, so
      // these checks must still run against it rather than going
      // NOT_FOUND just because the listing itself shows nothing.
      if (!hasAnalyzableWebsite(input)) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.info_consistency.explanation.noWebsite") };
      }
      const trust = input.websiteAnalysis?.websiteTrust;
      if (!trust) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.info_consistency.explanation.notAnalyzed") };
      }
      const couldntCheck = pageContentUnreadable(input, locale);
      if (couldntCheck) return couldntCheck;
      const overriddenKeys = new Set((input.websiteTrustOverrides ?? []).map((o) => o.key));
      const determinable = trust.infoConflicts.filter((f) => f.comparison !== "not_found_on_site");
      // Day 2b: with no Google listing info at all (a website-only
      // business), there's nothing to compare against — say that, not
      // that the site is missing it. Same points (excluded) either way.
      if (determinable.length === 0 && !input.phone && !input.address && !input.openingHours) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.info_consistency.explanation.noListingInfo") };
      }
      if (determinable.length === 0) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.info_consistency.explanation.noComparableInfo") };
      }
      const realConflicts = determinable.filter((f) => f.comparison === "conflicts" && !overriddenKeys.has(keyForInfoConflict(f)));
      if (realConflicts.length === 0) {
        // Say where the address evidence came from when it was the map.
        const addressFromMap = determinable.some((f) => f.field === "address" && f.source === "map");
        return {
          earnedPoints: 1,
          confidence: "VERIFIED",
          explanation: t(
            locale,
            addressFromMap
              ? "content.checks.website.info_consistency.explanation.allMatchMap"
              : "content.checks.website.info_consistency.explanation.allMatch"
          ),
        };
      }
      const matchingCount = determinable.length - realConflicts.length;
      const earnedPoints = roundTo(1 * (matchingCount / determinable.length), 1);
      const first = realConflicts[0];
      const fieldKey =
        first.field === "phone"
          ? "content.checks.website.info_consistency.explanation.conflictPhone"
          : first.field === "address"
            ? first.source === "map"
              ? "content.checks.website.info_consistency.explanation.conflictAddressMap"
              : "content.checks.website.info_consistency.explanation.conflictAddress"
            : "content.checks.website.info_consistency.explanation.conflictHours";
      return {
        earnedPoints,
        confidence: "VERIFIED",
        explanation: t(locale, fieldKey, { site: first.siteValue ?? "", google: first.googleValue ?? "" }),
      };
    },
    simulateFix: (input) => ({
      ...input,
      websiteAnalysis: {
        ...(input.websiteAnalysis ?? PERFECT_WEBSITE_ANALYSIS),
        websiteTrust: {
          ...(input.websiteAnalysis?.websiteTrust ?? PERFECT_WEBSITE_ANALYSIS.websiteTrust!),
          infoConflicts: PERFECT_WEBSITE_ANALYSIS.websiteTrust!.infoConflicts,
        },
      },
    }),
  },
  {
    id: "website.notice_freshness",
    labelKey: "content.checks.website.notice_freshness.label",
    category: "website",
    // Oct 10 revision: fit inside Website's unchanged 30-point total —
    // see CATEGORY_WEIGHTS' own doc.
    maxPoints: 0.5,
    adviceKey: "content.checks.website.notice_freshness.advice",
    evaluate(input, locale) {
      // Same "real site, just not necessarily on the listing" reasoning
      // as website.has_website's own verifiedElsewhereUrl handling —
      // the real Bánh Mì Boy case: no website on the Google listing at
      // all, but a real, verified site DOES exist and WAS analyzed, so
      // these checks must still run against it rather than going
      // NOT_FOUND just because the listing itself shows nothing.
      if (!hasAnalyzableWebsite(input)) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.notice_freshness.explanation.noWebsite") };
      }
      const trust = input.websiteAnalysis?.websiteTrust;
      if (!trust) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.notice_freshness.explanation.notAnalyzed") };
      }
      const couldntCheck = pageContentUnreadable(input, locale);
      if (couldntCheck) return couldntCheck;
      const overriddenKeys = new Set((input.websiteTrustOverrides ?? []).map((o) => o.key));
      const active = trust.staleNotices.filter((n) => !overriddenKeys.has(keyForStaleNotice(n)));
      if (active.length === 0) {
        return { earnedPoints: 0.5, confidence: "VERIFIED", explanation: t(locale, "content.checks.website.notice_freshness.explanation.clean") };
      }
      return {
        earnedPoints: 0,
        confidence: "VERIFIED",
        explanation: t(locale, "content.checks.website.notice_freshness.explanation.staleFound", { text: trimNoticeToSentences(active[0].text) }),
      };
    },
    simulateFix: (input) => ({
      ...input,
      websiteAnalysis: {
        ...(input.websiteAnalysis ?? PERFECT_WEBSITE_ANALYSIS),
        websiteTrust: {
          ...(input.websiteAnalysis?.websiteTrust ?? PERFECT_WEBSITE_ANALYSIS.websiteTrust!),
          staleNotices: [],
        },
      },
    }),
  },
  {
    id: "website.site_freshness",
    labelKey: "content.checks.website.site_freshness.label",
    category: "website",
    // Oct 10 revision: fit inside Website's unchanged 30-point total —
    // see CATEGORY_WEIGHTS' own doc.
    maxPoints: 0.5,
    adviceKey: "content.checks.website.site_freshness.advice",
    evaluate(input, locale) {
      // Same "real site, just not necessarily on the listing" reasoning
      // as website.has_website's own verifiedElsewhereUrl handling —
      // the real Bánh Mì Boy case: no website on the Google listing at
      // all, but a real, verified site DOES exist and WAS analyzed, so
      // these checks must still run against it rather than going
      // NOT_FOUND just because the listing itself shows nothing.
      if (!hasAnalyzableWebsite(input)) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.site_freshness.explanation.noWebsite") };
      }
      const trust = input.websiteAnalysis?.websiteTrust;
      if (!trust) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: t(locale, "content.checks.website.site_freshness.explanation.notAnalyzed") };
      }
      const couldntCheck = pageContentUnreadable(input, locale);
      if (couldntCheck) return couldntCheck;
      const { looksAbandoned, newestDateFound, templateLeftovers } = trust.abandonedSignals;
      if (!looksAbandoned) {
        return { earnedPoints: 0.5, confidence: "VERIFIED", explanation: t(locale, "content.checks.website.site_freshness.explanation.clean") };
      }
      if (templateLeftovers.length > 0) {
        return {
          earnedPoints: 0,
          confidence: "VERIFIED",
          explanation: t(locale, "content.checks.website.site_freshness.explanation.templateLeftover", { text: templateLeftovers[0] }),
        };
      }
      return {
        earnedPoints: 0,
        confidence: "VERIFIED",
        explanation: t(locale, "content.checks.website.site_freshness.explanation.oldDate", { date: newestDateFound ?? "" }),
      };
    },
    simulateFix: (input) => ({
      ...input,
      websiteAnalysis: {
        ...(input.websiteAnalysis ?? PERFECT_WEBSITE_ANALYSIS),
        websiteTrust: {
          ...(input.websiteAnalysis?.websiteTrust ?? PERFECT_WEBSITE_ANALYSIS.websiteTrust!),
          abandonedSignals: PERFECT_WEBSITE_ANALYSIS.websiteTrust!.abandonedSignals,
        },
      },
    }),
  },
];

function isDeterminable(confidence: Confidence): boolean {
  return confidence === "VERIFIED" || confidence === "LIKELY";
}

function findCheck(checkId: string): CheckDefinition {
  const def = CHECKS.find((c) => c.id === checkId);
  if (!def) throw new Error(`Unknown scoring check id: ${checkId}`);
  return def;
}

/**
 * A check's current labelKey by id, or null if CHECKS no longer defines
 * that id (a retired/renamed check from an older scoring_version).
 * Unlike findCheck() above, never throws — meant for re-resolving a
 * check id read back from storage (e.g. a historical scores.
 * breakdown_json snapshot) in the CURRENT locale, where an unknown id is
 * an honest, expected possibility, not a bug. Callers must fall back to
 * the stored label rather than guessing when this returns null.
 */
export function checkLabelKey(checkId: string): MessageKey | null {
  return CHECKS.find((c) => c.id === checkId)?.labelKey ?? null;
}

// ---------------------------------------------------------------------------
// Core scoring
// ---------------------------------------------------------------------------

/** Step 2g: checks whose findings come from reading the page itself —
 * the ones a Browserless render feeds for a JavaScript-built site. */
export const BROWSER_READ_CHECK_IDS: readonly string[] = [
  "website.content_depth",
  "website.contact_conversion",
  "website.about_presence",
  "website.services_presence",
  "website.social_links",
  "website.security",
  "website.info_consistency",
  "website.notice_freshness",
  "website.site_freshness",
];

/**
 * Scores a business from real Google Places-derived data. Pure and
 * deterministic: same input (and locale), same output, always. `locale`
 * defaults to DEFAULT_LOCALE so every existing caller that doesn't pass
 * one keeps getting the exact same English label/explanation text this
 * file used to hardcode — see content.checks.<id>.* in lib/i18n/messages.ts.
 */
export function scoreBusiness(input: BusinessScoringInput, locale: Locale = DEFAULT_LOCALE): ScoreBreakdown {
  const checks: CheckResult[] = CHECKS.map((def) => {
    const result = def.evaluate(input, locale);
    return {
      id: def.id,
      label: t(locale, def.labelKey),
      category: def.category,
      maxPoints: def.maxPoints,
      earnedPoints: result.earnedPoints,
      confidence: result.confidence,
      // Step 2g: findings read from the page as a browser shows it say so.
      explanation:
        result.earnedPoints !== null && (input.websiteAnalysis?.readViaBrowserChecks ?? []).includes(def.id)
          ? `${result.explanation} ${t(locale, "content.checks.website.readViaBrowserNote")}`
          : result.explanation,
      meta: result.meta ?? null,
      ...(result.gaps && result.gaps.length > 0 ? { gaps: result.gaps } : {}),
      ...(result.earnedPoints === null
        ? excludedBecauseUnreachable(def.id, input)
          ? { excludedReason: "unreachable" as const }
          : excludedBecauseNotCheckedYet(def.id, input)
            ? { excludedReason: "not_checked_yet" as const }
            : {}
        : {}),
    };
  });

  const categories: CategoryResult[] = (Object.keys(CATEGORY_WEIGHTS) as CategoryId[]).map(
    (categoryId) => {
      const categoryChecks = checks.filter((c) => c.category === categoryId);
      const determinable = categoryChecks.filter((c) => isDeterminable(c.confidence));
      const possiblePoints = determinable.reduce((sum, c) => sum + c.maxPoints, 0);
      const earnedPoints = determinable.reduce((sum, c) => sum + (c.earnedPoints ?? 0), 0);
      return {
        id: categoryId,
        label: t(locale, CATEGORY_LABELS[categoryId]),
        weight: CATEGORY_WEIGHTS[categoryId],
        possiblePoints,
        earnedPoints,
        relativeScore: possiblePoints > 0 ? (earnedPoints / possiblePoints) * 100 : null,
        checks: categoryChecks,
      };
    }
  );

  // Scale each determinable category's relative score to its weight, then
  // renormalize across whatever weight is actually determinable. In
  // practice every category always has at least one always-determinable
  // check (presence/absence of a field is always knowable), so this
  // denominator is 100 in every real case — the redistribution branch only
  // exists as an honest fallback, never silently scoring an undetermined
  // category as a zero.
  const determinableCategories = categories.filter((c) => c.possiblePoints > 0);
  const totalPossibleWeight = determinableCategories.reduce((sum, c) => sum + c.weight, 0);
  const totalEarnedWeight = determinableCategories.reduce(
    (sum, c) => sum + (c.earnedPoints / c.possiblePoints) * c.weight,
    0
  );
  const total =
    totalPossibleWeight > 0 ? Math.round((totalEarnedWeight / totalPossibleWeight) * 100) : 0;

  return {
    scoringVersion: SCORING_VERSION,
    total,
    grade: gradeFromTotal(total),
    categories,
    checks,
  };
}

// ---------------------------------------------------------------------------
// Suggestion → score guarantee
// ---------------------------------------------------------------------------

/**
 * Step 2d: was this (already excluded) website check excluded because we
 * couldn't reach the site — as opposed to "not checked yet" or "nothing
 * to compare"? Read only from the same stored facts that caused the
 * exclusion; never guessed.
 */
/** Step 2d: excluded only because no scan has looked yet — the site was
 * never analyzed, or this check was added after the last scan. */
function excludedBecauseNotCheckedYet(checkId: string, input: BusinessScoringInput): boolean {
  if (!checkId.startsWith("website.") || !hasAnalyzableWebsite(input)) return false;
  const a = input.websiteAnalysis;
  if (!a) return checkId !== "website.has_website";
  if (checkId === "website.social_links") return a.content !== null && a.content.socialProfiles === undefined;
  if (["website.security", "website.info_consistency", "website.notice_freshness", "website.site_freshness"].includes(checkId)) {
    return !a.websiteTrust;
  }
  return false;
}

function excludedBecauseUnreachable(checkId: string, input: BusinessScoringInput): boolean {
  const a = input.websiteAnalysis;
  if (!checkId.startsWith("website.") || !hasAnalyzableWebsite(input) || !a) return false;
  const pageUnreachable = !!a.contentFetchFailureReason || !!a.websiteTrust?.automatedErrorPageUrl;
  const jsOnly = a.content?.isLikelyClientRenderedShell === true;
  const presenceUnreachable = (p: PagePresenceResult | null) => p?.state === "couldnt_check" && p.reason !== null;
  switch (checkId) {
    case "website.https":
      return input.httpsStatus === "unreachable";
    case "website.performance_mobile": {
      const kind = a.mobilePerformanceFailureReason?.kind;
      return siteBlocksAutomatedChecks(input) || kind === "timed_out" || kind === "error_page" || kind === "http_error";
    }
    case "website.content_depth":
    case "website.contact_conversion":
    case "website.social_links":
      return pageUnreachable || jsOnly;
    case "website.about_presence":
      return pageUnreachable || presenceUnreachable(a.aboutPresence);
    case "website.services_presence":
      return pageUnreachable || presenceUnreachable(a.servicesPresence);
    case "website.security":
    case "website.info_consistency":
    case "website.notice_freshness":
    case "website.site_freshness":
      return pageUnreachable || jsOnly;
    default:
      return false;
  }
}

/**
 * Step 2d: how many of a category's checks were actually scored (a real,
 * determinable result) vs. excluded because we couldn't reach the site
 * (see excludedBecauseUnreachable). Display only; scoring is unchanged.
 * Used for the "Based on {n} of {total} website checks" label.
 */
export function categoryCheckCoverage(category: CategoryResult): { checked: number; total: number; unreachable: number } {
  const checked = category.checks.filter(
    (c) => (c.confidence === "VERIFIED" || c.confidence === "LIKELY") && c.earnedPoints !== null
  ).length;
  const unreachable = category.checks.filter((c) => c.excludedReason === "unreachable").length;
  // "total" = what we could score plus what we couldn't reach — checks
  // that simply weren't checked yet or had nothing to compare aren't
  // counted as "couldn't be checked".
  return { checked, total: checked + unreachable, unreachable };
}

/**
 * v1.10.0: how many of the 100 possible points this score is actually
 * based on — exactly the sum of the category maxes shown next to each
 * category (determinable checks only). The "Partly checked — score based
 * on X of 100 points" label always uses this, so it can never disagree
 * with the category totals on screen.
 */
export function scoreBasisPoints(categories: Pick<CategoryResult, "possiblePoints">[]): number {
  return roundTo(categories.reduce((sum, c) => sum + c.possiblePoints, 0), 1);
}

/** v1.10.0: below this share of Website POINTS actually checkable (for a
 * site we couldn't fully reach), the score is labeled "Partly checked —
 * score based on X of 100 points" — in the app and in the monthly email. */
export const PARTLY_CHECKED_THRESHOLD = 0.6;

/** Share (0–1) of the Website category's points we could actually check. */
export function websitePointShare(category: CategoryResult): number {
  const max = category.checks.reduce((sum, c) => sum + c.maxPoints, 0);
  return max > 0 ? category.possiblePoints / max : 1;
}

/**
 * The "score based on X of 100 points" number when the score is only
 * partly checked — under PARTLY_CHECKED_THRESHOLD of Website points
 * checkable because we couldn't reach the site (never for a business
 * with no website, where nothing is "couldn't check") — else null. X is
 * scoreBasisPoints: the sum of the category maxes shown.
 */
export function partlyCheckedScoreBasis(categories: CategoryResult[], hasWebsite: boolean): number | null {
  const website = categories.find((c) => c.id === "website");
  if (!website || !hasWebsite) return null;
  const { checked, unreachable } = categoryCheckCoverage(website);
  if (unreachable === 0 || checked === 0) return null;
  return websitePointShare(website) < PARTLY_CHECKED_THRESHOLD ? scoreBasisPoints(categories) : null;
}

/**
 * Generates the improvement suggestions for a breakdown. Every
 * suggestion comes from a check that is currently losing points
 * (determinable confidence, earnedPoints < maxPoints); its
 * promisedPoints is exactly (maxPoints - earnedPoints) for that check —
 * never a separately hand-written number. Sorted by promisedPoints,
 * highest first. `locale` defaults to DEFAULT_LOCALE, same reasoning as
 * scoreBusiness() above — label/advice are looked up fresh via the
 * check's own labelKey/adviceKey rather than reused from `breakdown`, so
 * a caller can request a different locale's suggestions from an
 * already-computed breakdown without it silently staying in whatever
 * locale that breakdown was originally built with.
 */
/** Day 4 Step 3: a phone speed this good (90+/100, or real visitors
 * "fast") gets no "speed up your site" fix — the gap is noise, not work. */
export const SPEED_NO_ADVICE_FROM = 0.9;

export function isMinorSpeedGap(check: Pick<CheckResult, "id" | "earnedPoints" | "maxPoints">): boolean {
  return (
    check.id === "website.performance_mobile" &&
    check.earnedPoints !== null &&
    check.earnedPoints / check.maxPoints >= SPEED_NO_ADVICE_FROM - 1e-9
  );
}

/** The advice for exactly what's missing: one line per gap when the
 * check reports gaps (and has advice for them), else the check's own. */
function adviceFor(def: CheckDefinition, check: CheckResult, locale: Locale): string {
  const perGap = (check.gaps ?? []).map((g) => def.gapAdviceKeys?.[g]).filter((k): k is MessageKey => !!k);
  if (perGap.length > 0) return perGap.map((k) => t(locale, k)).join(" ");
  return t(locale, def.partialAdviceKey && (check.earnedPoints ?? 0) > 0 ? def.partialAdviceKey : def.adviceKey);
}

export function generateSuggestions(breakdown: ScoreBreakdown, locale: Locale = DEFAULT_LOCALE): Suggestion[] {
  return breakdown.checks
    .filter((c) => isDeterminable(c.confidence) && (c.earnedPoints ?? 0) < c.maxPoints && !isMinorSpeedGap(c))
    .map((c) => {
      const def = findCheck(c.id);
      return {
        checkId: c.id,
        category: c.category,
        label: t(locale, def.labelKey),
        promisedPoints: roundTo(c.maxPoints - (c.earnedPoints ?? 0), 1),
        advice: adviceFor(def, c, locale),
      };
    })
    .sort((a, b) => b.promisedPoints - a.promisedPoints);
}

/** Applies one check's simulateFix to a copy of the input. Pure. */
export function applyCheckFix(
  input: BusinessScoringInput,
  checkId: string
): BusinessScoringInput {
  return findCheck(checkId).simulateFix(input);
}

/**
 * Scores a business, generates its suggestions, and computes the
 * projected score/breakdown by applying every current suggestion's own
 * simulateFix and re-running scoreBusiness on the result. The projected
 * score is never an estimate summed from promised points — it's the
 * literal output of the same scoring function, given the data state
 * suggestions describe. See scoring.test.ts for the guarantee test.
 */
export function getScoreWithSuggestions(
  input: BusinessScoringInput,
  locale: Locale = DEFAULT_LOCALE
): ScoreWithSuggestions {
  const breakdown = scoreBusiness(input, locale);
  const suggestions = generateSuggestions(breakdown, locale);

  const projectedInput = suggestions.reduce(
    (acc, s) => applyCheckFix(acc, s.checkId),
    input
  );
  const projectedBreakdown = scoreBusiness(projectedInput, locale);

  return { breakdown, suggestions, projectedInput, projectedBreakdown };
}

// ---------------------------------------------------------------------------
// Adapter: a saved `businesses` row → scoring input
// ---------------------------------------------------------------------------

/**
 * Shape of the fields on the `businesses` table that scoring reads. Kept
 * separate from the Supabase-generated row type so this module has no
 * dependency on the database client.
 */
export interface BusinessScoringRow {
  /** Computed (not a column): see BusinessScoringInput.timeZone. */
  time_zone?: string | null;
  rating: number | null;
  review_count: number | null;
  phone: string | null;
  address: string | null;
  opening_hours: string[] | null;
  website: string | null;
  categories: string[] | null;
  category: string | null;
  photo_count: number | null;
  business_status: string | null;
  /** Cached result of the real HTTPS probe — see HttpsCheckStatus.
   * Stored as plain text since it comes from Postgres; narrowed back
   * to the real union by parseHttpsStatus below rather than trusted
   * with a blind cast. */
  https_status: string | null;
  /** Cached result of the real website analysis — see WebsiteAnalysis.
   * A jsonb column, so Supabase already hands this back as a parsed
   * object (or null); narrowed by parseWebsiteAnalysis below rather
   * than trusted with a blind cast, same reasoning as https_status.
   * Optional (not just nullable) so a caller that hasn't selected this
   * column yet still type-checks — treated identically to null/legacy
   * data by parseWebsiteAnalysis: never analyzed. */
  website_analysis_json?: unknown;
  /** Real owner overrides — see WebsiteTrustOverride's own doc. Same
   * jsonb/optional reasoning as website_analysis_json above. */
  website_trust_overrides_json?: unknown;
  /** A real, manually-verified alternate website — see
   * BusinessScoringInput.verifiedElsewhereUrl's own doc. Same
   * optional-for-un-migrated-callers reasoning as the other new
   * columns here. */
  verified_website_url?: string | null;
}

/** Narrows a stored https_status string back to the real union,
 * degrading anything unexpected to null (never-checked) rather than
 * trusting an unvalidated cast — this is our own cached column, but a
 * bad value here should fail safe (excluded) rather than silently
 * mis-score. */
function parseHttpsStatus(value: string | null): HttpsCheckStatus | null {
  return value === "https" || value === "http_only" || value === "unreachable" ? value : null;
}

/** Narrows a stored content value back to the real shape, same fail-safe
 * reasoning as parseHttpsStatus/parseWebsiteAnalysis. isLikelyClientRenderedShell
 * is treated as optional on the way in (default false) rather than
 * required like every other field here: a row saved before this flag
 * existed simply predates it, and the honest fallback is to keep scoring
 * its real, already-validated content fields exactly as before — not to
 * discard the whole content analysis (and start showing "hasn't been
 * analyzed yet") just because this one newer field is absent. */
function parseNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** A malformed/missing renderedContentSignals value degrades to null
 * (same fail-safe reasoning as the rest of this file) rather than
 * discarding the whole content analysis — website.content_depth already
 * treats null here as "couldn't recover, fall back to full exclusion,"
 * so a bad stored value just re-derives that same honest state instead
 * of crashing or fabricating recovered signals. */
function parseRenderedContentSignals(value: unknown): RenderedContentSignals | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return {
    hasTitle: parseNullableBoolean(v.hasTitle),
    hasMetaDescription: parseNullableBoolean(v.hasMetaDescription),
    hasViewportTag: parseNullableBoolean(v.hasViewportTag),
    hasHeadings: parseNullableBoolean(v.hasHeadings),
  };
}

function parseWebsiteContentSignals(value: unknown): WebsiteContentSignals | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const hasCoreFields =
    typeof v.hasTitle === "boolean" &&
    typeof v.hasMetaDescription === "boolean" &&
    typeof v.hasViewportTag === "boolean" &&
    typeof v.headingCount === "number" &&
    typeof v.visibleTextLength === "number" &&
    typeof v.hasPhoneLink === "boolean" &&
    typeof v.hasEmailLink === "boolean" &&
    typeof v.hasCtaText === "boolean";
  if (!hasCoreFields) return null;
  return {
    hasTitle: v.hasTitle as boolean,
    hasMetaDescription: v.hasMetaDescription as boolean,
    hasViewportTag: v.hasViewportTag as boolean,
    headingCount: v.headingCount as number,
    visibleTextLength: v.visibleTextLength as number,
    hasPhoneLink: v.hasPhoneLink as boolean,
    hasEmailLink: v.hasEmailLink as boolean,
    hasCtaText: v.hasCtaText as boolean,
    ...(typeof v.hasContactPageLink === "boolean" ? { hasContactPageLink: v.hasContactPageLink } : {}),
    ...(typeof v.scriptBuiltFooter === "boolean" ? { scriptBuiltFooter: v.scriptBuiltFooter } : {}),
    ...(parseContactEvidence(v.contactEvidence) ? { contactEvidence: parseContactEvidence(v.contactEvidence)! } : {}),
    ...(Array.isArray(v.socialProfiles)
      ? {
          socialProfiles: v.socialProfiles
            .filter(
              (p): p is SocialProfile =>
                !!p && typeof p === "object" && typeof (p as SocialProfile).platform === "string" && typeof (p as SocialProfile).url === "string"
            )
            .map((p) => ({
              platform: p.platform,
              url: p.url,
              ...(typeof p.href === "string" ? { href: p.href } : {}),
              ...(parseSocialLinkCheck(p.check) ? { check: parseSocialLinkCheck(p.check)! } : {}),
            })),
        }
      : {}),
    isLikelyClientRenderedShell:
      typeof v.isLikelyClientRenderedShell === "boolean" ? v.isLikelyClientRenderedShell : false,
    renderedContentSignals: v.renderedContentSignals ? parseRenderedContentSignals(v.renderedContentSignals) : null,
  };
}

/** Why a checked social link doesn't count, in the owner's words. */
function socialLinkProblem(profile: SocialProfile, locale: Locale): string {
  const host = (() => {
    try {
      return profile.check?.finalUrl ? new URL(profile.check.finalUrl).hostname.replace(/^www\./, "") : "";
    } catch {
      return "";
    }
  })();
  switch (profile.check?.result) {
    case "own_site":
      return t(locale, "content.checks.website.social_links.explanation.backToSite", { platform: profile.platform });
    case "elsewhere":
      return t(locale, "content.checks.website.social_links.explanation.elsewhere", { platform: profile.platform, host });
    default:
      return t(locale, "content.checks.website.social_links.explanation.notFound", { platform: profile.platform });
  }
}

function parseSocialLinkCheck(value: unknown): SocialLinkCheck | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const results: SocialLinkCheck["result"][] = ["profile", "unconfirmed", "own_site", "elsewhere", "not_found"];
  const result = results.find((r) => r === v.result);
  if (!result || typeof v.checkedAt !== "string") return null;
  return {
    result,
    finalUrl: typeof v.finalUrl === "string" ? v.finalUrl : null,
    httpStatus: typeof v.httpStatus === "number" ? v.httpStatus : null,
    checkedAt: v.checkedAt,
  };
}

function isWebsiteAnalysisPage(value: unknown): value is WebsiteAnalysisPage {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.label === "string" &&
    typeof v.url === "string" &&
    (v.screenshotUrl === null || typeof v.screenshotUrl === "string")
  );
}

/** A malformed/missing additionalPages value degrades to [] (same
 * fail-safe reasoning as the rest of parseWebsiteAnalysis) rather than
 * dropping the whole analysis — the homepage screenshot/PageSpeed/content
 * signals are still real and usable even if this one extra field is bad. */
function parseAdditionalPages(value: unknown): WebsiteAnalysisPage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isWebsiteAnalysisPage);
}

function isFieldSpeedCategory(value: unknown): value is FieldSpeedCategory {
  return value === "FAST" || value === "AVERAGE" || value === "SLOW";
}

/**
 * A row saved before this measurement shape existed only ever has the
 * old flat `mobilePerformanceScore` number (a single, un-medianed lab
 * run) — degrading that to null (never-measured) rather than silently
 * relabeling it as "lab, median of 3 runs" is deliberate: the
 * explanation text this check shows makes a specific, real claim about
 * HOW the number was produced, and a legacy single-run score can't
 * honestly back that claim. The next rescan measures it for real under
 * the new method. Same fail-safe reasoning as hasAboutPage/hasServicesPage
 * below.
 */
function parseMobilePerformance(value: unknown): MobilePerformanceMeasurement | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const measuredAt = typeof v.measuredAt === "string" ? v.measuredAt : undefined;
  const carriedForward = v.carriedForward === true ? true : undefined;
  if (v.method === "field" && isFieldSpeedCategory(v.fieldCategory)) {
    return {
      method: "field",
      fieldCategory: v.fieldCategory,
      labScore: null,
      measuredAt,
      carriedForward,
      ...(v.fieldScope === "origin" ? { fieldScope: "origin" as const } : {}),
      ...(v.carriedForwardReason === "error_page" ? { carriedForwardReason: "error_page" as const } : {}),
    };
  }
  if (v.method === "lab" && typeof v.labScore === "number") {
    return {
      method: "lab",
      fieldCategory: null,
      labScore: v.labScore,
      measuredAt,
      carriedForward,
      ...(v.carriedForwardReason === "error_page" ? { carriedForwardReason: "error_page" as const } : {}),
    };
  }
  return null;
}

const MOBILE_PERFORMANCE_FAILURE_KINDS = new Set(["timed_out", "http_error", "no_api_key", "error", "error_page"]);

function parseMobilePerformanceFailure(value: unknown): MobilePerformanceFailure | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.kind !== "string" || !MOBILE_PERFORMANCE_FAILURE_KINDS.has(v.kind)) return null;
  return {
    kind: v.kind as MobilePerformanceFailure["kind"],
    status: typeof v.status === "number" ? v.status : null,
  };
}

function isReachabilityFailureReason(value: unknown): value is ReachabilityFailureReason {
  return value === "timed_out" || value === "down" || value === "blocked_automated_check" || value === "http_error";
}

/** Same real reasons as isReachabilityFailureReason, plus "js_rendered"
 * — see PagePresenceFailureReason's own doc. Only ever used for
 * PagePresenceResult.reason; every other reachability-typed field in
 * this file keeps using isReachabilityFailureReason unmodified. */
function isPagePresenceFailureReason(value: unknown): value is PagePresenceFailureReason {
  return value === "js_rendered" || isReachabilityFailureReason(value);
}

const PAGE_PRESENCE_STATES = new Set(["found", "not_found", "couldnt_check"]);
const PAGE_PRESENCE_NOTES = new Set(["pdf_only", "broken_link", "online_ordering", "image_only", "brand_page"]);

/** Narrows a stored PagePresenceResult back to the real shape, same
 * fail-safe reasoning as parseWebsiteAnalysis itself — anything
 * malformed or missing (including every row saved before this
 * detection existed) degrades to null ("not yet analyzed"), never a
 * guessed found/not_found. */
function parsePagePresenceResult(value: unknown): PagePresenceResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.state !== "string" || !PAGE_PRESENCE_STATES.has(v.state)) return null;
  return {
    state: v.state as PagePresenceState,
    url: typeof v.url === "string" ? v.url : null,
    locatedOnHomepage: v.locatedOnHomepage === true,
    reason: isPagePresenceFailureReason(v.reason) ? v.reason : null,
    note: typeof v.note === "string" && PAGE_PRESENCE_NOTES.has(v.note) ? (v.note as PagePresenceNote) : null,
    // Left undefined (not null) on a result saved before v1.9.0, so an
    // older row reads back exactly as it was saved.
    depth: v.depth === "thin" || v.depth === "descriptive" ? v.depth : undefined,
    counts: parsePresenceCounts(v.counts) ?? undefined,
  };
}

function parseContactEvidence(value: unknown): ContactEvidence | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x : null);
  return {
    phoneLink: str(v.phoneLink),
    emailLink: str(v.emailLink),
    contactPageLink: str(v.contactPageLink),
    actionLinkText: str(v.actionLinkText),
    ctaPhrase: str(v.ctaPhrase),
  };
}

function parsePresenceCounts(value: unknown): PresenceCounts | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
  const words = num(v.words), items = num(v.items), detailedItems = num(v.detailedItems), prices = num(v.prices);
  if (words === null || items === null || detailedItems === null || prices === null) return null;
  return { words, items, detailedItems, prices };
}

/** Narrows a stored website_analysis_json value back to the real shape,
 * degrading anything unexpected (a legacy row, a malformed value) to
 * null (never-analyzed) rather than trusting an unvalidated cast — same
 * fail-safe reasoning as parseHttpsStatus above. Exported so the
 * server-only save/refresh paths (app/actions/businesses.ts,
 * app/actions/websiteScreenshots.ts) can read a business's *existing*
 * stored analysis with this same real narrowing — e.g. to decide whether
 * screenshots have ever been captured — rather than re-implementing it. */
export function parseWebsiteAnalysis(value: unknown): WebsiteAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const content = parseWebsiteContentSignals(v.content);
  const mobilePerformance = parseMobilePerformance(v.mobilePerformance);
  const mobilePerformanceFailureReason = parseMobilePerformanceFailure(v.mobilePerformanceFailureReason);
  const contentFetchFailureReason = isReachabilityFailureReason(v.contentFetchFailureReason)
    ? v.contentFetchFailureReason
    : null;
  const httpsUnreachableReason = isReachabilityFailureReason(v.httpsUnreachableReason)
    ? v.httpsUnreachableReason
    : null;
  const screenshotUrl = typeof v.screenshotUrl === "string" ? v.screenshotUrl : null;
  const additionalPages = parseAdditionalPages(v.additionalPages);
  const lastScreenshotRefreshAt = typeof v.lastScreenshotRefreshAt === "string" ? v.lastScreenshotRefreshAt : null;
  const screenshotHttpStatus = typeof v.screenshotHttpStatus === "number" ? v.screenshotHttpStatus : null;
  const screenshotCaptureLog = parseScreenshotCaptureLog(v.screenshotCaptureLog);
  const aboutPresence = parsePagePresenceResult(v.aboutPresence);
  const servicesPresence = parsePagePresenceResult(v.servicesPresence);
  const websiteTrust = parseWebsiteTrust(v.websiteTrust);
  const checkedAt = typeof v.checkedAt === "string" ? v.checkedAt : null;
  if (checkedAt === null) return null;
  return {
    content,
    mobilePerformance,
    mobilePerformanceFailureReason,
    contentFetchFailureReason,
    httpsUnreachableReason,
    screenshotUrl,
    additionalPages,
    lastScreenshotRefreshAt,
    // Only present when stored (captures from before Step 2d have neither).
    ...(screenshotHttpStatus !== null ? { screenshotHttpStatus } : {}),
    ...(Array.isArray(v.readViaBrowserChecks)
      ? { readViaBrowserChecks: (v.readViaBrowserChecks as unknown[]).filter((x): x is string => typeof x === "string") }
      : {}),
    ...(v.browserRenderLog && typeof v.browserRenderLog === "object" &&
    typeof (v.browserRenderLog as Record<string, unknown>).month === "string" &&
    typeof (v.browserRenderLog as Record<string, unknown>).renders === "number"
      ? { browserRenderLog: v.browserRenderLog as { month: string; renders: number } }
      : {}),
    ...(screenshotCaptureLog !== null ? { screenshotCaptureLog } : {}),
    ...(v.builder && typeof v.builder === "object"
      ? {
          builder: {
            id: isWebsiteBuilderId((v.builder as Record<string, unknown>).id) ? ((v.builder as Record<string, unknown>).id as WebsiteBuilderId) : null,
            source: (["generator", "assets", "hostname", "pagespeed"] as const).find((x) => x === (v.builder as Record<string, unknown>).source) ?? null,
          },
        }
      : {}),
    aboutPresence,
    servicesPresence,
    websiteTrust,
    checkedAt,
  };
}

function parseScreenshotCaptureLog(value: unknown): ScreenshotCaptureLog | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.at !== "string" || typeof v.calls !== "number") return null;
  if (v.source !== "auto" && v.source !== "manual") return null;
  return { at: v.at, calls: v.calls, source: v.source };
}

const INFO_CONFLICT_FIELDS = new Set(["phone", "address", "hours"]);
const INFO_CONFLICT_COMPARISONS = new Set(["matches", "conflicts", "not_found_on_site"]);

function parseInfoFieldFinding(value: unknown): InfoFieldFinding | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.field !== "string" || !INFO_CONFLICT_FIELDS.has(v.field)) return null;
  if (typeof v.comparison !== "string" || !INFO_CONFLICT_COMPARISONS.has(v.comparison)) return null;
  return {
    field: v.field as InfoFieldFinding["field"],
    comparison: v.comparison as InfoFieldFinding["comparison"],
    siteValue: typeof v.siteValue === "string" ? v.siteValue : null,
    googleValue: typeof v.googleValue === "string" ? v.googleValue : null,
    ...(v.source === "map" ? { source: "map" as const } : {}),
  };
}

function parseSpamFinding(value: unknown): SpamFinding | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.category !== "string" || typeof v.matchedPhrase !== "string" || typeof v.snippet !== "string") return null;
  return {
    category: v.category as SpamFinding["category"],
    matchedPhrase: v.matchedPhrase,
    snippet: v.snippet,
    suspiciousLinks: Array.isArray(v.suspiciousLinks) ? v.suspiciousLinks.filter((s): s is string => typeof s === "string") : [],
    hidden: v.hidden === true,
  };
}

function parseStaleNoticeFinding(value: unknown): StaleNoticeFinding | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.text !== "string" || typeof v.resolvedDate !== "string") return null;
  return { text: v.text, resolvedDate: v.resolvedDate };
}

function parseAbandonedSiteFinding(value: unknown): AbandonedSiteFinding {
  if (!value || typeof value !== "object") return { newestDateFound: null, templateLeftovers: [], looksAbandoned: false };
  const v = value as Record<string, unknown>;
  return {
    newestDateFound: typeof v.newestDateFound === "string" ? v.newestDateFound : null,
    templateLeftovers: Array.isArray(v.templateLeftovers) ? v.templateLeftovers.filter((s): s is string => typeof s === "string") : [],
    looksAbandoned: v.looksAbandoned === true,
  };
}

/** Same fail-safe reasoning as parseWebsiteAnalysis itself — anything
 * malformed or missing (including every row saved before this detection
 * existed) degrades to null ("not yet analyzed"), never a guessed-at
 * clean result. */
function parseWebsiteTrust(value: unknown): WebsiteTrustAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const checkedAt = typeof v.checkedAt === "string" ? v.checkedAt : null;
  if (checkedAt === null) return null;
  const spamSignals = Array.isArray(v.spamSignals)
    ? v.spamSignals.map(parseSpamFinding).filter((f): f is SpamFinding => f !== null)
    : [];
  const infoConflicts = Array.isArray(v.infoConflicts)
    ? v.infoConflicts.map(parseInfoFieldFinding).filter((f): f is InfoFieldFinding => f !== null)
    : [];
  const staleNotices = Array.isArray(v.staleNotices)
    ? v.staleNotices.map(parseStaleNoticeFinding).filter((f): f is StaleNoticeFinding => f !== null)
    : [];
  let safeBrowsingThreat: { threatFound: boolean; threatTypes: string[] } | null = null;
  if (v.safeBrowsingThreat && typeof v.safeBrowsingThreat === "object") {
    const sb = v.safeBrowsingThreat as Record<string, unknown>;
    if (typeof sb.threatFound === "boolean") {
      safeBrowsingThreat = {
        threatFound: sb.threatFound,
        threatTypes: Array.isArray(sb.threatTypes) ? sb.threatTypes.filter((s): s is string => typeof s === "string") : [],
      };
    }
  }
  const websiteKind =
    v.websiteKind === "independent" || v.websiteKind === "free_builder" || v.websiteKind === "directory"
      ? (v.websiteKind as WebsiteKind)
      : null;
  return {
    spamSignals,
    safeBrowsingThreat,
    safeBrowsingChecked: v.safeBrowsingChecked === true,
    infoConflicts,
    staleNotices,
    abandonedSignals: parseAbandonedSiteFinding(v.abandonedSignals),
    websiteKind,
    listingLinkBroken: v.listingLinkBroken === true,
    ...(typeof v.listingLinkErrorPageUrl === "string" ? { listingLinkErrorPageUrl: v.listingLinkErrorPageUrl } : {}),
    ...(typeof v.automatedErrorPageUrl === "string" ? { automatedErrorPageUrl: v.automatedErrorPageUrl } : {}),
    ...(v.embeddedMap && typeof v.embeddedMap === "object"
      ? {
          embeddedMap: {
            readableAddress:
              typeof (v.embeddedMap as Record<string, unknown>).readableAddress === "string"
                ? ((v.embeddedMap as Record<string, unknown>).readableAddress as string)
                : null,
          },
        }
      : {}),
    checkedAt,
  };
}

function parseWebsiteTrustOverrides(value: unknown): WebsiteTrustOverride[] | null {
  if (!Array.isArray(value)) return null;
  const overrides: WebsiteTrustOverride[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    if (typeof v.key !== "string" || typeof v.note !== "string" || typeof v.overriddenAt !== "string") continue;
    overrides.push({ key: v.key, note: v.note, overriddenAt: v.overriddenAt });
  }
  return overrides;
}

/** Maps a saved business row to scoring input. Pure. */
export function businessRowToScoringInput(row: BusinessScoringRow): BusinessScoringInput {
  return {
    rating: row.rating,
    reviewCount: row.review_count,
    // Not collected yet — see the field comment on BusinessScoringInput.
    mostRecentReviewDaysAgo: null,
    phone: row.phone,
    address: row.address,
    openingHours: row.opening_hours,
    website: row.website,
    httpsStatus: parseHttpsStatus(row.https_status),
    categories: row.categories,
    primaryCategory: row.category,
    photoCount: row.photo_count,
    businessStatus: row.business_status,
    websiteAnalysis: parseWebsiteAnalysis(row.website_analysis_json),
    websiteTrustOverrides: parseWebsiteTrustOverrides(row.website_trust_overrides_json),
    verifiedElsewhereUrl: typeof row.verified_website_url === "string" ? row.verified_website_url : null,
    timeZone: row.time_zone ?? null,
  };
}
