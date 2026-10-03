// Growth moves: real, honest customer-getting actions that PostScore
// can see a genuine signal for — never a score-based suggestion. Kept
// entirely separate from lib/scoring.ts and lib/actionPlan.ts on
// purpose: a growth move never earns points, is never counted in the
// projected score, and never claims to. See buildGrowthMoves() below
// for the one place a move's firing condition is decided, and
// app/actions/growthMoves.ts for the real signals it's given.

import { DEFAULT_LOCALE, formatShortDate, t, type Locale } from "@/lib/i18n";
import type { ScoreBreakdown } from "@/lib/scoring";

export type GrowthMoveId =
  | "start_coupon"
  | "start_referral"
  | "run_price_check"
  | "add_photos_vs_competitors"
  | "build_starter_site"
  | "improve_website";

export interface GrowthMove {
  id: GrowthMoveId;
  title: string;
  /** Short caption shown right under the title, distinct from `why` —
   * currently only run_price_check's real "Last checked {date}" uses
   * this. Null for every other move. */
  meta: string | null;
  why: string;
  howTo: string;
  /** The PostScore page where this move is actually done. */
  href: string;
  /** Plain-English description of the real signal that triggered this
   * move — not shown in the UI, just for debugging/tests, so a move
   * firing can always be traced back to a real, named fact rather than
   * "it seemed relevant." */
  signal: string;
}

/** Google's photo-count field itself is capped once a listing has
 * enough photos — a business already at or above this can't be
 * honestly told it has "fewer" than a competitor's own (possibly also
 * capped) count, so the comparison never fires either side of it. */
const PHOTO_COMPARISON_CAP = 10;

/** The latest saved competitor scan's real photo-count picture for this
 * business — median (not mean) so one photo-heavy or photo-empty
 * competitor doesn't skew the comparison, and never fabricated when the
 * data isn't there. */
export interface CompetitorPhotoSignal {
  /** Whether a competitor scan has ever been saved at all — see
   * getLatestCompetitorSnapshot in app/actions/competitors.ts. False
   * means "no data," never treated as "0 photos." */
  scanAvailable: boolean;
  /** Median real photo count among the scan's non-subject competitors
   * that actually have one on file. Null when no scan exists, or the
   * scan exists but not one competitor in it has a real photo count. */
  medianCompetitorPhotoCount: number | null;
}

export interface GrowthMoveSignals {
  businessId: string;
  /** Whether suggesting a referral program is appropriate for this
   * business's type at all — the exact same flag that already hides
   * the Growth page's own "Refer a friend" tab (BizProfile.referralOk,
   * config/bizProfiles.ts), false today only for lawyer (referral-fee
   * arrangements are restricted under most states' rules of
   * professional conduct). Gates start_referral below so this growth
   * move can never suggest something the app elsewhere refuses to let
   * the business actually do. Optional and defaults to true ONLY so
   * existing test fixtures built before this field existed keep
   * compiling/passing unchanged — every real caller (see
   * app/actions/growthMoves.ts) always passes the real resolved value. */
  referralOk?: boolean;
  /** True the moment a promos row has EVER existed for this business —
   * active or ended, never just "currently running." See the promos
   * table / app/actions/promos.ts. */
  hasEverCreatedPromo: boolean;
  /** Same "ever existed" reasoning as hasEverCreatedPromo, for the
   * referrals table / app/actions/referrals.ts. */
  hasEverCreatedReferral: boolean;
  /** businesses.pricing_assessed_at — null means never run. */
  pricingAssessedAt: string | null;
  /** This business's own current real Google photo count
   * (businesses.photo_count) — null means Google reports none. */
  photoCount: number | null;
  competitorPhotos: CompetitorPhotoSignal;
  /** businesses.website !== null. */
  hasWebsite: boolean;
  /** Whether website.has_website currently reads as an open score task
   * (earnedPoints below maxPoints) — always true in practice whenever
   * hasWebsite is false, since that check scores 0 with no website on
   * file. Used only to suppress build_starter_site's own "no website"
   * variant so it never triples up with the score plan's own
   * website.has_website AND completeness.website_link tasks, which
   * already carry the exact same "build a starter site" advice. */
  hasWebsiteTaskOpen: boolean;
  /** Real, localized labels (e.g. "Performance & mobile") of any
   * website.performance_mobile / website.contact_conversion checks that
   * are determinable (a website exists to analyze) AND below full
   * points right now — empty whenever hasWebsite is false, since those
   * checks are then NOT_FOUND rather than genuinely failing. */
  weakWebsiteIssueLabels: string[];
}

