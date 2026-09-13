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

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

/**
 * Bump this whenever CHECKS, CATEGORY_WEIGHTS, curves, or grade thresholds
 * change in a way that would move existing scores. Every stored score row
 * records the version that produced it, so historical scores stay
 * interpretable even after the formula evolves.
 */
export const SCORING_VERSION = "1.6.0";

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
   * fetchPageSpeedMobileScore and PAGESPEED_CSR_RECOVERY_CATEGORIES),
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
  /** 0-100, from PageSpeed Insights' mobile "performance" category
   * score. null = no PAGESPEED_API_KEY configured, or the call failed
   * or timed out — excluded, never scored as a failure. */
  mobilePerformanceScore: number | null;
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
  /** True only when a real page was found in this site's nav links or
   * sitemap.xml whose link text/URL matches an About/Our Story/Meet The
   * Team synonym (see lib/websiteAnalysis.ts's detectPagePresence and
   * ABOUT_PAGE_SYNONYMS) — never inferred from page content, only from a
   * genuine discovered link. false covers every case where we can't
   * confirm this: no matching page found, discovery didn't run, or a
   * single-page site whose About content (if any) lives on the homepage
   * where we can't detect it. website.about_presence below treats false
   * identically to "unknown" — excluded, never scored as a failure —
   * since a missing link is never proof of missing content. */
  hasAboutPage: boolean;
  /** Same real page-discovery signal as hasAboutPage, for a Services/
   * Products/Menu-type page (see SERVICES_PAGE_SYNONYMS) — see
   * website.services_presence. */
  hasServicesPage: boolean;
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

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  visibility: "Visibility & Reputation",
  completeness: "Google Listing Completeness",
  website: "Website",
};

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

/** Shared by website.content_depth and website.contact_conversion —
 * both exclude themselves the same honest way when
 * content.isLikelyClientRenderedShell is true, rather than scoring the
 * (necessarily empty) static-fetch signals as real failures. Deliberately
 * distinct wording from "couldn't read this site's content" (the
 * fetch-failed/blocked case just above it in each check): this is a
 * different, more specific honest state — we DID read the page, it's
 * just a JS-rendered shell our static check can't see inside. */
const CLIENT_RENDERED_SHELL_EXPLANATION =
  "Couldn't verify — this site renders its content with JavaScript, which our static check can't read. Excluded from your score, not counted against you.";

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
  label: string;
  category: CategoryId;
  maxPoints: number;
  /** Copy shown on a suggestion generated from this check while it's losing points. */
  advice: string;
  evaluate(input: BusinessScoringInput): {
    earnedPoints: number | null;
    confidence: Confidence;
    explanation: string;
  };
  simulateFix(input: BusinessScoringInput): BusinessScoringInput;
}

// Visibility's two data-driven checks (rating, review count) share their
// point ceiling between `maxPoints` below and the `* N` multiplier inside
// each check's own `evaluate` — named here so a future rebalance can't
// repeat the bug where only one of the two got updated.
const RATING_CHECK_MAX_POINTS = 16;
const REVIEW_COUNT_CHECK_MAX_POINTS = 18;

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
    isLikelyClientRenderedShell: false,
    renderedContentSignals: null,
  },
  mobilePerformanceScore: 100,
  screenshotUrl: null,
  additionalPages: [],
  lastScreenshotRefreshAt: null,
  hasAboutPage: true,
  hasServicesPage: true,
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

