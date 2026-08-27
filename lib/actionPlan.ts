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
  scoreBusiness,
  type BusinessScoringInput,
  type CategoryId,
  type ScoreBreakdown,
  type Suggestion,
} from "@/lib/scoring";

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
 * Hand-classified per check (not inferred from maxPoints or category)
 * so it stays an explicit, easily-tuned editorial call rather than a
 * guess — see the effort field on each entry in ACTION_PLAN_COPY.
 */
export type TaskEffort = "quick_win" | "quick_win_action" | "longer_term";

export interface ActionPlanCopy {
  /** Why this matters for actually getting customers — not just "raises your score." */
  why: string;
  /** The high-level thing to do — for "quick_win_action" entries, this
   * describes the FULL long-run project (shown in "Bigger projects"). */
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
  /** See TaskEffort. */
  effort: TaskEffort;
  /**
   * Only meaningful for effort "quick_win_action": the concrete,
   * doable-this-week action, shown in "This week's plan" INSTEAD of
   * `action` — e.g. "Ask 3-5 recent customers for a review this week,"
   * rather than the longer-run "grow your review base" framing.
   */
  weeklyAction?: string;
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
}

/** A realistic number of new reviews a focused week of asking might
 * plausibly yield — deliberately modest, never the full saturating
 * volume a check's own long-run simulateFix uses. A tuned editorial
 * constant, not derived from any scoring math. */
const WEEKLY_REALISTIC_NEW_REVIEWS = 3;

/**
 * The honest "if I spend this week asking for reviews" input delta:
 * a handful of new reviews, which also means at least one is recent.
 * Reused by both the rating and review-count checks below, since
 * asking for reviews is the one real action behind both gaps.
 */
function weeklyReviewAskFix(input: BusinessScoringInput): BusinessScoringInput {
  return {
    ...input,
    reviewCount: (input.reviewCount ?? 0) + WEEKLY_REALISTIC_NEW_REVIEWS,
    mostRecentReviewDaysAgo: 0,
  };
}

