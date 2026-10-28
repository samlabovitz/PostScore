// The action plan: turns real scoring gaps (from lib/scoring.ts) into a
// to-do list with an honest completion loop. Pure presentation/content
// logic — this module never changes how a check is scored, it only
// explains and tracks the checks the engine already computes.
//
// Every task is derived from generateSuggestions()'s own promisedPoints
// and ordering (biggest opportunity first), so the estimate shown here
// can never drift from what the suggestion<->score guarantee already
// proves. Completion is never granted by a checkbox — see
// reconcileTasks() below, which only marks a task complete once a real
// re-scan shows the underlying check actually reached full points.

import {
  applyCheckFix,
  customerDetailsPath,
  hasAnalyzableWebsite,
  scoreBusiness,
  type BusinessScoringInput,
  type CategoryId,
  type CheckResult,
  type ScoreBreakdown,
  type Suggestion,
} from "@/lib/scoring";
import { DEFAULT_LOCALE, t, tPlural, type Locale, type MessageKey } from "@/lib/i18n";
import { keyForInfoConflict } from "@/lib/websiteTrust";
import { GOOGLE_LINKS, googleHelpUrl } from "@/lib/googleHelpLinks";
import type { Plan } from "@/lib/plan";

/**
 * Whether a check's FULL points are realistically reachable within
 * about a week of owner effort, or whether closing the gap is
 * genuinely a longer game. This separates the ACTION (what the owner
 * does) from the OUTCOME (what the check needs to fully close):
 * - "quick_win": a single, bounded action (add a field, upload a
 *   photo, ask for one fresh review) that fully satisfies the check —
 *   action and outcome are the same thing here.
 * - "quick_win_action": the FULL outcome is a longer game (a strong
 *   star rating, a saturated review count), but there's a genuine,
 *   bounded action this week (asking a handful of customers for a
 *   review) that makes real, honest — if modest — progress toward it.
 *   See `weeklyFix`/`weeklyAction` below for how that modest progress
 *   is computed and described.
 * - "longer_term": no bounded weekly action exists at all — the
 *   outcome can only be forced by an undertaking like building and
 *   publishing a website.
 * - "setup": not a real score check at all — a one-time account setup
 *   step (currently only "connect your Google Business Profile") that
 *   the weekly plan can feature alongside real score tasks. Always 0
 *   points, always links straight out via `href` rather than an
 *   "I did this" checkbox (see ActionPlanTask.href) — see
 *   buildConnectGbpWeeklyTask.
 * Hand-classified per check (not inferred from maxPoints or category)
 * so it stays an explicit, easily-tuned editorial call rather than a
 * guess — see the effort field on each entry in ACTION_PLAN_COPY.
 */
export type TaskEffort = "quick_win" | "quick_win_action" | "longer_term" | "setup";

export interface ActionPlanCopy {
  /** i18n key for why this matters for actually getting customers — not
   * just "raises your score." Resolved via t(locale, why) — see
   * content.actionPlan.* in lib/i18n/messages.ts. */
  why: MessageKey;
  /** i18n key for the high-level thing to do — for "quick_win_action"
   * entries, this describes the FULL long-run project (shown in "Bigger
   * projects"). */
  action: MessageKey;
  /** i18n key for the concrete, step-by-step how-to. */
  fix: MessageKey;
  /**
   * True when completing this task means changing something on the
   * business's Google listing (hours, photos, categories, contact
   * info, reviews) or otherwise on a platform only the owner controls.
   * Drives the honest hand-off note: PostScore prepares guidance, the
   * owner makes the actual change — never the reverse.
   */
  ownerActionOnGoogle: boolean;
  /** See TaskEffort. */
  effort: TaskEffort;
  /**
   * Only meaningful for effort "quick_win_action": i18n key for the
   * concrete, doable-this-week action, shown in "This week's plan"
   * INSTEAD of `action` — e.g. "Ask 3-5 recent customers for a review
   * this week," rather than the longer-run "grow your review base"
   * framing. Resolved via t(locale, weeklyAction).
   */
  weeklyAction?: MessageKey;
  /**
   * Only meaningful for effort "quick_win_action": the realistic input
   * change a focused week of the real action would produce (e.g. a
   * handful of new reviews) — used ONLY to compute this week's honest,
   * modest point estimate via the real scoreBusiness() function. Never
   * the check's own full simulateFix, which represents closing the
   * check completely (a saturating review count, a 4.9 rating), not a
   * single week's realistic progress.
   */
  weeklyFix?: (input: BusinessScoringInput) => BusinessScoringInput;
  /**
   * Optional i18n key for a short caveat shown alongside this task
   * whenever it's a real, open gap — for a task where doing the action
   * doesn't mean the score updates immediately (e.g. Google needs a few
   * days to re-index a newly linked website), so the owner isn't left
   * wondering why a re-scan right after "I did this" doesn't yet show
   * the points. Purely informational — never changes when points are
   * actually confirmed (that's still only ever reconcileTasks, off a
   * real re-scan).
   */
  timingNote?: MessageKey;
  /** v1.12.0 steps: a rough time estimate, in minutes. */
  minutes?: number;
  /** v1.12.0 steps: something PostScore Premium will one day do for the
   * owner — shown "Coming soon" on Premium (never a button). */
  automatable?: boolean;
}

/** A realistic number of new reviews a focused week of asking might
 * plausibly yield — deliberately modest, never the full saturating
 * volume a check's own long-run simulateFix uses. A tuned editorial
 * constant, not derived from any scoring math. */
const WEEKLY_REALISTIC_NEW_REVIEWS = 3;

/**
 * The honest "if I spend this week asking for reviews" input delta: a
 * handful of new reviews. Reused by both the rating and review-count
 * checks below, since asking for reviews is the one real action behind
 * both gaps.
 *
 * Deliberately does NOT touch mostRecentReviewDaysAgo — that's
 * review_recency's own field, a DIFFERENT check that this fix has no
 * business silently resurrecting. In production mostRecentReviewDaysAgo
 * is null for every business (not collected yet), which makes
 * review_recency NOT_FOUND — non-determinable, excluded from the
 * visibility category's possible/earned points entirely. If this fix
 * set it to 0 unconditionally, re-scoring with it would flip
 * review_recency from excluded to fully-earned (6/6), inflating the
 * category's earned-vs-possible ratio far beyond what asking for a few
 * reviews actually promised — a real check nobody merged, displayed, or
 * promised points for, silently padding the projected total. See
 * reviewAskFixIncluding below for the one place recency's own gain is
 * legitimately counted: when it's actually one of the checks being
 * merged/displayed.
 */
function weeklyReviewAskFix(input: BusinessScoringInput): BusinessScoringInput {
  return {
    ...input,
    reviewCount: (input.reviewCount ?? 0) + WEEKLY_REALISTIC_NEW_REVIEWS,
  };
}

/**
 * The same honest review-ask fix, but ALSO closes review_recency —
 * used only when review_recency is genuinely one of the checks a
 * merged reviews card stands in for (see mergeReviewTasks). Getting a
 * few fresh reviews this week does make the listing's most recent
 * review recent, so crediting review_recency here is honest — but only
 * when review_recency is an included, displayed check, never as a
 * blanket side effect of asking for reviews in general (see
 * weeklyReviewAskFix's own doc for why that would be a scoring leak).
 */
function reviewAskFixIncluding(mergedCheckIds: string[]): (input: BusinessScoringInput) => BusinessScoringInput {
  return (input) => {
    const next = weeklyReviewAskFix(input);
    // 3 new reviews this week are 3 reviews in the last 90 days — the
    // recency check's own full fix (v1.12.0).
    return mergedCheckIds.includes("visibility.review_recency") ? applyCheckFix(next, "visibility.review_recency") : next;
  };
}