export const CHECKS: CheckDefinition[] = [
  // --- Visibility & Reputation (40 pts) ------------------------------------
  {
    id: "visibility.rating",
    label: "Star rating",
    category: "visibility",
    maxPoints: RATING_CHECK_MAX_POINTS,
    advice:
      "Improve your average star rating — ask happy customers for reviews (more reviews also means your rating carries more weight) and follow up on negative ones.",
    evaluate(input) {
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
            explanation: "No Google reviews yet — this is the biggest thing holding your visibility back.",
          };
        }
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: "Google returned no star rating for this listing.",
        };
      }
      const ratingFrac = ratingFraction(input.rating);
      const confidenceFactor = ratingConfidenceFactor(input.reviewCount);
      const earnedPoints = roundTo(ratingFrac * confidenceFactor * RATING_CHECK_MAX_POINTS, 1);
      const fullConfidence = confidenceFactor >= 1;

      let explanation: string;
      if (input.reviewCount === null) {
        explanation = `Rated ${input.rating.toFixed(1)}★ on Google, but Google didn't return a review count to back it up — shown at reduced confidence until review volume is verified.`;
      } else if (!fullConfidence) {
        explanation = `Rated ${input.rating.toFixed(1)}★ on Google, but based on only ${input.reviewCount} review${input.reviewCount === 1 ? "" : "s"} — as you gather more reviews, this rating will carry more weight toward your score.`;
      } else {
        explanation = `Rated ${input.rating.toFixed(1)}★ on Google.`;
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
    label: "Review count",
    category: "visibility",
    maxPoints: REVIEW_COUNT_CHECK_MAX_POINTS,
    advice:
      "Get more Google reviews — ask recent customers directly, or add a review link to receipts and follow-up emails.",
    evaluate(input) {
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
            ? "0 reviews on Google — ask your customers for reviews to start building social proof."
            : `${reviewCount} review${reviewCount === 1 ? "" : "s"} on Google (full credit at ${REVIEW_COUNT_SATURATION}+).`,
      };
    },
    simulateFix: (input) => ({ ...input, reviewCount: REVIEW_COUNT_SATURATION }),
  },
  {
    id: "visibility.review_recency",
    label: "Review recency",
    category: "visibility",
    maxPoints: 6,
    advice:
      "Keep reviews coming in regularly — recent activity signals to customers (and Google) that the business is active.",
    evaluate(input) {
      if (input.mostRecentReviewDaysAgo === null) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation:
            "Review timestamps aren't collected by the current Google Places integration yet, so this check is excluded rather than scored as a failure.",
        };
      }
      const fraction = recencyFraction(input.mostRecentReviewDaysAgo);
      return {
        earnedPoints: roundTo(fraction * 6, 1),
        confidence: "VERIFIED",
        explanation: `Most recent review was ${input.mostRecentReviewDaysAgo} day(s) ago.`,
      };
    },
    simulateFix: (input) => ({ ...input, mostRecentReviewDaysAgo: 0 }),
  },

  // --- Google Listing Completeness (30 pts) --------------------------------
  {
    id: "completeness.phone",
    label: "Phone number",
    category: "completeness",
    maxPoints: 4,
    advice: "Add a phone number to your Google Business Profile.",
    evaluate(input) {
      const has = !!input.phone && input.phone.trim().length > 0;
      return {
        earnedPoints: has ? 4 : 0,
        confidence: "VERIFIED",
        explanation: has
          ? "Phone number is on the listing."
          : "No phone number on the listing.",
      };
    },
    simulateFix: (input) => ({ ...input, phone: "+1-555-000-0000" }),
  },
  {
    id: "completeness.address",
    label: "Address",
    category: "completeness",
    maxPoints: 4,
    advice: "Add a complete, verified address to your Google Business Profile.",
    evaluate(input) {
      const has = !!input.address && input.address.trim().length > 0;
      return {
        earnedPoints: has ? 4 : 0,
        confidence: "VERIFIED",
        explanation: has
          ? "Address is on the listing."
          : "No address on the listing.",
      };
    },
    simulateFix: (input) => ({ ...input, address: "123 Main St" }),
  },
  {
    id: "completeness.hours",
    label: "Business hours",
    category: "completeness",
    maxPoints: 4,
    advice: "Add your business hours to your Google Business Profile.",
    evaluate(input) {
      const has = !!input.openingHours && input.openingHours.length > 0;
      return {
        earnedPoints: has ? 4 : 0,
        confidence: "VERIFIED",
        explanation: has
          ? "Business hours are on the listing."
          : "No business hours on the listing.",
      };
    },
    simulateFix: (input) => ({ ...input, openingHours: PLACEHOLDER_HOURS }),
  },
  {
    id: "completeness.website_link",
    label: "Website link on listing",
    category: "completeness",
    maxPoints: 4,
    advice: "Link your website in your Google Business Profile.",
    evaluate(input) {
      const has = !!input.website && input.website.trim().length > 0;
      return {
        earnedPoints: has ? 4 : 0,
        confidence: "VERIFIED",
        explanation: has
          ? "Website is linked on the listing."
          : "No website linked on the listing.",
      };
    },
    simulateFix: (input) => ({ ...input, website: "https://example.com" }),
  },
  {
    id: "completeness.categories",
    label: "Categories",
    category: "completeness",
    maxPoints: 4,
    advice:
      "Add business categories to your Google Business Profile so customers can find you by what you offer.",
    evaluate(input) {
      if (input.categories && input.categories.length > 0) {
        return {
          earnedPoints: 4,
          confidence: "VERIFIED",
          explanation: `${input.categories.length} categor${input.categories.length === 1 ? "y" : "ies"} on the listing.`,
        };
      }
      if (input.primaryCategory) {
        // We only have a single primary label, not the fuller category
        // list — a real signal, just a less direct one.
        return {
          earnedPoints: roundTo(4 * 0.75, 1),
          confidence: "LIKELY",
          explanation: `No full category list, but a primary category ("${input.primaryCategory}") is on file.`,
        };
      }
      return {
        earnedPoints: 0,
        confidence: "VERIFIED",
        explanation: "No categories on the listing.",
      };
    },
    simulateFix: (input) => ({ ...input, categories: ["placeholder_category"] }),
  },
  {
    id: "completeness.photos",
    label: "Photos",
    category: "completeness",
    maxPoints: 4,
    advice:
      "Add photos to your Google Business Profile — listings with photos get more engagement.",
    evaluate(input) {
      if (input.photoCount === null) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: "Google returned no photo data for this listing.",
        };
      }
      const has = input.photoCount > 0;
      return {
        earnedPoints: has ? 4 : 0,
        confidence: "VERIFIED",
        explanation: has
          ? `${input.photoCount} photo${input.photoCount === 1 ? "" : "s"} on the listing.`
          : "No photos on the listing.",
      };
    },
    simulateFix: (input) => ({ ...input, photoCount: 5 }),
  },
  {
    id: "completeness.business_status",
    label: "Operational status",
    category: "completeness",
    maxPoints: 6,
    advice: "Make sure your Google Business Profile shows as Operational.",
    evaluate(input) {
      if (input.businessStatus === null) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: "Google returned no business status for this listing.",
        };
      }
      if (input.businessStatus === "OPERATIONAL") {
        return {
          earnedPoints: 6,
          confidence: "VERIFIED",
          explanation: "Listing shows as Operational.",
        };
      }
      if (
        input.businessStatus === "CLOSED_TEMPORARILY" ||
        input.businessStatus === "CLOSED_PERMANENTLY"
      ) {
        return {
          earnedPoints: 0,
          confidence: "VERIFIED",
          explanation: `Listing shows as ${input.businessStatus.replace("_", " ").toLowerCase()}.`,
        };
      }
      return {
        earnedPoints: null,
        confidence: "UNCERTAIN",
        explanation: `Listing has an unrecognized status ("${input.businessStatus}") — can't confidently score it.`,
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
    label: "Has a website",
    category: "website",
    maxPoints: 4,
    advice:
      "Get a website for your business — it's one of the biggest trust signals for potential customers.",
    evaluate(input) {
      const has = !!input.website && input.website.trim().length > 0;
      return {
        earnedPoints: has ? 4 : 0,
        confidence: "VERIFIED",
        explanation: has ? "Business has a website on file." : "No website on file.",
      };
    },
    simulateFix: (input) => ({ ...input, website: "https://example.com" }),
  },
  {
    id: "website.https",
    label: "Uses HTTPS",
    category: "website",
    maxPoints: 6,
    advice:
      'Move your website to HTTPS — browsers flag non-HTTPS sites as "not secure," which costs trust.',
    evaluate(input) {
      if (!input.website || input.website.trim().length === 0) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: "Not applicable — no website on file to check.",
        };
      }
      if (input.httpsStatus === "https") {
        return {
          earnedPoints: 6,
          confidence: "VERIFIED",
          explanation: "Confirmed by a live check: the site loads successfully over HTTPS.",
        };
      }
      if (input.httpsStatus === "http_only") {
        return {
          earnedPoints: 0,
          confidence: "VERIFIED",
          explanation: "Confirmed by a live check: the site only loads over HTTP — no working HTTPS was found.",
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
        explanation:
          input.httpsStatus === "unreachable"
            ? "Couldn't verify HTTPS — a live check of this site timed out, hit a network error, or was blocked. Excluded from your score, not counted against you."
            : "HTTPS hasn't been checked for this site yet.",
      };
    },
    simulateFix: (input) => {
      if (!input.website || input.website.trim().length === 0) {
        return { ...input, website: "https://example.com", httpsStatus: "https" };
      }
      return { ...input, httpsStatus: "https" };
    },
  },
  {
    id: "website.performance_mobile",
    label: "Performance & mobile",
    category: "website",
    maxPoints: 10,
    advice:
      "Speed up your site — compress images, use a fast static host, and cut unnecessary scripts. A lightweight page (like PostScore's starter site) loads fast by default.",
    evaluate(input) {
      if (!input.website || input.website.trim().length === 0) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: "Not applicable — no website on file to check." };
      }
      if (!input.websiteAnalysis) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: "This site hasn't been analyzed yet — re-scan to run a real PageSpeed check.",
        };
      }
      const score = input.websiteAnalysis.mobilePerformanceScore;
      if (score === null) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation:
            "Couldn't get a real PageSpeed score for this site — either PostScore's PageSpeed check isn't configured yet, or Google's PageSpeed Insights API couldn't complete the audit. Excluded from your score, not counted against you.",
        };
      }
      const earnedPoints = roundTo((score / 100) * 10, 1);
      return {
        earnedPoints,
        confidence: "VERIFIED",
        explanation:
          score >= 80
            ? `Fast on mobile — Google PageSpeed mobile performance score of ${score}/100.`
            : score >= 50
              ? `Loads a bit slowly on mobile — Google PageSpeed mobile performance score of ${score}/100.`
              : `Loads slowly on mobile — Google PageSpeed mobile performance score of only ${score}/100.`,
      };
    },
    simulateFix: (input) => ({
      ...input,
      website: input.website || "https://example.com",
      websiteAnalysis: {
        ...(input.websiteAnalysis ?? PERFECT_WEBSITE_ANALYSIS),
        mobilePerformanceScore: 100,
      },
    }),
  },
  {
    id: "website.content_depth",
    label: "Content depth",
    category: "website",
    maxPoints: 5,
    advice:
      "Build out real content — a title and meta description, a few real headings, and a genuine amount of text about what you offer. A single bare block reads as an unfinished site to visitors and to search engines.",
    evaluate(input) {
      if (!input.website || input.website.trim().length === 0) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: "Not applicable — no website on file to check." };
      }
      const content = input.websiteAnalysis?.content ?? null;
      if (!content) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: input.websiteAnalysis
            ? "Couldn't read this site's content — the automated check may have been blocked. Excluded from your score, not counted against you."
            : "This site hasn't been analyzed yet — re-scan to check its real content.",
        };
      }
      if (content.isLikelyClientRenderedShell) {
        const recovered = content.renderedContentSignals;
        if (!recovered) {
          return { earnedPoints: null, confidence: "NOT_FOUND", explanation: CLIENT_RENDERED_SHELL_EXPLANATION };
        }
        // Recovered via Google PageSpeed's real rendered-Chrome Lighthouse
        // audits (see fetchPageSpeedMobileScore/PAGESPEED_CSR_RECOVERY_CATEGORIES
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
        if (recovered.hasTitle === true) confirmedPresent.push("a page title");
        else if (recovered.hasTitle === false) confirmedMissing.push("no page title found");
        if (recovered.hasMetaDescription === true) confirmedPresent.push("a meta description");
        else if (recovered.hasMetaDescription === false) confirmedMissing.push("no meta description found");
        if (recovered.hasViewportTag === true) confirmedPresent.push("a mobile viewport tag");
        else if (recovered.hasViewportTag === false) confirmedMissing.push("not mobile-optimized (no viewport tag)");
        if (recovered.hasHeadings === true) confirmedPresent.push("real headings");
        else if (recovered.hasHeadings === false) confirmedMissing.push("no real headings/sections");

        const explanationParts = [
          "This site renders its content with JavaScript — verified using Google's real rendered-page audit instead of a static fetch.",
        ];
        if (confirmedPresent.length > 0) explanationParts.push(`Confirmed present: ${confirmedPresent.join(", ")}.`);
        if (confirmedMissing.length > 0) explanationParts.push(`Confirmed missing: ${confirmedMissing.join("; ")}.`);
        explanationParts.push(
          "Content depth/length couldn't be independently confirmed for this site and isn't credited either way."
        );

        return { earnedPoints, confidence: "VERIFIED", explanation: explanationParts.join(" ") };
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
      if (!content.hasTitle) missing.push("no page title");
      if (!content.hasMetaDescription) missing.push("no meta description");
      if (!content.hasViewportTag) missing.push("not mobile-optimized (no viewport tag)");
      if (content.headingCount === 0) missing.push("no real headings/sections");
      if (content.visibleTextLength <= THIN_CONTENT_CHARS) missing.push("very little content — reads as a bare landing page");

      return {
        earnedPoints,
        confidence: "VERIFIED",
        explanation:
          missing.length === 0
            ? "Real, substantial content: a title, meta description, headings, and a mobile viewport tag all present."
            : `Content gaps found: ${missing.join(", ")}.`,
      };
    },
    simulateFix: (input) => ({
      ...input,
      website: input.website || "https://example.com",
      websiteAnalysis: {
        ...(input.websiteAnalysis ?? PERFECT_WEBSITE_ANALYSIS),
        content: PERFECT_WEBSITE_ANALYSIS.content,
      },
    }),
  },
  {
    id: "website.contact_conversion",
    label: "Contact & conversion",
    category: "website",
    maxPoints: 3,
    advice:
      "Add a real click-to-call phone link or email address, and a clear call-to-action (e.g. \"Call now\" or \"Book an appointment\") — visitors shouldn't have to hunt for how to reach you.",
    evaluate(input) {
      if (!input.website || input.website.trim().length === 0) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: "Not applicable — no website on file to check." };
      }
      const content = input.websiteAnalysis?.content ?? null;
      if (!content) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: input.websiteAnalysis
            ? "Couldn't read this site's content — the automated check may have been blocked. Excluded from your score, not counted against you."
            : "This site hasn't been analyzed yet — re-scan to check its real contact info and calls-to-action.",
        };
      }
      if (content.isLikelyClientRenderedShell) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: CLIENT_RENDERED_SHELL_EXPLANATION };
      }
      // Sub-point weights: a real contact link 2 / a clear CTA phrase 1 —
      // sums to 3. Contact link keeps its original weight (the more
      // reliable signal, a literal tel:/mailto: href); CTA phrase-matching
      // is the fuzzier heuristic, so it's the one trimmed to make room for
      // website.about_presence/website.services_presence.
      const hasContact = content.hasPhoneLink || content.hasEmailLink;
      const earnedPoints = (hasContact ? 2 : 0) + (content.hasCtaText ? 1 : 0);

      const problems: string[] = [];
      if (!hasContact) problems.push("no click-to-call phone or email link found");
      if (!content.hasCtaText) problems.push("no clear call-to-action found");

      return {
        earnedPoints,
        confidence: "VERIFIED",
        explanation:
          problems.length === 0
            ? "A real contact link and a clear call-to-action are both present."
            : problems.map((p) => p[0].toUpperCase() + p.slice(1)).join("; ") + ".",
      };
    },
    simulateFix: (input) => ({
      ...input,
      website: input.website || "https://example.com",
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
    label: "About / our story",
    category: "website",
    maxPoints: 1,
    advice:
      "Add a real About or Our Story page (linked from your main navigation) — a short background/team page reassures visitors this is a real, established business.",
    // Deliberately two-state, not three: a missing About *link* is never
    // proof of a missing About *section* (it may just live on the
    // homepage, which page discovery can't see into) — so there's no
    // honest "real failure" here, only "found" or "couldn't verify." See
    // WebsiteAnalysis.hasAboutPage's own doc comment for the exact
    // real-page-discovery signal this reads.
    evaluate(input) {
      if (!input.website || input.website.trim().length === 0) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: "Not applicable — no website on file to check." };
      }
      if (!input.websiteAnalysis) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: "This site hasn't been analyzed yet — re-scan to check its real navigation.",
        };
      }
      if (input.websiteAnalysis.hasAboutPage) {
        return {
          earnedPoints: 1,
          confidence: "VERIFIED",
          explanation: "Found a real About/Our Story page linked from this site's navigation or sitemap.",
        };
      }
      return {
        earnedPoints: null,
        confidence: "NOT_FOUND",
        explanation:
          "Couldn't verify — no About/Our Story page was found in this site's navigation or sitemap. A single-page site may have this content on its homepage instead, which we can't detect. Excluded from your score, not counted against you.",
      };
    },
    simulateFix: (input) => ({
      ...input,
      website: input.website || "https://example.com",
      websiteAnalysis: { ...(input.websiteAnalysis ?? PERFECT_WEBSITE_ANALYSIS), hasAboutPage: true },
    }),
  },
  {
    id: "website.services_presence",
    label: "Services / products",
    category: "website",
    maxPoints: 1,
    advice:
      "Add a real Services, Products, or Menu page (linked from your main navigation) — visitors and search engines both look for a clear list of what you offer.",
    // Same two-state reasoning as website.about_presence above — a
    // missing Services/Products *link* is never proof there's no
    // Services/Products *content*.
    evaluate(input) {
      if (!input.website || input.website.trim().length === 0) {
        return { earnedPoints: null, confidence: "NOT_FOUND", explanation: "Not applicable — no website on file to check." };
      }
      if (!input.websiteAnalysis) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: "This site hasn't been analyzed yet — re-scan to check its real navigation.",
        };
      }
      if (input.websiteAnalysis.hasServicesPage) {
        return {
          earnedPoints: 1,
          confidence: "VERIFIED",
          explanation: "Found a real Services/Products page linked from this site's navigation or sitemap.",
        };
      }
      return {
        earnedPoints: null,
        confidence: "NOT_FOUND",
        explanation:
          "Couldn't verify — no Services/Products page was found in this site's navigation or sitemap. A single-page site may list these on its homepage instead, which we can't detect. Excluded from your score, not counted against you.",
      };
    },
    simulateFix: (input) => ({
      ...input,
      website: input.website || "https://example.com",
      websiteAnalysis: { ...(input.websiteAnalysis ?? PERFECT_WEBSITE_ANALYSIS), hasServicesPage: true },
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

// ---------------------------------------------------------------------------
// Core scoring
// ---------------------------------------------------------------------------

/**
 * Scores a business from real Google Places-derived data. Pure and
 * deterministic: same input, same output, always.
 */
export function scoreBusiness(input: BusinessScoringInput): ScoreBreakdown {
  const checks: CheckResult[] = CHECKS.map((def) => {
    const result = def.evaluate(input);
    return {
      id: def.id,
      label: def.label,
      category: def.category,
      maxPoints: def.maxPoints,
      earnedPoints: result.earnedPoints,
      confidence: result.confidence,
      explanation: result.explanation,
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
        label: CATEGORY_LABELS[categoryId],
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
 * Generates the improvement suggestions for a breakdown. Every
 * suggestion comes from a check that is currently losing points
 * (determinable confidence, earnedPoints < maxPoints); its
 * promisedPoints is exactly (maxPoints - earnedPoints) for that check —
 * never a separately hand-written number. Sorted by promisedPoints,
 * highest first.
 */
export function generateSuggestions(breakdown: ScoreBreakdown): Suggestion[] {
  return breakdown.checks
    .filter((c) => isDeterminable(c.confidence) && (c.earnedPoints ?? 0) < c.maxPoints)
    .map((c) => {
      const def = findCheck(c.id);
      return {
        checkId: c.id,
        category: c.category,
        label: c.label,
        promisedPoints: roundTo(c.maxPoints - (c.earnedPoints ?? 0), 1),
        advice: def.advice,
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
export function getScoreWithSuggestions(input: BusinessScoringInput): ScoreWithSuggestions {
  const breakdown = scoreBusiness(input);
  const suggestions = generateSuggestions(breakdown);

  const projectedInput = suggestions.reduce(
    (acc, s) => applyCheckFix(acc, s.checkId),
    input
  );
  const projectedBreakdown = scoreBusiness(projectedInput);

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
    isLikelyClientRenderedShell:
      typeof v.isLikelyClientRenderedShell === "boolean" ? v.isLikelyClientRenderedShell : false,
    renderedContentSignals: v.renderedContentSignals ? parseRenderedContentSignals(v.renderedContentSignals) : null,
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
  const mobilePerformanceScore = typeof v.mobilePerformanceScore === "number" ? v.mobilePerformanceScore : null;
  const screenshotUrl = typeof v.screenshotUrl === "string" ? v.screenshotUrl : null;
  const additionalPages = parseAdditionalPages(v.additionalPages);
  const lastScreenshotRefreshAt = typeof v.lastScreenshotRefreshAt === "string" ? v.lastScreenshotRefreshAt : null;
  // A row saved before this signal existed simply predates it — the
  // honest fallback is false (same as "not found"), not a crash or a
  // fabricated true.
  const hasAboutPage = typeof v.hasAboutPage === "boolean" ? v.hasAboutPage : false;
  const hasServicesPage = typeof v.hasServicesPage === "boolean" ? v.hasServicesPage : false;
  const checkedAt = typeof v.checkedAt === "string" ? v.checkedAt : null;
  if (checkedAt === null) return null;
  return {
    content,
    mobilePerformanceScore,
    screenshotUrl,
    additionalPages,
    lastScreenshotRefreshAt,
    hasAboutPage,
    hasServicesPage,
    checkedAt,
  };
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
  };
}