const ACTION_PLAN_COPY: Record<string, ActionPlanCopy> = {
  "visibility.rating": {
    why: "Your star rating is often the first thing a potential customer sees — a stronger average rating directly raises the odds they pick you over a nearby competitor.",
    action: "Ask recent happy customers for a review, and reply to any negative ones so future customers see you take feedback seriously.",
    fix: "Send a Google review link directly to customers right after a good visit (find your link in Google Business Profile under \"Ask for reviews\"). A steady trickle beats one big batch.",
    ownerActionOnGoogle: true,
    // The FULL outcome (average rating at ~4.9, backed by enough
    // reviews to be trusted) only moves as real reviews accumulate over
    // time — but asking for reviews THIS WEEK is a real, bounded action
    // that makes honest, modest progress toward it. See weeklyFix.
    effort: "quick_win_action",
    weeklyAction:
      "Ask 3-5 of your happiest recent customers for a Google review this week — fresh reviews are the fastest real lever on your rating.",
    weeklyFix: weeklyReviewAskFix,
  },
  "visibility.review_count": {
    why: "More reviews means more social proof — customers trust a business with dozens of reviews far more than one with a handful, even at the same star rating.",
    action: "Make leaving a review as easy as possible, and ask consistently rather than just once.",
    fix: "Add a review-request step to your normal customer flow — a receipt footer, a follow-up text, or a QR code at checkout that links straight to your Google review page.",
    ownerActionOnGoogle: true,
    // The FULL outcome (a saturating volume of reviews) is genuinely a
    // months-long habit — but asking this week is still a real,
    // bounded action with an honest, modest weekly gain. See weeklyFix.
    effort: "quick_win_action",
    weeklyAction:
      "Ask 3-5 recent customers for a Google review this week — every real review adds up toward a stronger review base.",
    weeklyFix: weeklyReviewAskFix,
  },
  "visibility.review_recency": {
    why: "A steady stream of recent reviews signals an active, currently-trustworthy business — a rating built entirely on old reviews looks stale to customers and to Google.",
    action: "Keep asking for reviews on an ongoing basis, not in one push.",
    fix: "Set a recurring reminder (weekly, or after every N customers) to request a review, so new reviews keep arriving instead of stopping after one round.",
    ownerActionOnGoogle: true,
    // Unlike rating/count, this check only needs ONE fresh review to
    // reach full points — realistically doable this week.
    effort: "quick_win",
  },
  "completeness.phone": {
    why: "A missing phone number is one of the fastest ways to lose a customer who's ready to call right now.",
    action: "Add your business phone number to your Google Business Profile.",
    fix: "In Google Business Profile: Edit profile → Contact information → Phone number.",
    ownerActionOnGoogle: true,
    effort: "quick_win",
  },
  "completeness.address": {
    why: "Without a verified address, customers — and Google Maps — can't reliably find you, which can keep you out of local search results entirely.",
    action: "Add or correct your business address on Google Business Profile.",
    fix: "In Google Business Profile: Edit profile → Business information → Address.",
    ownerActionOnGoogle: true,
    effort: "quick_win",
  },
  "completeness.hours": {
    why: "Customers routinely check hours before visiting — if they're missing, many will just choose a competitor who's listed clearly.",
    action: "Add your real business hours to Google Business Profile.",
    fix: "In Google Business Profile: Edit profile → Business information → Hours. Fill in every day, including holiday hours if they differ.",
    ownerActionOnGoogle: true,
    effort: "quick_win",
  },
  "completeness.website_link": {
    why: "Linking your website on your Google listing gives customers one more trusted way to learn more and convert, right from search results.",
    action: "Link your website URL on your Google Business Profile.",
    fix: "In Google Business Profile: Edit profile → Business information → Website.",
    ownerActionOnGoogle: true,
    // Reads the exact same `website` field as website.has_website — in
    // this data model the two checks are always in the same state, so
    // this one is only ever real once a website already exists. Without
    // one, "fixing" it is the same longer-term project as building the
    // site, never an independent quick task.
    effort: "longer_term",
  },
  "completeness.categories": {
    why: "Categories are how Google matches your listing to what people are actually searching for — more accurate categories mean more relevant searches you show up in.",
    action: "Add or expand your business categories on Google Business Profile.",
    fix: "In Google Business Profile: Edit profile → Business information → Category. Add every category that genuinely describes what you offer, with the most specific one as primary.",
    ownerActionOnGoogle: true,
    effort: "quick_win",
  },
  "completeness.photos": {
    why: "Listings with real photos get substantially more clicks and calls — photos are often a customer's first real impression of your business.",
    action: "Add real, current photos of your business to Google Business Profile.",
    fix: "In Google Business Profile: Photos → Add photos. Storefront, interior, team, and your products or work are the highest-impact shots.",
    ownerActionOnGoogle: true,
    effort: "quick_win",
  },
  "completeness.business_status": {
    why: "If Google shows your listing as closed — temporarily or permanently — when you're actually open, customers won't even consider visiting.",
    action: "Verify your listing shows as Operational, and if it's wrong, ask Google to correct it.",
    fix: "In Google Business Profile, check your listing status. Use \"Reopen this business\" if it's marked closed in error, or file a reinstatement request if the listing was suspended.",
    ownerActionOnGoogle: true,
    effort: "quick_win",
  },
  "website.has_website": {
    why: "A website is one of the strongest trust signals for a customer doing their research — without one, you're relying entirely on your Google listing to make the sale.",
    action: "Get a website up for your business, even a simple one.",
    fix: "A basic one-page site (hours, services, contact info, a few photos) is enough to start. Google Business Profile's own website tool, or a builder like Squarespace or Wix, can get something live quickly.",
    ownerActionOnGoogle: false,
    // Building and publishing a website is a real, multi-step project —
    // never a this-week task.
    effort: "longer_term",
  },
  "website.https": {
    why: "Browsers actively warn visitors when a site isn't secure, which erodes trust fast — HTTPS is a baseline expectation today, not a nice-to-have.",
    action: "Move your website to HTTPS.",
    fix: "Most hosts issue a free SSL certificate — check your hosting provider's dashboard for an \"enable HTTPS\" or \"SSL\" option, or ask whoever manages your site to turn it on.",
    ownerActionOnGoogle: false,
    // Flipping on a host's free SSL certificate is normally a few
    // minutes of settings, not a rebuild.
    effort: "quick_win",
  },
};