const ACTION_PLAN_COPY: Record<string, ActionPlanCopy> = {
  "visibility.rating": {
    why: "content.actionPlan.visibility.rating.why",
    action: "content.actionPlan.visibility.rating.action",
    fix: "content.actionPlan.visibility.rating.fix",
    // The action itself is sharing OUR review link/QR code, not editing
    // anything on the Google listing directly — the reviews land on
    // Google because customers post them, not because the owner edited
    // their profile.
    ownerActionOnGoogle: false,
    // The FULL outcome (average rating at ~4.9, backed by enough
    // reviews to be trusted) only moves as real reviews accumulate over
    // time — but asking for reviews THIS WEEK is a real, bounded action
    // that makes honest, modest progress toward it. See weeklyFix.
    effort: "quick_win_action",
    weeklyAction: "content.actionPlan.visibility.rating.weeklyAction",
    weeklyFix: weeklyReviewAskFix,
  },
  "visibility.review_count": {
    why: "content.actionPlan.visibility.review_count.why",
    action: "content.actionPlan.visibility.review_count.action",
    fix: "content.actionPlan.visibility.review_count.fix",
    ownerActionOnGoogle: false,
    // The FULL outcome (a saturating volume of reviews) is genuinely a
    // months-long habit — but asking this week is still a real,
    // bounded action with an honest, modest weekly gain. See weeklyFix.
    effort: "quick_win_action",
    weeklyAction: "content.actionPlan.visibility.review_count.weeklyAction",
    weeklyFix: weeklyReviewAskFix,
  },
  "visibility.review_recency": {
    why: "content.actionPlan.visibility.review_recency.why",
    action: "content.actionPlan.visibility.review_recency.action",
    fix: "content.actionPlan.visibility.review_recency.fix",
    ownerActionOnGoogle: false,
    // v1.12.0: 3 reviews in the last 90 days is full points — a few asks
    // this month, so its own step ("Get fresh reviews this month").
    effort: "quick_win",
    minutes: 10,
    automatable: true,
  },
  "visibility.review_replies": {
    why: "content.actionPlan.visibility.review_replies.why",
    action: "content.actionPlan.visibility.review_replies.action",
    fix: "content.actionPlan.visibility.review_replies.fix",
    ownerActionOnGoogle: true,
    effort: "quick_win",
    minutes: 15,
    automatable: true,
  },
  "completeness.customer_details": {
    why: "content.actionPlan.completeness.customer_details.why",
    action: "content.actionPlan.completeness.customer_details.action",
    fix: "content.actionPlan.completeness.customer_details.fix",
    ownerActionOnGoogle: true,
    effort: "quick_win",
    minutes: 5,
    automatable: true,
  },
  "completeness.phone": {
    why: "content.actionPlan.completeness.phone.why",
    action: "content.actionPlan.completeness.phone.action",
    fix: "content.actionPlan.completeness.phone.fix",
    ownerActionOnGoogle: true,
    effort: "quick_win",
  },
  "completeness.address": {
    why: "content.actionPlan.completeness.address.why",
    action: "content.actionPlan.completeness.address.action",
    fix: "content.actionPlan.completeness.address.fix",
    ownerActionOnGoogle: true,
    effort: "quick_win",
  },
  "completeness.hours": {
    why: "content.actionPlan.completeness.hours.why",
    action: "content.actionPlan.completeness.hours.action",
    fix: "content.actionPlan.completeness.hours.fix",
    ownerActionOnGoogle: true,
    effort: "quick_win",
  },
  "completeness.website_link": {
    why: "content.actionPlan.completeness.website_link.why",
    action: "content.actionPlan.completeness.website_link.action",
    fix: "content.actionPlan.completeness.website_link.fix",
    ownerActionOnGoogle: true,
    // Reads the exact same `website` field as website.has_website — in
    // this data model the two checks are always in the same state, so
    // this one is only ever real once a website already exists. Without
    // one, "fixing" it is the same longer-term project as building the
    // site, never an independent quick task.
    effort: "longer_term",
  },
  "completeness.categories": {
    why: "content.actionPlan.completeness.categories.why",
    action: "content.actionPlan.completeness.categories.action",
    fix: "content.actionPlan.completeness.categories.fix",
    ownerActionOnGoogle: true,
    effort: "quick_win",
  },
  "completeness.photos": {
    why: "content.actionPlan.completeness.photos.why",
    action: "content.actionPlan.completeness.photos.action",
    fix: "content.actionPlan.completeness.photos.fix",
    ownerActionOnGoogle: true,
    effort: "quick_win",
  },
  "completeness.business_status": {
    why: "content.actionPlan.completeness.business_status.why",
    action: "content.actionPlan.completeness.business_status.action",
    fix: "content.actionPlan.completeness.business_status.fix",
    ownerActionOnGoogle: true,
    effort: "quick_win",
  },
  "website.has_website": {
    why: "content.actionPlan.website.has_website.why",
    action: "content.actionPlan.website.has_website.action",
    fix: "content.actionPlan.website.has_website.fix",
    ownerActionOnGoogle: false,
    // The starter-site builder turns this into a genuinely bounded,
    // this-week action (minutes, not a real project) — see
    // mergeWebsiteTasks below for why it's paired with
    // completeness.website_link (the exact same underlying `website`
    // field, always open or closed together).
    effort: "quick_win",
    timingNote: "content.actionPlan.website.has_website.timingNote",
  },
  "website.https": {
    why: "content.actionPlan.website.https.why",
    action: "content.actionPlan.website.https.action",
    fix: "content.actionPlan.website.https.fix",
    ownerActionOnGoogle: false,
    // Flipping on a host's free SSL certificate is normally a few
    // minutes of settings, not a rebuild.
    effort: "quick_win",
  },
  "website.performance_mobile": {
    why: "content.actionPlan.website.performance_mobile.why",
    action: "content.actionPlan.website.performance_mobile.action",
    fix: "content.actionPlan.website.performance_mobile.fix",
    ownerActionOnGoogle: false,
    // Real, measured site-speed work is a project, not a same-week fix.
    effort: "longer_term",
  },
  "website.content_depth": {
    why: "content.actionPlan.website.content_depth.why",
    action: "content.actionPlan.website.content_depth.action",
    fix: "content.actionPlan.website.content_depth.fix",
    ownerActionOnGoogle: false,
    effort: "longer_term",
    // Not a normal weekly candidate (effort stays longer_term — full
    // content richness is genuinely a bigger project) — but the three
    // technical fields (title/meta description/viewport tag) ARE a
    // real, bounded weekly action, used ONLY as a last-resort weekly-
    // plan promotion when no quick_win/quick_win_action task qualifies
    // (see buildWeeklyPlan's promotion step).
    weeklyAction: "content.actionPlan.website.content_depth.weeklyAction",
    weeklyFix: (input) =>
      input.websiteAnalysis?.content
        ? {
            ...input,
            websiteAnalysis: {
              ...input.websiteAnalysis,
              content: { ...input.websiteAnalysis.content, hasTitle: true, hasMetaDescription: true, hasViewportTag: true },
            },
          }
        : input,
  },
  "website.contact_conversion": {
    why: "content.actionPlan.website.contact_conversion.why",
    action: "content.actionPlan.website.contact_conversion.action",
    fix: "content.actionPlan.website.contact_conversion.fix",
    ownerActionOnGoogle: false,
    effort: "longer_term",
    // Same reasoning as content_depth above — a real phone link and a
    // clear call-to-action are a genuine weekly-sized step, used only
    // for last-resort weekly-plan promotion.
    weeklyAction: "content.actionPlan.website.contact_conversion.weeklyAction",
    weeklyFix: (input) =>
      input.websiteAnalysis?.content
        ? {
            ...input,
            websiteAnalysis: {
              ...input.websiteAnalysis,
              content: { ...input.websiteAnalysis.content, hasPhoneLink: true, hasCtaText: true },
            },
          }
        : input,
  },
};

