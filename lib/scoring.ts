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
// Every point on the board is tied to a real field that Google Places
// returned (or a real, derived fact about that field, like "does this
// URL start with https://"). Nothing here estimates search rank,
// invents an SEO score, or asks an LLM to guess a quality level. Where
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
export const SCORING_VERSION = "1.2.0";

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
  /** Star rating 0–5 as returned by Google. null = Google returned no rating. */
  rating: number | null;
  /**
   * Total review count. null = Google didn't return this field.
   * 0 is a real, verified "no reviews yet" — not the same as null.
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

const GRADE_THRESHOLDS: Array<{ grade: Grade; min: number }> = [
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

/** Detects the URL scheme without assuming a malformed URL is a failure. */
function detectScheme(website: string): "https" | "http" | "unknown" {
  const trimmed = website.trim();
  if (/^https:\/\//i.test(trimmed)) return "https";
  if (/^http:\/\//i.test(trimmed)) return "http";
  return "unknown";
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
      "Improve your average star rating — ask happy customers for reviews and follow up on negative ones.",
    evaluate(input) {
      if (input.rating === null) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: "Google returned no star rating for this listing.",
        };
      }
      const fraction = ratingFraction(input.rating);
      return {
        earnedPoints: roundTo(fraction * RATING_CHECK_MAX_POINTS, 1),
        confidence: "VERIFIED",
        explanation: `Rated ${input.rating.toFixed(1)}★ on Google.`,
      };
    },
    simulateFix: (input) => ({ ...input, rating: 4.9 }),
  },
  {
    id: "visibility.review_count",
    label: "Review count",
    category: "visibility",
    maxPoints: REVIEW_COUNT_CHECK_MAX_POINTS,
    advice:
      "Get more Google reviews — ask recent customers directly, or add a review link to receipts and follow-up emails.",
    evaluate(input) {
      if (input.reviewCount === null) {
        return {
          earnedPoints: null,
          confidence: "NOT_FOUND",
          explanation: "Google returned no review count for this listing.",
        };
      }
      const fraction = reviewCountFraction(input.reviewCount);
      return {
        earnedPoints: roundTo(fraction * REVIEW_COUNT_CHECK_MAX_POINTS, 1),
        confidence: "VERIFIED",
        explanation: `${input.reviewCount} review${input.reviewCount === 1 ? "" : "s"} on Google (full credit at ${REVIEW_COUNT_SATURATION}+).`,
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
  {
    id: "website.has_website",
    label: "Has a website",
    category: "website",
    maxPoints: 20,
    advice:
      "Get a website for your business — it's one of the biggest trust signals for potential customers.",
    evaluate(input) {
      const has = !!input.website && input.website.trim().length > 0;
      return {
        earnedPoints: has ? 20 : 0,
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
      const scheme = detectScheme(input.website);
      if (scheme === "https") {
        return {
          earnedPoints: 6,
          confidence: "VERIFIED",
          explanation: "Website uses HTTPS.",
        };
      }
      if (scheme === "http") {
        return {
          earnedPoints: 0,
          confidence: "VERIFIED",
          explanation: "Website uses HTTP, not HTTPS.",
        };
      }
      return {
        earnedPoints: null,
        confidence: "UNCERTAIN",
        explanation: "Website URL has no recognizable http/https scheme — can't verify HTTPS.",
      };
    },
    simulateFix: (input) => {
      if (!input.website) return { ...input, website: "https://example.com" };
      const withoutScheme = input.website.replace(/^https?:\/\//i, "");
      return { ...input, website: `https://${withoutScheme}` };
    },
  },
  {
    id: "website.mobile_friendly",
    label: "Mobile-friendly",
    category: "website",
    maxPoints: 2,
    advice: "Not yet implemented.",
    evaluate() {
      return {
        earnedPoints: null,
        confidence: "NOT_FOUND",
        // Deliberately not-yet-implemented, per spec: never faked, never
        // scored as a failure. A future site-quality crawler fills this in.
        explanation:
          "Not yet implemented — mobile-friendliness will be checked by a future site-quality crawler. Excluded from your score, not counted against you.",
      };
    },
    simulateFix: (input) => input,
  },
  {
    id: "website.page_speed",
    label: "Page speed",
    category: "website",
    maxPoints: 2,
    advice: "Not yet implemented.",
    evaluate() {
      return {
        earnedPoints: null,
        confidence: "NOT_FOUND",
        explanation:
          "Not yet implemented — page speed will be checked by a future site-quality crawler. Excluded from your score, not counted against you.",
      };
    },
    simulateFix: (input) => input,
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
    categories: row.categories,
    primaryCategory: row.category,
    photoCount: row.photo_count,
    businessStatus: row.business_status,
  };
}
