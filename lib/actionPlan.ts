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

import type { CategoryId, ScoreBreakdown, Suggestion } from "@/lib/scoring";

export interface ActionPlanCopy {
  /** Why this matters for actually getting customers — not just "raises your score." */
  why: string;
  /** The high-level thing to do. */
  action: string;
  /** Concrete, step-by-step how-to. */
  fix: string;
  /**
   * True when completing this task means changing something on the
   * business's Google listing (hours, photos, categories, contact
   * info, reviews) or otherwise on a platform only the owner controls.
   * Drives the honest hand-off note: PostScore prepares guidance, the
   * owner makes the actual change — never the reverse.
   */
  ownerActionOnGoogle: boolean;
}

const ACTION_PLAN_COPY: Record<string, ActionPlanCopy> = {
  "visibility.rating": {
    why: "Your star rating is often the first thing a potential customer sees — a stronger average rating directly raises the odds they pick you over a nearby competitor.",
    action: "Ask recent happy customers for a review, and reply to any negative ones so future customers see you take feedback seriously.",
    fix: "Send a Google review link directly to customers right after a good visit (find your link in Google Business Profile under \"Ask for reviews\"). A steady trickle beats one big batch.",
    ownerActionOnGoogle: true,
  },
  "visibility.review_count": {
    why: "More reviews means more social proof — customers trust a business with dozens of reviews far more than one with a handful, even at the same star rating.",
    action: "Make leaving a review as easy as possible, and ask consistently rather than just once.",
    fix: "Add a review-request step to your normal customer flow — a receipt footer, a follow-up text, or a QR code at checkout that links straight to your Google review page.",
    ownerActionOnGoogle: true,
  },
  "visibility.review_recency": {
    why: "A steady stream of recent reviews signals an active, currently-trustworthy business — a rating built entirely on old reviews looks stale to customers and to Google.",
    action: "Keep asking for reviews on an ongoing basis, not in one push.",
    fix: "Set a recurring reminder (weekly, or after every N customers) to request a review, so new reviews keep arriving instead of stopping after one round.",
    ownerActionOnGoogle: true,
  },
  "completeness.phone": {
    why: "A missing phone number is one of the fastest ways to lose a customer who's ready to call right now.",
    action: "Add your business phone number to your Google Business Profile.",
    fix: "In Google Business Profile: Edit profile → Contact information → Phone number.",
    ownerActionOnGoogle: true,
  },
  "completeness.address": {
    why: "Without a verified address, customers — and Google Maps — can't reliably find you, which can keep you out of local search results entirely.",
    action: "Add or correct your business address on Google Business Profile.",
    fix: "In Google Business Profile: Edit profile → Business information → Address.",
    ownerActionOnGoogle: true,
  },
  "completeness.hours": {
    why: "Customers routinely check hours before visiting — if they're missing, many will just choose a competitor who's listed clearly.",
    action: "Add your real business hours to Google Business Profile.",
    fix: "In Google Business Profile: Edit profile → Business information → Hours. Fill in every day, including holiday hours if they differ.",
    ownerActionOnGoogle: true,
  },
  "completeness.website_link": {
    why: "Linking your website on your Google listing gives customers one more trusted way to learn more and convert, right from search results.",
    action: "Link your website URL on your Google Business Profile.",
    fix: "In Google Business Profile: Edit profile → Business information → Website.",
    ownerActionOnGoogle: true,
  },
  "completeness.categories": {
    why: "Categories are how Google matches your listing to what people are actually searching for — more accurate categories mean more relevant searches you show up in.",
    action: "Add or expand your business categories on Google Business Profile.",
    fix: "In Google Business Profile: Edit profile → Business information → Category. Add every category that genuinely describes what you offer, with the most specific one as primary.",
    ownerActionOnGoogle: true,
  },
  "completeness.photos": {
    why: "Listings with real photos get substantially more clicks and calls — photos are often a customer's first real impression of your business.",
    action: "Add real, current photos of your business to Google Business Profile.",
    fix: "In Google Business Profile: Photos → Add photos. Storefront, interior, team, and your products or work are the highest-impact shots.",
    ownerActionOnGoogle: true,
  },
  "completeness.business_status": {
    why: "If Google shows your listing as closed — temporarily or permanently — when you're actually open, customers won't even consider visiting.",
    action: "Verify your listing shows as Operational, and if it's wrong, ask Google to correct it.",
    fix: "In Google Business Profile, check your listing status. Use \"Reopen this business\" if it's marked closed in error, or file a reinstatement request if the listing was suspended.",
    ownerActionOnGoogle: true,
  },
  "website.has_website": {
    why: "A website is one of the strongest trust signals for a customer doing their research — without one, you're relying entirely on your Google listing to make the sale.",
    action: "Get a website up for your business, even a simple one.",
    fix: "A basic one-page site (hours, services, contact info, a few photos) is enough to start. Google Business Profile's own website tool, or a builder like Squarespace or Wix, can get something live quickly.",
    ownerActionOnGoogle: false,
  },
  "website.https": {
    why: "Browsers actively warn visitors when a site isn't secure, which erodes trust fast — HTTPS is a baseline expectation today, not a nice-to-have.",
    action: "Move your website to HTTPS.",
    fix: "Most hosts issue a free SSL certificate — check your hosting provider's dashboard for an \"enable HTTPS\" or \"SSL\" option, or ask whoever manages your site to turn it on.",
    ownerActionOnGoogle: false,
  },
};