const FALLBACK_COPY: ActionPlanCopy = {
  why: "content.actionPlan.fallback.why",
  action: "content.actionPlan.fallback.action",
  fix: "content.actionPlan.fallback.fix",
  ownerActionOnGoogle: false,
  // Conservative default for any future check without explicit copy
  // above: never assume an unclassified check is a quick win.
  effort: "longer_term",
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The 0–100 total BEFORE the final `Math.round()` scoreBusiness() itself
 * applies — recomputed here by reading the exact same public category
 * fields (weight/possiblePoints/earnedPoints) scoreBusiness() already
 * exposes on ScoreBreakdown, never a second scoring decision or a
 * change to lib/scoring.ts. Exists so a set of per-task point displays
 * can be rounded ONCE, together, against the real total (see
 * apportionToTotal) instead of each independently rounding against an
 * already-rounded number and drifting out of sum with it.
 */
export function rawWeightedTotal(breakdown: ScoreBreakdown): number {
  const determinable = breakdown.categories.filter((c) => c.possiblePoints > 0);
  const totalPossibleWeight = determinable.reduce((sum, c) => sum + c.weight, 0);
  if (totalPossibleWeight === 0) return 0;
  const totalEarnedWeight = determinable.reduce(
    (sum, c) => sum + (c.earnedPoints / c.possiblePoints) * c.weight,
    0
  );
  return (totalEarnedWeight / totalPossibleWeight) * 100;
}

/**
 * The real, honest weighted value of applying `fix` — exactly what it
 * would move the 0–100 total (and so "Points within reach") by,
 * computed identically for every task type (a quick_win's full fix, a
 * quick_win_action's weekly or full fix, a merge's combined fix) so no
 * card can ever show a number in different units than the projection.
 * Most checks' categories have weight == possiblePoints (completeness,
 * and visibility whenever review_recency is also determinable), where
 * this equals the check's own raw points — but website.has_website and
 * website.https are real counterexamples: often the ONLY determinable
 * check in the 30-weight "website" category, so closing one is worth
 * far more of the total than its own small raw-point value suggests.
 * Never negative — a realistic fix never makes the total worse.
 */
function weightedFixPoints(
  breakdown: ScoreBreakdown,
  input: BusinessScoringInput,
  fix: (input: BusinessScoringInput) => BusinessScoringInput
): number {
  const after = scoreBusiness(fix(input));
  return Math.max(0, rawWeightedTotal(after) - rawWeightedTotal(breakdown));
}

/**
 * Rounds a set of raw (unrounded) weighted-point values to 1-decimal
 * display numbers that sum to EXACTLY `targetTotal` (an integer — the
 * real "Points within reach" delta) via largest-remainder apportionment:
 * floor every value to 1 decimal, then hand out the leftover tenths (or
 * claw back excess ones) to whichever values have the largest (or
 * smallest) fractional remainder. Independent per-task rounding can't
 * guarantee an exact sum — this is exactly the "cards don't add up to
 * the total already shown on the page" bug this exists to prevent.
 */
function apportionToTotal(rawValues: number[], targetTotal: number): number[] {
  if (rawValues.length === 0) return [];

  const scale = 10; // 1 decimal place
  const targetUnits = Math.round(targetTotal * scale);
  const floors = rawValues.map((v) => Math.floor(v * scale));
  let remainder = targetUnits - floors.reduce((sum, f) => sum + f, 0);

  const byRemainderDesc = rawValues
    .map((v, i) => ({ i, frac: v * scale - floors[i] }))
    .sort((a, b) => b.frac - a.frac);

  const units = [...floors];
  // Hand out (or claw back) the full remainder, most-deserving entry
  // first, wrapping around as many times as needed — never capped at
  // one pass. The additive per-task deltas are exact (each task's own
  // fix touches disjoint checks), but `targetTotal` here is the
  // DIFFERENCE of two independently-rounded totals (today's and the
  // projected one), which can drift up to a full point from the true
  // raw sum — one entry alone can't always absorb that on a single
  // ±1 pass, so this keeps looping until the sum matches exactly.
  let i = 0;
  while (remainder > 0) {
    units[byRemainderDesc[i % byRemainderDesc.length].i] += 1;
    i++;
    remainder--;
  }
  i = 0;
  while (remainder < 0) {
    units[byRemainderDesc[i % byRemainderDesc.length].i] -= 1;
    i++;
    remainder++;
  }
  return units.map((u) => u / scale);
}

/** Applies every merged check's own REAL simulateFix in sequence — the
 * full-outcome fix for a merged card's weightedPoints (Bigger Projects
 * framing), as opposed to a merge's own weekly-scoped fix (see
 * reviewAskFixIncluding for reviews; the website merge's two checks
 * share one identical simulateFix, so this degenerates to that same
 * fix there too). */
function fullMergeFix(mergedCheckIds: string[]): (input: BusinessScoringInput) => BusinessScoringInput {
  return (input) => mergedCheckIds.reduce((acc, id) => applyCheckFix(acc, id), input);
}

// ---------------------------------------------------------------------
// "How to fix it": the steps, a rough time and official links per check —
// the same for the Score breakdown rows and the Growth plan's cards.
// ---------------------------------------------------------------------

/** A rough time per check, in minutes (an honest estimate, never a promise). */
export const CHECK_MINUTES: Record<string, number> = {
  "visibility.rating": 10,
  "visibility.review_count": 10,
  "visibility.review_recency": 10,
  "visibility.review_replies": 15,
  "completeness.phone": 2,
  "completeness.address": 5,
  "completeness.hours": 5,
  "completeness.website_link": 2,
  "completeness.categories": 5,
  "completeness.photos": 15,
  "completeness.business_status": 5,
  "completeness.customer_details": 5,
  "website.has_website": 120,
  "website.https": 30,
  "website.performance_mobile": 120,
  "website.content_depth": 30,
  "website.contact_conversion": 20,
  "website.about_presence": 30,
  "website.services_presence": 30,
  "website.social_links": 10,
  "website.security": 60,
  "website.info_consistency": 10,
  "website.notice_freshness": 10,
  "website.site_freshness": 30,
};

/** Official links per check (lib/googleHelpLinks.ts — each one checked to
 * load). None for website content checks: Google has no page for them,
 * so they point to PostScore's own Website page instead. */
export function officialLinksFor(checkId: string, locale: Locale = DEFAULT_LOCALE): TaskLink[] {
  const g = (href: string, label: MessageKey): TaskLink => ({ href: googleHelpUrl(href, locale), label: t(locale, label), external: true });
  const profile = g(GOOGLE_LINKS.businessProfile, "content.actionPlan.link.gbp");
  switch (checkId) {
    case "visibility.rating":
    case "visibility.review_count":
    case "visibility.review_recency":
    case MERGED_REVIEW_CHECK_ID:
      return [g(GOOGLE_LINKS.getReviewsHelp, "content.actionPlan.link.getReviewsHelp")];
    case "visibility.review_replies":
      return [g(GOOGLE_LINKS.businessProfileReviews, "content.actionPlan.link.googleReviews"), g(GOOGLE_LINKS.reviewsHelp, "content.actionPlan.link.googleReviewsHelp")];
    case "completeness.phone":
    case "completeness.address":
    case "completeness.hours":
    case "completeness.website_link":
    case "completeness.business_status":
    case "website.info_consistency":
      return [profile, g(GOOGLE_LINKS.editProfileHelp, "content.actionPlan.link.editProfileHelp")];
    case "completeness.categories":
      return [profile, g(GOOGLE_LINKS.categoryHelp, "content.actionPlan.link.categoryHelp")];
    case "completeness.photos":
      return [profile, g(GOOGLE_LINKS.photosHelp, "content.actionPlan.link.photosHelp")];
    case "completeness.customer_details":
      return [profile, g(GOOGLE_LINKS.attributesHelp, "content.checks.completeness.customer_details.link.help")];
    case "website.https":
      return [g(GOOGLE_LINKS.httpsWhy, "content.actionPlan.link.httpsWhy")];
    case "website.performance_mobile":
      return [g(GOOGLE_LINKS.pageSpeed, "content.actionPlan.link.pageSpeed")];
    case "website.security":
      return [g(GOOGLE_LINKS.safeBrowsing, "content.actionPlan.link.safeBrowsing")];
    default:
      return [];
  }
}

/** Customer details' steps, naming only the parts that count for this
 * business — parking and payment notes only where they count. */
export function customerDetailsFixText(parts: readonly string[], locale: Locale = DEFAULT_LOCALE): string {
  const lines = [t(locale, "content.actionPlan.completeness.customer_details.fix", { path: customerDetailsPath(parts, locale) })];
  if (parts.includes("payment")) lines.push(t(locale, "content.checks.completeness.customer_details.paymentNote"));
  if (parts.includes("parking")) lines.push(t(locale, "content.checks.completeness.customer_details.parkingNote"));
  return lines.join(" ");
}

/** The steps for a check — the plan card's "How" text. */
export function checkFixText(check: Pick<CheckResult, "id" | "meta">, locale: Locale = DEFAULT_LOCALE): string {
  if (check.id === "completeness.customer_details") {
    return customerDetailsFixText((check.meta?.parts ?? "accessibility,payment,parking").split(",").filter(Boolean), locale);
  }
  return t(locale, (ACTION_PLAN_COPY[check.id] ?? FALLBACK_COPY).fix);
}

/** The card title for a check: the action, falling back to its name. */
export function checkTitle(checkId: string, label: string, locale: Locale = DEFAULT_LOCALE): string {
  const key = `content.actionPlan.title.${checkId}` as MessageKey;
  const title = t(locale, key);
  return title === key ? label : title;
}

/** "About 15 min" / "About 2 hr" — a rough estimate. */
export function timeEstimateText(minutes: number, locale: Locale = DEFAULT_LOCALE): string {
  return minutes >= 60
    ? t(locale, "content.actionPlan.step.hours", { hours: Math.round((minutes / 60) * 10) / 10 })
    : t(locale, "content.actionPlan.step.minutes", { minutes });
}

export interface CheckHowTo {
  steps: string;
  minutes: number | null;
  links: TaskLink[];
}

/** A Score breakdown row's own "How to fix it". */
export function checkHowTo(check: Pick<CheckResult, "id" | "meta">, locale: Locale = DEFAULT_LOCALE): CheckHowTo {
  return { steps: checkFixText(check, locale), minutes: CHECK_MINUTES[check.id] ?? null, links: officialLinksFor(check.id, locale) };
}

/** Shape of a row from the `tasks` table — only the fields the plan needs. */
export interface TaskRow {
  id: string;
  check_id: string;
  status: "pending_verification" | "completed";
  promised_points: number;
  marked_done_at: string | null;
  verified_at: string | null;
  /** The real raw metric value (e.g. review count) at the moment this
   * task was marked done — see weeklyTrackedMetricValue below. Null for
   * one-shot checks (no numeric weekly target exists for them) and for
   * rows marked before this column existed. */
  marked_metric_value: number | null;
}

export interface ActionPlanTask {
  checkId: string;
  category: CategoryId;
  label: string;
  /** What's actually wrong — the real, dynamic check explanation, not generic copy. */
  problem: string;
  why: string;
  action: string;
  fix: string;
  ownerActionOnGoogle: boolean;
  /** The points this check is currently missing RIGHT NOW, from the live
   * breakdown — an ESTIMATE, confirmed only by a re-scan. */
  promisedPoints: number;
  status: "open" | "pending_verification";
  markedDoneAt: string | null;
  /** The points this check was missing at the moment the owner marked it
   * done — the real, stored `tasks.promised_points` value, distinct from
   * the live `promisedPoints` above. Comparing the two is how the UI
   * tells a still-pending task apart as "no real change yet" vs "real
   * progress, just not there yet" vs "this got worse" — never a new
   * judgment call, just the same real numbers already computed. Null
   * when the task was never marked done (status "open"). */
  markedPromisedPoints: number | null;
  /** The real raw metric value (e.g. review count) recorded when the
   * owner most recently marked this task done — the numeric counterpart
   * to markedPromisedPoints, used to compute honest "1 of 3, X to go"
   * progress against weeklyTargetDelta (see weeklyMetricProgress). Null
   * when never marked, or marked before this tracking existed. */
  markedMetricValue: number | null;
  /** See TaskEffort — drives which tasks can appear in this week's plan. */
  effort: TaskEffort;
  /**
   * An OBTAINABLE weekly goal, in plain language — e.g. "Get 3+ new
   * reviews this week (14 → 17+)" — never the full gap ("reach 150
   * reviews"). Only ever set on the copy of a "quick_win_action" task
   * that buildWeeklyPlan places in weeklyTasks (see
   * deriveWeeklyTargetInfo), computed by literally diffing the same real
   * weeklyFix input used to project this week's points, so the number
   * here can never drift from the real mechanics. Null everywhere else —
   * a one-shot task's own `action`/`fix` already IS its obtainable
   * target.
   */
  weeklyTarget: string | null;
  /** The numeric counterpart to weeklyTarget's label — how many of the
   * tracked metric fully satisfies this week's goal (e.g. 3 new
   * reviews). Null whenever weeklyTarget itself is null or non-numeric
   * (falls back to a plain weeklyAction string with nothing to compare
   * against). */
  weeklyTargetDelta: number | null;
  /** The real current value of the metric weeklyTargetDelta is measured
   * against (e.g. the live review count), read fresh every time — never
   * stale, never the value from when the task was marked. Null when this
   * task has no numeric weekly target. */
  currentMetricValue: number | null;
  /**
   * Set only on the merged reviews card (see mergeReviewTasks below) —
   * the real underlying checkIds it stands in for (2 or 3 of
   * visibility.rating/review_count/review_recency). `checkId` itself is
   * a synthetic id (MERGED_REVIEW_CHECK_ID) that names no real check —
   * "I did this" on this card must mark every id here instead, and the
   * real `tasks` DB rows/check ids behind each one are completely
   * unaffected by the merge. Null on every normal task.
   */
  mergedCheckIds: string[] | null;
  /** Each merged check's own short label, same order as
   * mergedCheckIds — e.g. ["Star rating", "Review count", "Review
   * recency"] — so the merged card can honestly list what it helps
   * with instead of hiding the specifics behind one combined title.
   * Null whenever mergedCheckIds is null. */
  mergedLabels: string[] | null;
  /** Short caveat shown alongside this task — see ActionPlanCopy's
   * timingNote doc. Null for every task without one. */
  timingNote: string | null;
  /** The merged reviews card's explanations, one per line (review count
   * and rating each have their own "full credit at …"), so they're never
   * run together into one confusing sentence. */
  problemLines?: string[] | null;
  /**
   * This task's REAL contribution to the 0–100 total if its fix were
   * applied alone — i.e. exactly what it would move "Points within
   * reach" by, in the SAME weighted units the projection uses. This is
   * the number every card should display, never `promisedPoints` (a
   * raw check-points figure that only happens to match the weighted
   * total for most checks — website.has_website and website.https are
   * real counterexamples: a small raw-point check can be the ONLY
   * determinable check in its whole category, so closing it is worth
   * far more of the weighted total than its own raw points suggest).
   * See weightedFixPoints/rawWeightedTotal for how this is computed,
   * and apportionToTotal for how a picked set of these are rounded so
   * they sum to exactly the same integer the projection shows.
   */
  weightedPoints: number;
  /**
   * Set only for the no-website starter-site task (see mergeWebsiteTasks
   * and lib/starterSiteScoring.ts): when non-null, `weightedPoints` is
   * the honest LOW end of a real range and this is the HIGH end — what
   * the template guarantees regardless of hosting vs. what it's worth
   * once HTTPS and full mobile performance are also true, which depend
   * on where the owner hosts it. Null for every other task, which shows
   * a single exact value.
   */
  weightedPointsHigh: number | null;
  /**
   * Set only for a "setup" task (see TaskEffort) — the PostScore page
   * this links straight out to, shown as a plain link/button instead of
   * an "I did this" checkbox (there's no score check to reconcile on a
   * re-scan). Null for every real score task, which uses the normal
   * mark-done flow instead.
   */
  href: string | null;
  /**
   * Set only alongside weightedPointsHigh — the real website-related
   * input overlay (website/httpsStatus/websiteAnalysis) for the LOW and
   * HIGH ends of the starter-site range, so buildWeeklyPlan's
   * projection can honestly reflect each scenario instead of guessing
   * from the two numbers alone. Null for every other task.
   */
  rangeLowOverlay: Partial<BusinessScoringInput> | null;
  rangeHighOverlay: Partial<BusinessScoringInput> | null;
  /** v1.12.0 steps: a rough time estimate, in minutes. */
  minutes?: number | null;
  /** v1.12.0 steps: where to do it — PostScore pages and official Google
   * links only (lib/googleHelpLinks.ts). Set by withStepLinks. */
  links?: TaskLink[];
  /** Shown "Coming soon: PostScore can do this for you" on Premium. */
  automatable?: boolean;
  /** The card's title — the action ("Add your business hours"); `label`
   * (the check's name) is the small label under it. */
  title?: string;
  /** The merged reviews card only: checks its fix also counts toward that
   * aren't open tasks themselves (review recency while it can't be
   * confirmed) — in the estimate and "Helps with", never marked done. */
  fixAlsoCovers?: string[];
}

export interface TaskLink {
  href: string;
  label: string;
  /** An official Google page (opens in a new tab). */
  external: boolean;
}

export interface CompletedTask {
  checkId: string;
  label: string;
  /** The real points gained, as recorded when the fix was marked done and later confirmed. */
  pointsGained: number;
  verifiedAt: string | null;
}

/** website.has_website's honest task text when the business already has
 * a real website — see buildActionPlan. Null = the normal "get a
 * website" copy applies (truly no website). */
function hasWebsiteTaskText(input: BusinessScoringInput, locale: Locale): { action: string; why: string; fix: string } | null {
  if (input.website && input.websiteAnalysis?.websiteTrust?.listingLinkBroken) {
    return {
      action: t(locale, "growth.fix.brokenListingLink.action"),
      why: t(locale, "growth.fix.brokenListingLink.why"),
      fix: t(locale, "growth.fix.brokenListingLink.fix"),
    };
  }
  if (input.verifiedElsewhereUrl) {
    return {
      action: t(locale, "growth.fix.addWebsiteToListing.heading"),
      why: t(locale, "growth.fix.addWebsiteToListing.intro"),
      fix: [
        t(locale, "growth.fix.addWebsiteToListing.step1"),
        t(locale, "growth.fix.addWebsiteToListing.step2"),
        t(locale, "growth.fix.addWebsiteToListing.step3", { url: input.verifiedElsewhereUrl }),
        t(locale, "growth.fix.addWebsiteToListing.step4"),
      ].join(" "),
    };
  }
  return null;
}

/**
 * Builds the ordered action plan from a live breakdown. Reuses
 * generateSuggestions()'s own output directly — same filtering
 * (determinable checks only, so NOT_FOUND/not-yet-implemented checks
 * like mobile-friendliness never appear) and same biggest-opportunity-
 * first ordering. `taskRows` overlays any in-flight "I did this" status;
 * a task with no matching row is simply open. `input` is only used to
 * compute each task's real weightedPoints (see its own doc) — never to
 * re-derive anything reconcileTasks/markTaskDone already own.
 */
export function buildActionPlan(
  breakdown: ScoreBreakdown,
  suggestions: Suggestion[],
  taskRows: TaskRow[],
  input: BusinessScoringInput,
  locale: Locale = DEFAULT_LOCALE
): ActionPlanTask[] {
  const rowByCheckId = new Map(taskRows.map((row) => [row.check_id, row]));

  return suggestions.map((s) => {
    const check = breakdown.checks.find((c) => c.id === s.checkId)!;
    const copy = ACTION_PLAN_COPY[s.checkId] ?? FALLBACK_COPY;
    const row = rowByCheckId.get(s.checkId);
    // Step 2d (text only): "Get a website up" is wrong for a business that
    // HAS one — a broken Google-listing link, or a real site verified
    // elsewhere. Every plan built from this (including the monthly
    // report's top task) gets the honest Google-listing action instead.
    const websiteText = s.checkId === "website.has_website" ? hasWebsiteTaskText(input, locale) : null;

    return {
      checkId: s.checkId,
      category: s.category,
      label: s.label,
      problem: check.explanation,
      why: websiteText?.why ?? t(locale, copy.why),
      action: websiteText?.action ?? t(locale, copy.action),
      fix: websiteText?.fix ?? checkFixText(check, locale),
      // A site that exists but isn't on the listing: link it, not "get one".
      title: websiteText ? checkTitle("completeness.website_link", s.label, locale) : checkTitle(s.checkId, s.label, locale),
      ownerActionOnGoogle: websiteText ? true : copy.ownerActionOnGoogle,
      promisedPoints: s.promisedPoints,
      status: row?.status === "pending_verification" ? "pending_verification" : "open",
      markedDoneAt: row?.marked_done_at ?? null,
      markedPromisedPoints: row?.status === "pending_verification" ? row.promised_points : null,
      markedMetricValue: row?.status === "pending_verification" ? row.marked_metric_value : null,
      effort: copy.effort,
      weeklyTarget: null,
      weeklyTargetDelta: null,
      currentMetricValue: null,
      mergedCheckIds: null,
      mergedLabels: null,
      timingNote: copy.timingNote ? t(locale, copy.timingNote) : null,
      minutes: CHECK_MINUTES[s.checkId] ?? null,
      links: officialLinksFor(websiteText ? "completeness.website_link" : s.checkId, locale),
      automatable: copy.automatable ?? false,
      weightedPoints: round1(weightedFixPoints(breakdown, input, (inp) => applyCheckFix(inp, s.checkId))),
      weightedPointsHigh: null,
      href: null,
      rangeLowOverlay: null,
      rangeHighOverlay: null,
    };
  });
}

/** Synthetic checkId for the merged reviews card — never a real check,
 * never persisted, never scored. See mergeReviewTasks below. */
export const MERGED_REVIEW_CHECK_ID = "visibility.reviews_merged";

/** Merged into ONE "Get fresh reviews" card whenever two or more are
 * losing points (the same action helps all three); a single one keeps its
 * own card. Order: how "Helps with" lists them. */
const REVIEW_CHECK_IDS: readonly string[] = [
  "visibility.review_count",
  "visibility.rating",
  "visibility.review_recency",
];

/** The v1.12.0 steps: always in this week's plan while they're losing
 * points (pinned — short, owner-doable, never taking another task's slot). */
export const V112_STEP_CHECK_IDS: readonly string[] = [
  "visibility.review_replies",
  "visibility.review_recency",
  "completeness.customer_details",
];

/**
 * Combines visibility.rating/review_count/review_recency into ONE card
 * whenever more than one is still an open gap. All three point back at
 * the exact same real action (ask customers for a review — see
 * weeklyReviewAskFix), so showing up to three near-duplicate "ask for
 * reviews" cards would just be noise dressed up as three different
 * tasks. This is a pure display-time transform over buildActionPlan's
 * own output: the underlying `tasks` DB rows and real check ids are
 * completely untouched, so every downstream consumer (buildWeeklyPlan,
 * markTaskDone, task history) keeps working against the real ids —
 * only the UI ever sees the merged card, via its `mergedCheckIds`.
 */
export function mergeReviewTasks(
  tasks: ActionPlanTask[],
  breakdown: ScoreBreakdown,
  input: BusinessScoringInput,
  locale: Locale = DEFAULT_LOCALE
): ActionPlanTask[] {
  const reviewTasks = REVIEW_CHECK_IDS.map((id) => tasks.find((task) => task.checkId === id)).filter((task): task is ActionPlanTask => !!task);
  if (reviewTasks.length < 2) return tasks;

  const mergedCheckIds = reviewTasks.map((task) => task.checkId);
  // Recency that can't be confirmed yet (left out of the score) still
  // moves with the same fresh reviews: in "Helps with" and the estimate,
  // never an "I did this" row of its own.
  const recency = breakdown.checks.find((c) => c.id === "visibility.review_recency");
  const fixAlsoCovers = recency && !mergedCheckIds.includes(recency.id) && recency.earnedPoints === null ? [recency.id] : [];
  const mergedLabels = [...reviewTasks.map((task) => task.label), ...(fixAlsoCovers.length > 0 ? [recency!.label] : [])];

  // Whichever of rating/review_count is present drives the real weekly
  // review-count target — both share the literal same weeklyFix
  // (weeklyReviewAskFix), so either gives the identical, real number.
  // At least one of the two is always present here: review_recency has
  // no weeklyFix of its own, so a merge of review_recency with just one
  // other check always includes rating or review_count too.
  const weeklyFixSourceId = mergedCheckIds.find((id) => ACTION_PLAN_COPY[id]?.weeklyFix) ?? null;
  const targetInfo = weeklyFixSourceId ? deriveWeeklyTargetInfo(weeklyFixSourceId, input, locale) : null;

  const mergedTask: ActionPlanTask = {
    checkId: MERGED_REVIEW_CHECK_ID,
    category: "visibility",
    label: t(locale, "content.actionPlan.mergedReviews.label"),
    title: t(locale, "content.actionPlan.mergedReviews.title"),
    minutes: CHECK_MINUTES["visibility.review_count"],
    links: officialLinksFor(MERGED_REVIEW_CHECK_ID, locale),
    fixAlsoCovers,
    problem: reviewTasks.map((task) => task.problem).join(" "),
    problemLines: reviewTasks.map((task) => task.problem),
    why: t(locale, "content.actionPlan.mergedReviews.why"),
    action: t(locale, "content.actionPlan.mergedReviews.action"),
    fix: t(locale, "content.actionPlan.mergedReviews.fix"),
    ownerActionOnGoogle: false,
    promisedPoints: round1(reviewTasks.reduce((sum, task) => sum + task.promisedPoints, 0)),
    status: reviewTasks.some((task) => task.status === "pending_verification")
      ? "pending_verification"
      : "open",
    markedDoneAt:
      reviewTasks
        .map((task) => task.markedDoneAt)
        .filter((d): d is string => d !== null)
        .sort()
        .pop() ?? null,
    // The merged card gets its own simplified open/pending treatment in
    // the UI (see ActionPlanSection.tsx) rather than forcing the
    // existing single-check progress math to reconcile three different
    // checks' markedPromisedPoints/markedMetricValue at once.
    markedPromisedPoints: null,
    markedMetricValue: null,
    effort: "quick_win_action",
    weeklyTarget: targetInfo?.label ?? null,
    weeklyTargetDelta: targetInfo?.targetDelta ?? null,
    currentMetricValue: weeklyFixSourceId ? weeklyTrackedMetricValue(weeklyFixSourceId, input) : null,
    mergedCheckIds,
    mergedLabels,
    timingNote: null,
    weightedPoints: round1(weightedFixPoints(breakdown, input, fullMergeFix([...mergedCheckIds, ...fixAlsoCovers]))),
    weightedPointsHigh: null,
    href: null,
    rangeLowOverlay: null,
    rangeHighOverlay: null,
  };

  const merged: ActionPlanTask[] = [];
  let inserted = false;
  for (const task of tasks) {
    if (REVIEW_CHECK_IDS.includes(task.checkId)) {
      if (!inserted) {
        merged.push(mergedTask);
        inserted = true;
      }
      continue;
    }
    merged.push(task);
  }
  return merged;
}

/** Synthetic checkId for the merged starter-site card — never a real
 * check, never persisted, never scored. See mergeWebsiteTasks below. */
export const MERGED_WEBSITE_CHECK_ID = "website.starter_site_merged";

const WEBSITE_CHECK_IDS: readonly string[] = ["website.has_website", "completeness.website_link"];

/**
 * Combines website.has_website and completeness.website_link into ONE
 * card whenever there's no website — unlike the review checks above,
 * these two are DETERMINISTICALLY coupled (both evaluate the exact same
 * `website` field with the exact same presence test — see lib/scoring.ts),
 * so they're always open or closed together, never independently. That
 * means projecting has_website's fix alone would silently ALSO close
 * website_link in the real breakdown (same underlying fact, so honestly
 * it SHOULD close) — but showing only has_website's own points while
 * the real score moves by both checks' combined total is exactly the
 * "displayed points ≠ projected gain" bug fixed in step 2c. Merging
 * them into one card that shows their honest combined total keeps the
 * projection matching what's actually displayed. Pure display-time
 * transform, same as mergeReviewTasks: the underlying `tasks` DB rows
 * and real check ids are untouched.
 */
export function mergeWebsiteTasks(
  tasks: ActionPlanTask[],
  breakdown: ScoreBreakdown,
  input: BusinessScoringInput,
  locale: Locale = DEFAULT_LOCALE,
  /**
   * The real starter-template LOW/HIGH weighted-points range plus each
   * scenario's real website-related input overlay (see
   * lib/starterSiteScoring.ts and app/actions/actionPlan.ts's
   * estimateStarterSiteRange) — only ever real when this business has
   * no website (the only case this merge fires for at all). When
   * omitted (a caller with no business-profile data to build the
   * template from, e.g. the assistant), the merged card falls back to
   * a single weightedFixPoints value like any other task.
   */
  starterSiteRange: {
    low: number;
    high: number;
    lowOverlay: Partial<BusinessScoringInput>;
    highOverlay: Partial<BusinessScoringInput>;
  } | null = null
): ActionPlanTask[] {
  // Only for a listing with NO website at all — a listing whose link is
  // broken (Step 2d, the real Wonder case) keeps its own Google-listing
  // fix card instead of a "build a starter site" offer.
  if (input.website && input.website.trim().length > 0) return tasks;
  const websiteTasks = tasks.filter((task) => WEBSITE_CHECK_IDS.includes(task.checkId));
  if (websiteTasks.length < 2) return tasks;

  const hasWebsiteTask = websiteTasks.find((task) => task.checkId === "website.has_website");
  const copy = ACTION_PLAN_COPY["website.has_website"];
  const mergedCheckIds = websiteTasks.map((task) => task.checkId);

  const mergedTask: ActionPlanTask = {
    checkId: MERGED_WEBSITE_CHECK_ID,
    category: "website",
    label: hasWebsiteTask?.label ?? t(locale, "content.checks.website.has_website.label"),
    problem: websiteTasks.map((task) => task.problem).join(" "),
    why: t(locale, copy.why),
    action: t(locale, copy.action),
    fix: t(locale, copy.fix),
    ownerActionOnGoogle: false,
    promisedPoints: round1(websiteTasks.reduce((sum, task) => sum + task.promisedPoints, 0)),
    status: websiteTasks.some((task) => task.status === "pending_verification")
      ? "pending_verification"
      : "open",
    markedDoneAt:
      websiteTasks
        .map((task) => task.markedDoneAt)
        .filter((d): d is string => d !== null)
        .sort()
        .pop() ?? null,
    // Same simplified open/pending treatment as the merged reviews card
    // — see its own comment on this exact pattern above.
    markedPromisedPoints: null,
    markedMetricValue: null,
    effort: "quick_win",
    weeklyTarget: null,
    weeklyTargetDelta: null,
    currentMetricValue: null,
    mergedCheckIds,
    mergedLabels: websiteTasks.map((task) => task.label),
    timingNote: copy.timingNote ? t(locale, copy.timingNote) : null,
    weightedPoints: starterSiteRange
      ? round1(starterSiteRange.low)
      : round1(weightedFixPoints(breakdown, input, fullMergeFix(mergedCheckIds))),
    weightedPointsHigh: starterSiteRange ? round1(starterSiteRange.high) : null,
    href: null,
    rangeLowOverlay: starterSiteRange?.lowOverlay ?? null,
    rangeHighOverlay: starterSiteRange?.highOverlay ?? null,
  };

  const merged: ActionPlanTask[] = [];
  let inserted = false;
  for (const task of tasks) {
    if (WEBSITE_CHECK_IDS.includes(task.checkId)) {
      if (!inserted) {
        merged.push(mergedTask);
        inserted = true;
      }
      continue;
    }
    merged.push(task);
  }
  return merged;
}

export type PendingCheckStatus = "not_yet_checked" | "unchanged" | "progressed" | "regressed";

/**
 * Classifies a still-pending task's real status relative to when it was
 * marked done, using only numbers already computed elsewhere (the live
 * points gap vs. the gap recorded at mark time) — never a new scoring
 * decision, just an honest label for the UI to render differently so a
 * re-scan that found no change doesn't look identical to one that never
 * ran. "not_yet_checked" means no scan has been saved since the owner
 * clicked "I did this," so there is genuinely nothing new to report.
 */
export function pendingCheckStatus(task: ActionPlanTask, lastScanAt: string | null): PendingCheckStatus {
  if (task.status !== "pending_verification") return "unchanged";

  const checked = !!task.markedDoneAt && !!lastScanAt && lastScanAt > task.markedDoneAt;
  if (!checked) return "not_yet_checked";

  if (task.markedPromisedPoints === null) return "unchanged";
  if (task.promisedPoints < task.markedPromisedPoints) return "progressed";
  if (task.promisedPoints > task.markedPromisedPoints) return "regressed";
  return "unchanged";
}

export type WeeklyMetricProgressKind = "not_yet_checked" | "not_quite_yet" | "partial" | "complete";

export interface WeeklyMetricProgress {
  kind: WeeklyMetricProgressKind;
  /** The real current value of the tracked metric (e.g. current review
   * count) — read live on every render, never stale. */
  current: number;
  /** The value recorded when the owner most recently marked this done. */
  baseline: number;
  /** How many of the metric this week's goal calls for. */
  targetDelta: number;
  /** current - baseline, clamped to >= 0 for the "X of Y" framing — a
   * real drop is still shown honestly via `current` itself (see
   * "not_quite_yet"'s wording), just never presented as negative
   * progress here. */
  gained: number;
}

/**
 * Honest, NUMBERS-ONLY weekly progress for a gradual check that has a
 * real numeric weekly target (see deriveWeeklyTargetInfo) — the real
 * re-scanned metric value vs. the real baseline recorded when the owner
 * marked it done, vs. the real weekly target delta. This is a DISPLAY
 * comparison only: it never awards points itself and never feeds back
 * into reconcileTasks — score points still only ever confirm when the
 * real breakdown (checked by reconcileTasks after a re-scan) shows the
 * underlying check at full points.
 *
 * Returns null when there's nothing numeric to compare (not pending, no
 * numeric target, or no recorded baseline — e.g. marked before this
 * tracking existed) — callers fall back to the points-based
 * pendingCheckStatus() in that case, exactly as before.
 */
export function weeklyMetricProgress(task: ActionPlanTask, lastScanAt: string | null): WeeklyMetricProgress | null {
  if (task.status !== "pending_verification") return null;
  if (task.weeklyTargetDelta === null || task.markedMetricValue === null) return null;
  if (task.currentMetricValue === null) return null;

  const baseline = task.markedMetricValue;
  const targetDelta = task.weeklyTargetDelta;
  const current = task.currentMetricValue;

  const checked = !!task.markedDoneAt && !!lastScanAt && lastScanAt > task.markedDoneAt;
  if (!checked) {
    return { kind: "not_yet_checked", current, baseline, targetDelta, gained: 0 };
  }

  const gained = Math.max(0, current - baseline);

  if (gained >= targetDelta) {
    return { kind: "complete", current, baseline, targetDelta, gained };
  }
  if (gained > 0) {
    return { kind: "partial", current, baseline, targetDelta, gained };
  }
  return { kind: "not_quite_yet", current, baseline, targetDelta, gained };
}

/** Tasks a re-scan has actually confirmed — shown separately from the
 * active plan as real, verified wins. */
export function buildCompletedTasks(breakdown: ScoreBreakdown, taskRows: TaskRow[]): CompletedTask[] {
  return taskRows
    .filter((row) => row.status === "completed")
    .map((row) => {
      const check = breakdown.checks.find((c) => c.id === row.check_id);
      return {
        checkId: row.check_id,
        label: check?.label ?? row.check_id,
        pointsGained: row.promised_points,
        verifiedAt: row.verified_at,
      };
    })
    .sort((a, b) => (b.verifiedAt ?? "").localeCompare(a.verifiedAt ?? ""));
}

export interface TaskReconciliation {
  /** Task row ids whose check has genuinely reached full points — mark completed. */
  toComplete: string[];
  /** Task row ids previously completed whose check has since regressed — reopen. */
  toReopen: string[];
}

/**
 * The only place completion is ever decided: compares each stored task
 * against the check it names in a REAL, freshly-computed breakdown.
 * Never reads the task's own status as truth about the score — only the
 * breakdown is truth. Called after every re-scan (see
 * saveScoreSnapshot in app/actions/scoring.ts).
 */
export function reconcileTasks(breakdown: ScoreBreakdown, taskRows: TaskRow[]): TaskReconciliation {
  const toComplete: string[] = [];
  const toReopen: string[] = [];

  for (const row of taskRows) {
    const check = breakdown.checks.find((c) => c.id === row.check_id);
    if (!check) continue;

    const isNowFull = check.earnedPoints !== null && check.earnedPoints >= check.maxPoints;

    if (row.status === "pending_verification" && isNowFull) {
      toComplete.push(row.id);
    } else if (row.status === "completed" && !isNowFull) {
      toReopen.push(row.id);
    }
  }

  return { toComplete, toReopen };
}

// ---------------------------------------------------------------------------
// This week's plan
// ---------------------------------------------------------------------------

/** How many quick score fixes "this week's plan" surfaces at once —
 * enough to feel like real progress, few enough to not be overwhelming. */
export const WEEKLY_PLAN_CAP = 3;

/** Never present a task with a weighted impact under this many points
 * as "the action of this week" — below this, the fix is real but too
 * small to honestly headline a week. Tuned editorial constant, not
 * derived from any scoring math. */
const MIN_WEEKLY_HEADLINE_POINTS = 0.5;

/**
 * "Connect Google" — a real, one-time setup step, not a score check (see
 * TaskEffort's "setup" doc). Always 0 points, a link (connectGoogleHref)
 * instead of an "I did this" checkbox. getActionPlan adds it to the
 * Growth page's weekly plan only while Google isn't connected; it unlocks
 * the "Replying to reviews" check and the exact recent-review count
 * (scoring v1.12.0).
 */
export function buildConnectGbpWeeklyTask(businessId: string, locale: Locale = DEFAULT_LOCALE, plan: Plan = "premium"): ActionPlanTask {
  return {
    checkId: CONNECT_GOOGLE_STEP_ID,
    category: "visibility",
    label: t(locale, "content.actionPlan.connectGoogle.title"),
    problem: "",
    why: t(locale, "content.actionPlan.connectGoogle.why"),
    action: t(locale, "content.actionPlan.connectGoogle.title"),
    fix: t(locale, "content.actionPlan.connectGoogle.fix"),
    ownerActionOnGoogle: false,
    promisedPoints: 0,
    status: "open",
    markedDoneAt: null,
    markedPromisedPoints: null,
    markedMetricValue: null,
    effort: "setup",
    weeklyTarget: null,
    weeklyTargetDelta: null,
    currentMetricValue: null,
    mergedCheckIds: null,
    mergedLabels: null,
    timingNote: null,
    weightedPoints: 0,
    weightedPointsHigh: null,
    href: connectGoogleHref(businessId, plan),
    rangeLowOverlay: null,
    rangeHighOverlay: null,
    minutes: 2,
    links: [],
    automatable: false,
  };
}

export const CONNECT_GOOGLE_STEP_ID = "setup.connect_gbp";

/** Where each plan connects Google (the same single connection): Free on
 * the Overview's reply-check card, Grow on the Reviews page, Premium and
 * Multi on the Connect page. */
export function connectGoogleHref(businessId: string, plan: Plan): string {
  if (plan === "free") return `/business/${businessId}#reply-check`;
  if (plan === "grow") return `/business/${businessId}/website-reviews#reply-check`;
  return `/business/${businessId}/connect-gbp`;
}

/** A task's links: the PostScore tool for it first (when there is one),
 * then official Google pages (officialLinksFor). */
export function stepLinks(checkId: string, businessId: string, locale: Locale = DEFAULT_LOCALE): TaskLink[] {
  const app = (path: string, label: MessageKey): TaskLink => ({ href: `/business/${businessId}${path}`, label: t(locale, label), external: false });
  const tool =
    checkId === "visibility.review_replies"
      ? [app("/website-reviews#reply-to-a-review", "content.actionPlan.link.replyDrafter")]
      : REVIEW_CHECK_IDS.includes(checkId) || checkId === MERGED_REVIEW_CHECK_ID
        ? [app("/website-reviews#get-more-reviews", "content.actionPlan.link.reviewLink")]
        : [];
  return [...tool, ...officialLinksFor(checkId, locale)];
}

/** Adds the PostScore tool links (the pure plan has no business id). */
export function withStepLinks(tasks: ActionPlanTask[], businessId: string, locale: Locale = DEFAULT_LOCALE): ActionPlanTask[] {
  return tasks.map((task) => (task.effort === "setup" ? task : { ...task, links: stepLinks(task.checkId, businessId, locale) }));
}

export interface WeeklyPlan {
  /**
   * Up to WEEKLY_PLAN_CAP real score tasks doable this week, at most
   * one of them a review item (guaranteed structurally: the 3 review
   * checks are always pre-merged into a single card before this runs —
   * see mergeReviewTasks). Never growth moves — those only ever appear
   * in the Growth page's separate "Ways to bring in more customers"
   * section, entirely outside any projected score. If fewer than
   * WEEKLY_PLAN_CAP tasks clear MIN_WEEKLY_HEADLINE_POINTS, only those
   * are shown — never padded with anything else. If none do, this is
   * empty and the UI shows an honest "no quick score fixes this week"
   * message instead. A "quick_win" task appears with its real, full
   * weightedPoints (it fully closes this week). A "quick_win_action"
   * task (this includes the merged reviews card — see
   * mergeReviewTasks) appears with its weightedPoints and `action`
   * REPLACED by the honest, modest weekly estimate/copy — never the
   * full outcome. Every task's weightedPoints here has already been
   * apportioned (see apportionToTotal) to sum EXACTLY to
   * weeklyProjectedBreakdown.total - (today's real total).
   */
  weeklyTasks: ActionPlanTask[];
  /**
   * Every task not fully "spent" by this week's plan: overflow quick
   * wins beyond the cap, every longer_term task, AND the full-outcome
   * version of any "quick_win_action" task also in weeklyTasks (its
   * weekly action is real progress, but the full outcome is still a
   * genuinely bigger, ongoing project worth tracking on its own). Still
   * real, still shown — never hidden.
   */
  laterTasks: ActionPlanTask[];
  /**
   * scoreBusiness() re-run with this week's realistic fixes applied —
   * the check's own full simulateFix for a "quick_win" task, or its
   * modest weeklyFix for a "quick_win_action" task. Same real
   * simulateFix + scoreBusiness machinery behind the overall
   * suggestion→score guarantee (see getScoreWithSuggestions in
   * lib/scoring.ts), just scoped to this week's realistic subset and
   * realistic increments instead of every gap closed at once. Never a
   * hand-summed or invented estimate. When any picked task is itself a
   * range (currently only the no-website starter-site card), this is
   * the LOW-end projection.
   */
  weeklyProjectedBreakdown: ScoreBreakdown;
  /** The HIGH-end projection — set only when at least one picked task
   * is a range, using that task's own HIGH overlay instead of its LOW
   * one. Null whenever nothing picked is a range (the common case),
   * in which case weeklyProjectedBreakdown alone is the whole story. */
  weeklyProjectedBreakdownHigh: ScoreBreakdown | null;
  /**
   * The real "Points within reach" number — always exactly the sum of
   * weeklyTasks' displayed weightedPoints. Equal to
   * weeklyProjectedBreakdown.total minus today's total whenever any
   * non-pinned task is picked; when the ONLY picked task is a pinned one
   * (see buildWeeklyPlan's `pinnedCheckIds`, e.g. a +0.3 Google-mismatch
   * fix that doesn't move the rounded 0–100 total on its own), it's that
   * task's real 1-decimal value instead of a rounded 0 or 1.
   */
  weeklyPointsWithinReach: number;
}

/**
 * The real raw metric value a "quick_win_action" check's weeklyFix
 * actually moves — currently always review count, the only field any
 * weeklyFix touches (see weeklyReviewAskFix) — or null for a check with
 * no weeklyFix. Exported so both deriveWeeklyTargetInfo (below) and
 * markTaskDone (app/actions/actionPlan.ts, which snapshots this at mark
 * time into tasks.marked_metric_value) read the exact same real number,
 * never two separately-computed values that could drift apart. If a
 * future weeklyFix moves a different field, extend this and
 * deriveWeeklyTargetInfo together.
 */
export function weeklyTrackedMetricValue(checkId: string, input: BusinessScoringInput): number | null {
  const copy = ACTION_PLAN_COPY[checkId];
  if (!copy?.weeklyFix) return null;
  return input.reviewCount ?? 0;
}

interface WeeklyTargetInfo {
  /** e.g. "Get 3+ new reviews this week (14 → 17+)". */
  label: string;
  /** The numeric delta embedded in `label` (3, above) — exposed
   * separately so callers can compare it against a real re-scanned
   * value without parsing the label string. Null when no numeric target
   * could be derived (falls back to a plain weeklyAction sentence with
   * nothing to measure progress against). */
  targetDelta: number | null;
}

/**
 * A concrete, honest "what counts as done this week" description for a
 * "quick_win_action" check — derived by diffing the SAME real input
 * field its own weeklyFix changes (the identical fix already used just
 * above to project this week's realistic points), so the number here can
 * never drift from the real mechanics or get hand-inflated. Falls back
 * to the check's own hand-written weeklyAction copy (with no numeric
 * targetDelta) when no numeric field diff is available to describe (e.g.
 * a future weeklyFix that isn't review-count-based).
 */
function deriveWeeklyTargetInfo(
  checkId: string,
  input: BusinessScoringInput,
  locale: Locale
): WeeklyTargetInfo | null {
  const copy = ACTION_PLAN_COPY[checkId];
  if (!copy?.weeklyFix) return null;

  const before = weeklyTrackedMetricValue(checkId, input) ?? 0;
  const after = weeklyTrackedMetricValue(checkId, copy.weeklyFix(input)) ?? before;

  if (after > before) {
    const delta = after - before;
    return {
      label: tPlural(locale, "dashboard.actionPlan.weeklyReviewTarget", delta, { before, after }),
      targetDelta: delta,
    };
  }

  return copy.weeklyAction ? { label: t(locale, copy.weeklyAction), targetDelta: null } : null;
}

/**
 * The real, honest input-transform this task's weekly slot represents —
 * the SAME fix used both to rank/compute its weekly weightedPoints and
 * to build the projected breakdown, so the two can never drift apart.
 * Null for a longer_term task (no bounded weekly action exists at all)
 * or a quick_win_action check with no weeklyFix of its own.
 */
function weeklyFixForTask(
  task: ActionPlanTask,
  useHighOverlay: boolean = false
): ((input: BusinessScoringInput) => BusinessScoringInput) | null {
  if (task.effort === "quick_win_action") {
    if (task.mergedCheckIds) return reviewAskFixIncluding([...task.mergedCheckIds, ...(task.fixAlsoCovers ?? [])]);
    const copy = ACTION_PLAN_COPY[task.checkId];
    return copy?.weeklyFix ?? null;
  }
  if (task.effort === "quick_win") {
    // A range task (currently only the no-website starter-site card)
    // has its own real LOW/HIGH website-field overlay — a template
    // scoring input, not the check's own generic simulateFix — see
    // mergeWebsiteTasks and lib/starterSiteScoring.ts.
    if (task.rangeLowOverlay) {
      const overlay = useHighOverlay ? task.rangeHighOverlay : task.rangeLowOverlay;
      return (input) => ({ ...input, ...overlay });
    }
    // A merged quick_win (e.g. has_website+website_link with no range
    // data)'s own checkId is synthetic — no real check to look up. Both
    // merged checks share the identical real simulateFix (see
    // mergeWebsiteTasks), so applying either real id's fix closes both
    // honestly.
    const realCheckId = task.mergedCheckIds?.[0] ?? task.checkId;
    return (input) => applyCheckFix(input, realCheckId);
  }
  return null;
}

/**
 * The one, last-resort source of "this week's plan" content when NO
 * quick_win/quick_win_action task clears the headline bar: the single
 * best longer_term check that genuinely has its own honest, bounded
 * weekly first step (see e.g. website.content_depth/contact_conversion's
 * weeklyFix — not every longer_term check has one; website.
 * performance_mobile genuinely doesn't, since no input PostScore
 * controls can honestly move a live Lighthouse score). Never invents a
 * step for a check that has none. Returns null when nothing is
 * eligible, in which case the week is genuinely empty.
 */
function bestPromotableLongerTermTask(
  tasks: ActionPlanTask[],
  breakdown: ScoreBreakdown,
  input: BusinessScoringInput
): { task: ActionPlanTask; fix: (input: BusinessScoringInput) => BusinessScoringInput; weeklyWeightedPoints: number } | null {
  const promotable = tasks
    .filter((t) => t.effort === "longer_term")
    .map((task) => {
      const fix = ACTION_PLAN_COPY[task.checkId]?.weeklyFix ?? null;
      return { task, fix, weeklyWeightedPoints: fix ? weightedFixPoints(breakdown, input, fix) : 0 };
    })
    .filter((c): c is { task: ActionPlanTask; fix: (input: BusinessScoringInput) => BusinessScoringInput; weeklyWeightedPoints: number } => c.fix !== null)
    .sort((a, b) => b.weeklyWeightedPoints - a.weeklyWeightedPoints);
  return promotable[0] ?? null;
}

/**
 * Splits an already-built action plan into "this week" (up to
 * WEEKLY_PLAN_CAP real score tasks doable this week — see WeeklyPlan's
 * own doc for the exact rules) and "later" (everything else, shown
 * honestly rather than hidden). `tasks` must already be ordered
 * biggest-opportunity-first (buildActionPlan's own ordering, after
 * mergeReviewTasks/mergeWebsiteTasks). Growth moves never appear here —
 * see app/business/[id]/growth/GrowthView.tsx's separate "Ways to bring
 * in more customers" section for those.
 *
 * Ranks candidates by their REALISTIC this-week WEIGHTED impact (full
 * weightedPoints for a quick_win, a modest honest weekly estimate for a
 * quick_win_action — see weightedFixPoints) rather than raw check
 * points, so a small-but-fully-closable quick win isn't crowded out by
 * a check that can only move a little this week, and so the ranking
 * always agrees with what the cards actually display. Only candidates
 * clearing MIN_WEEKLY_HEADLINE_POINTS are ever shown; if NONE do, the
 * single best "Bigger projects" item with a real weekly first step is
 * promoted instead (see bestPromotableLongerTermTask) — only when even
 * THAT doesn't exist is the week genuinely empty (no filler, no other
 * fallback). Once picked, every task's displayed weightedPoints is
 * apportioned (see apportionToTotal) to sum EXACTLY to
 * weeklyProjectedBreakdown's own real total delta. The caller (see
 * app/actions/actionPlan.ts) is responsible for the connect_gbp "setup"
 * item, if any — it's never part of `tasks` here, so reduce `cap` by 1
 * before calling when it applies, and prepend it to the result
 * afterward.
 */
export function buildWeeklyPlan(
  tasks: ActionPlanTask[],
  breakdown: ScoreBreakdown,
  input: BusinessScoringInput,
  cap: number = WEEKLY_PLAN_CAP,
  locale: Locale = DEFAULT_LOCALE,
  /**
   * Quick-win tasks that ALWAYS appear this week whenever they're open —
   * exempt from MIN_WEEKLY_HEADLINE_POINTS and from `cap` (an extra card,
   * never taking another task's slot), and shown with their own real
   * 1-decimal value rather than apportioned. Today only the Growth page's
   * Google-mismatch card (GOOGLE_MISMATCH_CHECK_ID, Step 2f).
   */
  pinnedCheckIds: readonly string[] = []
): WeeklyPlan {
  const candidates = tasks
    .filter((t) => t.effort === "quick_win" || t.effort === "quick_win_action")
    .map((task) => {
      const fix = weeklyFixForTask(task);
      const weeklyWeightedPoints = fix ? weightedFixPoints(breakdown, input, fix) : 0;
      return { task, fix, weeklyWeightedPoints };
    })
    .sort((a, b) => b.weeklyWeightedPoints - a.weeklyWeightedPoints);

  const pinned = candidates.filter((c) => pinnedCheckIds.includes(c.task.checkId));
  let picked = candidates
    .filter((c) => !pinnedCheckIds.includes(c.task.checkId))
    .filter((c) => c.weeklyWeightedPoints >= MIN_WEEKLY_HEADLINE_POINTS)
    .slice(0, Math.max(0, cap));
  const promotedCheckIds = new Set<string>();

  // No quick score task qualifies — promote the single best "Bigger
  // projects" item's honest weekly-sized first step instead, if one
  // exists (see bestPromotableLongerTermTask). This is the ONLY case a
  // longer_term task can ever appear in the weekly plan.
  if (picked.length === 0 && cap > 0) {
    const promoted = bestPromotableLongerTermTask(tasks, breakdown, input);
    if (promoted) {
      picked = [promoted];
      promotedCheckIds.add(promoted.task.checkId);
    }
  }

  // Pinned tasks join AFTER the threshold/cap/promotion decisions above,
  // so they never change which other tasks are picked.
  const pinnedValues = pinned.map((p) => round1(p.weeklyWeightedPoints));
  const pinnedTotal = round1(pinnedValues.reduce((sum, v) => sum + v, 0));
  const unpinnedCount = picked.length;
  picked = [...picked, ...pinned];

  const weeklyProjectedInput = picked.reduce((acc, { fix }) => (fix ? fix(acc) : acc), input);
  const weeklyProjectedBreakdown = scoreBusiness(weeklyProjectedInput);
  // The real target every displayed card must sum to — apportionToTotal
  // below is what actually guarantees that, not independent rounding.
  // Pinned cards keep their own real value; the rest absorb the
  // remainder, so the sum stays exact. With ONLY pinned cards there's
  // nothing to absorb rounding, so "within reach" is their real value.
  // If rounding left the integer delta SMALLER than the pinned cards'
  // own value (e.g. 85.6 -> 86.4, both "86"), apportioning would push
  // the other cards negative — instead every card shows its own real
  // 1-decimal value and "within reach" is their exact sum.
  const targetDelta = weeklyProjectedBreakdown.total - breakdown.total;
  const unpinnedRaw = picked.slice(0, unpinnedCount).map((p) => p.weeklyWeightedPoints);
  const canApportion = unpinnedCount > 0 && targetDelta - pinnedTotal >= 0;
  const apportionedPoints = [
    ...(canApportion ? apportionToTotal(unpinnedRaw, targetDelta - pinnedTotal) : unpinnedRaw.map(round1)),
    ...pinnedValues,
  ];
  const weeklyPointsWithinReach = canApportion
    ? targetDelta
    : round1(apportionedPoints.reduce((sum, v) => sum + v, 0));

  // The HIGH-end projection: only meaningfully different from the LOW
  // one when a picked task is itself a range (currently only the
  // no-website starter-site card) — every other picked task uses the
  // exact same fix either way, so this stays null in the common case.
  const rangeTasks = picked.filter((p) => p.task.weightedPointsHigh !== null);
  const weeklyProjectedBreakdownHigh =
    rangeTasks.length > 0
      ? scoreBusiness(
          picked.reduce((acc, { task, fix }) => {
            const highFix = weeklyFixForTask(task, true);
            return highFix ? highFix(acc) : fix ? fix(acc) : acc;
          }, input)
        )
      : null;

  const weeklyTasks: ActionPlanTask[] = picked.map(({ task }, i) => {
    const weightedPoints = apportionedPoints[i];
    if (task.weightedPointsHigh !== null) {
      // A range: keep the LOW value apportioned; the HIGH value passes
      // through unadjusted — it's an honest range, not a precise
      // sum-matching figure.
      return { ...task, weightedPoints };
    }
    if (task.effort === "quick_win" || (task.effort === "quick_win_action" && task.mergedCheckIds)) {
      return { ...task, weightedPoints };
    }
    // An individual (unmerged) quick_win_action check, or a promoted
    // longer_term first step: swap in the modest, doable-this-week
    // action/target framing — never the full outcome's action text.
    // A promoted longer_term check's weeklyFix doesn't move reviewCount
    // (weeklyTrackedMetricValue/deriveWeeklyTargetInfo are review-
    // specific), so it gets the plain weeklyAction text with no numeric
    // target rather than a meaningless "3 to go" tracker.
    const isPromoted = promotedCheckIds.has(task.checkId);
    const copy = ACTION_PLAN_COPY[task.checkId];
    const targetInfo = isPromoted ? null : deriveWeeklyTargetInfo(task.checkId, input, locale);
    return {
      ...task,
      weightedPoints,
      action: copy?.weeklyAction ? t(locale, copy.weeklyAction) : task.action,
      weeklyTarget: targetInfo?.label ?? null,
      weeklyTargetDelta: targetInfo?.targetDelta ?? null,
      currentMetricValue: isPromoted ? null : weeklyTrackedMetricValue(task.checkId, input),
    };
  });

  // Strict one-section-only rule: a task picked for this week never
  // also appears in "Bigger projects" — no exceptions, including for a
  // quick_win_action's full outcome (previously duplicated there; see
  // item 1 of Day 3 step 2e's second pass).
  const pickedCheckIds = new Set(picked.map((p) => p.task.checkId));
  const laterTasks = tasks.filter((t) => !pickedCheckIds.has(t.checkId));

  return {
    weeklyTasks,
    laterTasks,
    weeklyProjectedBreakdown,
    weeklyProjectedBreakdownHigh,
    weeklyPointsWithinReach,
  };
}

// ---------------------------------------------------------------------
// Growth page / PostAI website rules (Day 4 Step 2f)
// ---------------------------------------------------------------------

/** The one website check that stays on the Growth page as a card — a
 * real mismatch between the website and the Google listing is a quick,
 * owner-fixable problem that can turn customers away, unlike every other
 * website check, which the Website page's own breakdown covers. */
export const GOOGLE_MISMATCH_CHECK_ID = "website.info_consistency";

const MISMATCH_ACTION_KEYS: Record<"hours" | "phone" | "address", MessageKey> = {
  hours: "content.actionPlan.website.info_consistency.action.hours",
  phone: "content.actionPlan.website.info_consistency.action.phone",
  address: "content.actionPlan.website.info_consistency.action.address",
};

/** The real, currently-scored mismatched fields (never an overridden
 * one, never a field missing from the site) — the same filter
 * website.info_consistency itself scores on. */
function mismatchedFields(input: BusinessScoringInput): Array<"hours" | "phone" | "address"> {
  const trust = input.websiteAnalysis?.websiteTrust;
  if (!trust) return [];
  const overridden = new Set((input.websiteTrustOverrides ?? []).map((o) => o.key));
  const fields = trust.infoConflicts
    .filter((f) => f.comparison === "conflicts" && !overridden.has(keyForInfoConflict(f)))
    .map((f) => f.field);
  return (["hours", "phone", "address"] as const).filter((f) => fields.includes(f));
}

/**
 * The Growth page's own view of the action plan (also what PostAI reads):
 * every website.* task is removed — the Website page's breakdown already
 * shows each one's advice, and the Growth page summarizes them in one
 * banner instead (see buildWebsiteBanner) — EXCEPT the Google-mismatch
 * card, which becomes a specific quick win built from the real mismatch
 * (never assuming which side is correct). completeness.website_link
 * stays (it's a Google LISTING fix); when a real site was verified
 * elsewhere, it becomes a normal quick win showing the real "add your
 * website to your Google listing" steps with that URL instead of the
 * starter-site text.
 *
 * Deliberately NOT applied inside buildActionPlan itself — the monthly
 * report reads buildActionPlan directly and is unchanged by this step.
 */
/** Spam found on the site, or a Google Safe Browsing flag. */
export function siteShowsHackSigns(input: BusinessScoringInput): boolean {
  const trust = input.websiteAnalysis?.websiteTrust;
  return !!trust && (trust.spamSignals.length > 0 || !!trust.safeBrowsingThreat?.threatFound);
}

export function applyGrowthWebsiteRules(
  tasks: ActionPlanTask[],
  input: BusinessScoringInput,
  locale: Locale = DEFAULT_LOCALE
): ActionPlanTask[] {
  const result: ActionPlanTask[] = [];
  for (const task of tasks) {
    if (task.checkId === GOOGLE_MISMATCH_CHECK_ID) {
      const fields = mismatchedFields(input);
      result.push({
        ...task,
        effort: "quick_win",
        action:
          fields.length > 0
            ? fields.map((f) => t(locale, MISMATCH_ACTION_KEYS[f])).join(" ")
            : t(locale, "content.actionPlan.website.info_consistency.action.generic"),
        why: t(locale, "content.actionPlan.website.info_consistency.why"),
        fix: t(locale, "content.actionPlan.website.info_consistency.fix"),
        ownerActionOnGoogle: false,
      });
      continue;
    }
    if (task.category === "website") continue;
    // Step 2d: the listing HAS a link, but it opens an error page — a
    // quick Google-listing fix this week (competes normally).
    if (
      task.checkId === "completeness.website_link" &&
      input.website &&
      input.websiteAnalysis?.websiteTrust?.listingLinkBroken
    ) {
      result.push({
        ...task,
        effort: "quick_win",
        action: t(locale, "growth.fix.brokenListingLink.action"),
        why: t(locale, "growth.fix.brokenListingLink.why"),
        fix: t(locale, "growth.fix.brokenListingLink.fix"),
        timingNote: t(locale, "growth.fix.addWebsiteToListing.note"),
        ownerActionOnGoogle: true,
      });
      continue;
    }
    if (task.checkId === "completeness.website_link" && input.verifiedElsewhereUrl) {
      result.push({
        ...task,
        // The site already exists — pasting its URL into the Google
        // listing is a few minutes' work, so it competes as a normal
        // quick win this week (minimum, cap and ranking all apply — not
        // pinned like the Google mismatch). Points are still only
        // credited once a real re-scan confirms the link (see
        // markTaskDone/reconcileTasks).
        effort: "quick_win",
        // Don't send Google searchers to a site that shows hack signs
        // without saying so — clean it first (same signs as the Website
        // page's Site security row and the report's warning).
        action: t(
          locale,
          siteShowsHackSigns(input) ? "growth.fix.addWebsiteToListing.headingHacked" : "growth.fix.addWebsiteToListing.heading"
        ),
        why: t(locale, "growth.fix.addWebsiteToListing.intro"),
        fix: [
          t(locale, "growth.fix.addWebsiteToListing.step1"),
          t(locale, "growth.fix.addWebsiteToListing.step2"),
          t(locale, "growth.fix.addWebsiteToListing.step3", { url: input.verifiedElsewhereUrl }),
          t(locale, "growth.fix.addWebsiteToListing.step4"),
        ].join(" "),
        timingNote: t(locale, "growth.fix.addWebsiteToListing.note"),
        ownerActionOnGoogle: true,
      });
      continue;
    }
    result.push(task);
  }
  return result;
}

export type WebsiteBanner =
  | {
      kind: "improve";
      /** The Website page's own 0–100 Website score, rounded. */
      score: number;
      /** Website checks losing points, EXCLUDING the Google mismatch. */
      improvements: number;
      /** Real weighted PostScore gain from fixing all of them at once. */
      points: number;
    }
  | {
      kind: "get_website";
      /** The starter-site range (same as the starter-site card used),
       * or a single value when no template range could be computed. */
      low: number;
      high: number | null;
    };

/**
 * The single website element on the Growth page besides the mismatch
 * card — built only from live scoring. Null when there's nothing left to
 * fix (Website at 100, or the Google mismatch is the only gap).
 * `starterSiteRange` is getActionPlan's own template range for a
 * business with no website at all (see mergeWebsiteTasks).
 */
export function buildWebsiteBanner(
  breakdown: ScoreBreakdown,
  input: BusinessScoringInput,
  starterSiteRange: { low: number; high: number } | null = null
): WebsiteBanner | null {
  if (!hasAnalyzableWebsite(input)) {
    if (starterSiteRange) {
      return { kind: "get_website", low: round1(starterSiteRange.low), high: round1(starterSiteRange.high) };
    }
    const fix = fullMergeFix(WEBSITE_CHECK_IDS.filter((id) => breakdown.checks.some((c) => c.id === id)));
    return { kind: "get_website", low: round1(weightedFixPoints(breakdown, input, fix)), high: null };
  }

  // "Website < max" is judged on the SAME rounded 0–100 number the
  // Website page shows — a 99.6 reads as 100/100 there, so a banner
  // saying "100/100 — 1 improvement" would contradict it.
  const website = breakdown.categories.find((c) => c.id === "website");
  if (!website || website.relativeScore === null || Math.round(website.relativeScore) >= 100) return null;
  // A broken Google-listing link is fixed by the listing card this week
  // (Step 2d), which also restores website.has_website — never counted
  // twice in the banner.
  const listingLinkBroken = !!input.website && input.websiteAnalysis?.websiteTrust?.listingLinkBroken === true;
  const losing = website.checks.filter(
    (c) =>
      c.id !== GOOGLE_MISMATCH_CHECK_ID &&
      !(listingLinkBroken && c.id === "website.has_website") &&
      (c.confidence === "VERIFIED" || c.confidence === "LIKELY") &&
      c.earnedPoints !== null &&
      c.earnedPoints < c.maxPoints
  );
  if (losing.length === 0) return null;
  const fixAll = (inp: BusinessScoringInput) => losing.reduce((acc, c) => applyCheckFix(acc, c.id), inp);
  return {
    kind: "improve",
    score: Math.round(website.relativeScore),
    improvements: losing.length,
    points: round1(weightedFixPoints(breakdown, input, fixAll)),
  };
}