const FALLBACK_COPY: ActionPlanCopy = {
  why: "Improving this check helps your overall PostScore.",
  action: "Review the explanation above and address the underlying gap.",
  fix: "See this check's explanation for exactly what's missing.",
  ownerActionOnGoogle: false,
  // Conservative default for any future check without explicit copy
  // above: never assume an unclassified check is a quick win.
  effort: "longer_term",
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
  /** See TaskEffort — drives which tasks can appear in this week's plan. */
  effort: TaskEffort;
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
      effort: copy.effort,
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

// ---------------------------------------------------------------------------
// This week's plan
// ---------------------------------------------------------------------------

/** How many quick wins "this week's plan" surfaces at once — enough to
 * feel like real progress, few enough to not be overwhelming. */
export const WEEKLY_PLAN_CAP = 3;

export interface WeeklyPlan {
  /**
   * Up to WEEKLY_PLAN_CAP tasks, highest realistic-this-week-impact
   * first. A "quick_win" task appears with its real, full promisedPoints
   * (it fully closes this week). A "quick_win_action" task appears with
   * its promisedPoints and `action` REPLACED by the honest, modest
   * weekly estimate/copy (see weeklyActionPoints below) — never the
   * full outcome. If a business has real gaps but none of them have any
   * bounded weekly action at all, the single highest-impact task is
   * still featured here (never a dead "nothing to do") with its normal
   * copy and a weekly point estimate of 0, since no honest partial
   * progress metric exists for it.
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
   * hand-summed or invented estimate.
   */
  weeklyProjectedBreakdown: ScoreBreakdown;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The honest, modest point gain a "quick_win_action" check would earn
 * from its weeklyFix alone — computed by literally re-running
 * scoreBusiness, never hand-estimated. Never negative (a realistic
 * action never makes a check worse). */
function weeklyActionPoints(
  checkId: string,
  breakdown: ScoreBreakdown,
  input: BusinessScoringInput,
  weeklyFix: (input: BusinessScoringInput) => BusinessScoringInput
): number {
  const before = breakdown.checks.find((c) => c.id === checkId)?.earnedPoints ?? 0;
  const after =
    scoreBusiness(weeklyFix(input)).checks.find((c) => c.id === checkId)?.earnedPoints ?? 0;
  return round1(Math.max(0, after - before));
}

/**
 * Splits an already-built action plan into "this week" (a small,
 * achievable set of real actions) and "later" (everything else, shown
 * honestly rather than hidden). `tasks` must already be ordered
 * biggest-opportunity-first (buildActionPlan's own ordering).
 *
 * Ranks candidates by their REALISTIC this-week impact (full points for
 * a quick_win, a modest honest estimate for a quick_win_action) rather
 * than their full potential, so a small-but-fully-closable quick win
 * isn't crowded out by a big check that can only move a little this
 * week. A business with real gaps but zero bounded weekly action still
 * gets its single highest-impact task featured — see WeeklyPlan's doc.
 */
export function buildWeeklyPlan(
  tasks: ActionPlanTask[],
  breakdown: ScoreBreakdown,
  input: BusinessScoringInput,
  cap: number = WEEKLY_PLAN_CAP
): WeeklyPlan {
  const candidates = tasks
    .filter((t) => t.effort === "quick_win" || t.effort === "quick_win_action")
    .map((t) => {
      if (t.effort === "quick_win") {
        return { task: t, weeklyPoints: t.promisedPoints };
      }
      const copy = ACTION_PLAN_COPY[t.checkId];
      const weeklyPoints = copy?.weeklyFix
        ? weeklyActionPoints(t.checkId, breakdown, input, copy.weeklyFix)
        : 0;
      return { task: t, weeklyPoints };
    })
    .sort((a, b) => b.weeklyPoints - a.weeklyPoints)
    .slice(0, cap);

  // Never leave a business with real gaps staring at an empty week —
  // if nothing has a bounded weekly action, still feature the single
  // highest-impact task as this week's first step (honest zero weekly
  // gain, since no partial-progress metric exists for it).
  const picked =
    candidates.length > 0 ? candidates : tasks.length > 0 ? [{ task: tasks[0], weeklyPoints: 0 }] : [];

  const weeklyTasks: ActionPlanTask[] = picked.map(({ task, weeklyPoints }) => {
    if (task.effort !== "quick_win_action") return task;
    const copy = ACTION_PLAN_COPY[task.checkId];
    return { ...task, promisedPoints: weeklyPoints, action: copy?.weeklyAction ?? task.action };
  });

  // The full outcome of any quick_win_action task picked this week
  // still belongs in "Bigger projects" too — the action is real
  // progress, but the full outcome is still a genuinely bigger,
  // ongoing project. Everything else picked (a quick_win, or the
  // zero-gain fallback) is fully represented by its weekly card alone.
  const duplicatedCheckIds = new Set(
    picked.filter((p) => p.task.effort === "quick_win_action").map((p) => p.task.checkId)
  );
  const pickedCheckIds = new Set(picked.map((p) => p.task.checkId));
  const laterTasks = tasks.filter(
    (t) => duplicatedCheckIds.has(t.checkId) || !pickedCheckIds.has(t.checkId)
  );

  const weeklyProjectedInput = picked.reduce((acc, { task }) => {
    if (task.effort === "quick_win_action") {
      const copy = ACTION_PLAN_COPY[task.checkId];
      return copy?.weeklyFix ? copy.weeklyFix(acc) : acc;
    }
    if (task.effort === "quick_win") {
      return applyCheckFix(acc, task.checkId);
    }
    // The zero-gain fallback (a longer_term task with no bounded weekly
    // action): featured as this week's focus, but no fix is applied —
    // there's no honest partial progress to project for it.
    return acc;
  }, input);

  return {
    weeklyTasks,
    laterTasks,
    weeklyProjectedBreakdown: scoreBusiness(weeklyProjectedInput),
  };
}