/** Exported so app/actions/growthMoves.ts's signals loader uses this
 * exact same implementation rather than a second, separately-maintained
 * copy. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Real, non-subject photo counts from a competitor snapshot, ready for
 * median() above — exported so app/actions/growthMoves.ts's signals
 * loader and this module always agree on exactly what counts as "real
 * data" (a non-subject entry with a non-null photoCount), never two
 * slightly different filters. */
export function competitorPhotoCounts(
  entries: Array<{ isSubject: boolean; photoCount: number | null }>
): number[] {
  return entries.filter((e) => !e.isSubject && e.photoCount !== null).map((e) => e.photoCount as number);
}

/** Real, localized labels of any determinable-but-below-full website
 * quality checks — see GrowthMoveSignals.weakWebsiteIssueLabels. Lives
 * here (not in app/actions/growthMoves.ts, a "use server" file where
 * every export must be async) so the real signals loader AND anything
 * else needing the exact same classification (e.g.
 * scripts/preview-assistant-context.ts, which can't call the
 * session-authenticated server action directly) share one real
 * implementation, never two that could quietly drift apart. */
export function weakWebsiteIssueLabels(breakdown: ScoreBreakdown): string[] {
  return breakdown.checks
    .filter(
      (c) =>
        (c.id === "website.performance_mobile" || c.id === "website.contact_conversion") &&
        c.earnedPoints !== null &&
        c.earnedPoints < c.maxPoints
    )
    .map((c) => c.label);
}

/**
 * Builds every growth move that genuinely fires for this business right
 * now — each gated on one real signal, never a guess. Order is fixed
 * (matches the priority these were specified in): coupon, referral,
 * price check, photos, starter site / improve website. "Post to Google
 * regularly" used to be the last, general-habit move here — it's now
 * covered by the Growth page's "Your weekly routine" checklist instead
 * (see app/business/[id]/growth/WeeklyChecklist.tsx). connect_gbp moved
 * out entirely too, as of step 2e's second pass — it's a real,
 * one-time setup step (see lib/actionPlan.ts's buildWeeklyPlan), so it
 * now lives in "This week's plan" instead of here, never both (see
 * item 1's no-repeats rule).
 */