const FALLBACK_COPY: ActionPlanCopy = {
  why: "Improving this check helps your overall PostScore.",
  action: "Review the explanation above and address the underlying gap.",
  fix: "See this check's explanation for exactly what's missing.",
  ownerActionOnGoogle: false,
};

/** Shape of a row from the `tasks` table — only the fields the plan needs. */
export interface TaskRow {
  id: string;
  check_id: string;
  status: "pending_verification" | "completed";
  promised_points: number;
  marked_done_at: string | null;
  verified_at: string | null;
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
  /** The points this check is currently missing — an ESTIMATE, confirmed only by a re-scan. */
  promisedPoints: number;
  status: "open" | "pending_verification";
  markedDoneAt: string | null;
}

export interface CompletedTask {
  checkId: string;
  label: string;
  /** The real points gained, as recorded when the fix was marked done and later confirmed. */
  pointsGained: number;
  verifiedAt: string | null;
}

/**
 * Builds the ordered action plan from a live breakdown. Reuses
 * generateSuggestions()'s own output directly — same filtering
 * (determinable checks only, so NOT_FOUND/not-yet-implemented checks
 * like mobile-friendliness never appear) and same biggest-opportunity-
 * first ordering. `taskRows` overlays any in-flight "I did this" status;
 * a task with no matching row is simply open.
 */
export function buildActionPlan(
  breakdown: ScoreBreakdown,
  suggestions: Suggestion[],
  taskRows: TaskRow[]
): ActionPlanTask[] {
  const rowByCheckId = new Map(taskRows.map((row) => [row.check_id, row]));

  return suggestions.map((s) => {
    const check = breakdown.checks.find((c) => c.id === s.checkId)!;
    const copy = ACTION_PLAN_COPY[s.checkId] ?? FALLBACK_COPY;
    const row = rowByCheckId.get(s.checkId);

    return {
      checkId: s.checkId,
      category: s.category,
      label: s.label,
      problem: check.explanation,
      why: copy.why,
      action: copy.action,
      fix: copy.fix,
      ownerActionOnGoogle: copy.ownerActionOnGoogle,
      promisedPoints: s.promisedPoints,
      status: row?.status === "pending_verification" ? "pending_verification" : "open",
      markedDoneAt: row?.marked_done_at ?? null,
    };
  });
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