export function buildGrowthMoves(signals: GrowthMoveSignals, locale: Locale = DEFAULT_LOCALE): GrowthMove[] {
  const moves: GrowthMove[] = [];
  const growthHref = `/business/${signals.businessId}/growth`;

  if (!signals.hasEverCreatedPromo) {
    moves.push({
      id: "start_coupon",
      title: t(locale, "dashboard.growth.moves.startCoupon.title"),
      meta: null,
      why: t(locale, "dashboard.growth.moves.startCoupon.why"),
      howTo: t(locale, "dashboard.growth.moves.startCoupon.howTo"),
      href: `${growthHref}?tab=coupons`,
      signal: "no promo row has ever been created for this business",
    });
  }

  if ((signals.referralOk ?? true) && !signals.hasEverCreatedReferral) {
    moves.push({
      id: "start_referral",
      title: t(locale, "dashboard.growth.moves.startReferral.title"),
      meta: null,
      why: t(locale, "dashboard.growth.moves.startReferral.why"),
      howTo: t(locale, "dashboard.growth.moves.startReferral.howTo"),
      href: `${growthHref}?tab=referral`,
      signal: "no referral row has ever been created for this business",
    });
  }

  // Always shown, never removed from this section (see item 7) — just
  // two honest variants of the same real ask, depending on whether a
  // price check has ever been run.
  const pricingHref = `/business/${signals.businessId}/pricing`;
  if (signals.pricingAssessedAt === null) {
    moves.push({
      id: "run_price_check",
      title: t(locale, "dashboard.growth.moves.runPriceCheck.title"),
      meta: null,
      why: t(locale, "dashboard.growth.moves.runPriceCheck.why"),
      howTo: t(locale, "dashboard.growth.moves.runPriceCheck.howTo"),
      href: pricingHref,
      signal: "pricing_assessed_at is null — a price check has never been run",
    });
  } else {
    moves.push({
      id: "run_price_check",
      title: t(locale, "dashboard.growth.moves.refreshPriceCheck.title"),
      meta: t(locale, "dashboard.growth.moves.refreshPriceCheck.lastChecked", {
        date: formatShortDate(signals.pricingAssessedAt, locale),
      }),
      why: t(locale, "dashboard.growth.moves.refreshPriceCheck.why"),
      howTo: t(locale, "dashboard.growth.moves.refreshPriceCheck.howTo"),
      href: pricingHref,
      signal: `pricing_assessed_at is ${signals.pricingAssessedAt}`,
    });
  }

  const yourPhotos = signals.photoCount ?? 0;
  const competitorMedian = signals.competitorPhotos.medianCompetitorPhotoCount;
  if (
    signals.competitorPhotos.scanAvailable &&
    competitorMedian !== null &&
    yourPhotos < PHOTO_COMPARISON_CAP &&
    competitorMedian > yourPhotos
  ) {
    moves.push({
      id: "add_photos_vs_competitors",
      title: t(locale, "dashboard.growth.moves.addPhotos.title"),
      meta: null,
      why: t(locale, "dashboard.growth.moves.addPhotos.why", {
        competitorPhotos: competitorMedian,
        yourPhotos,
      }),
      howTo: t(locale, "dashboard.growth.moves.addPhotos.howTo"),
      // Photos are added on Google, not in PostScore — link to the
      // Overview page, where the completeness.photos action-plan task
      // already carries the real step-by-step instructions, rather than
      // re-explaining them here or linking back to this same page.
      href: `/business/${signals.businessId}`,
      signal: `latest competitor scan's median photo count (${competitorMedian}) is higher than this business's own (${yourPhotos}), both under the ${PHOTO_COMPARISON_CAP}-photo comparison cap`,
    });
  }

  // build_starter_site (no website) and improve_website (has a website
  // but it's losing points) are mutually exclusive by construction —
  // hasWebsite decides which branch even runs — so they never fire
  // together. build_starter_site ALSO never fires alongside the score
  // plan's own no-website task (see item 5/6's no-repeats rule): that
  // task now carries the exact same "build a starter site" ask, with a
  // real points range, whenever it's open — which, since
  // website.has_website is always determinable, means whenever there's
  // no website at all. hasWebsiteTaskOpen is kept as a defensive check
  // for the (currently unreachable in practice) case where it somehow
  // isn't.
  const websiteHref = `/business/${signals.businessId}/website`;
  if (!signals.hasWebsite) {
    if (!signals.hasWebsiteTaskOpen) {
      moves.push({
        id: "build_starter_site",
        title: t(locale, "dashboard.growth.moves.buildStarterSite.title"),
        meta: null,
        why: t(locale, "dashboard.growth.moves.buildStarterSite.noWebsite"),
        howTo: t(locale, "dashboard.growth.moves.buildStarterSite.howTo"),
        href: websiteHref,
        signal: "no website on file, and website.has_website is not currently an open score task",
      });
    }
  } else if (signals.weakWebsiteIssueLabels.length > 0) {
    moves.push({
      id: "improve_website",
      title: t(locale, "dashboard.growth.moves.improveWebsite.title"),
      meta: null,
      why: t(locale, "dashboard.growth.moves.improveWebsite.why", {
        issues: signals.weakWebsiteIssueLabels.join(", "),
      }),
      howTo: t(locale, "dashboard.growth.moves.improveWebsite.howTo"),
      href: websiteHref,
      signal: `website is losing points on: ${signals.weakWebsiteIssueLabels.join(", ")}`,
    });
  }

  return moves;
}
