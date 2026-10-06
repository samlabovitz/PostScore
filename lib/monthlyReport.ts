// Pure content builder for the monthly "here's what happened" email
// report. Same discipline as lib/scoring.ts: deterministic, no dates
// read from the system clock, no network calls — given the same two
// scan rows (plus an optional competitor delta), buildMonthlyReportContent
// always returns the exact same MonthlyReportContent. This module never
// sends anything, never queries the database, and knows nothing about
// email/HTML — see the (not-yet-built) email-sending layer for that.
//
// The one rule every field here exists to enforce: a metric is either a
// REAL delta between two real data points, or it is honestly marked
// unavailable — never a fabricated number, never a guessed trend, and
// never a real "no change" collapsed into looking the same as "we
// couldn't measure this." Mirrors the confidence discipline in
// lib/scoring.ts (VERIFIED vs excluded) and the "never treat unknown as
// zero" rule in lib/profileChanges.ts.

import { diffProfileSnapshots, type ProfileChange, type ProfileSnapshot } from "./profileChanges";
import { generateSuggestions, type Grade, type ScoreBreakdown } from "./scoring";
import { growthMoveOverlapsScore } from "./assistant";
import type { GrowthMoveId } from "./growthMoves";
import { DEFAULT_LOCALE, t, tPlural, type Locale } from "@/lib/i18n";

/**
 * One real saved scan, exactly the fields buildMonthlyReportContent
 * needs — deliberately mirrors ReportsScoreRow in app/actions/reports.ts
 * (same real `scores` row), just camelCased for a pure lib file that
 * can't import from a "use server" module. Whoever wires up the actual
 * monthly-report job maps a real `scores` row into this shape.
 */
export interface MonthlyReportScoreRow {
  id: string;
  total: number;
  grade: Grade;
  createdAt: string;
  /** Real Google listing fields at scan time — null for a scan saved
   * before profile-snapshot tracking existed. Never treated as zero. */
  profileSnapshot: ProfileSnapshot | null;
  /** The real, full per-check scoring breakdown for this exact scan —
   * the same `breakdown_json` every `scores` row already stores (see
   * supabase/schema.sql), never recomputed or estimated here. Unlike
   * profileSnapshot this is never null: breakdown_json has been a
   * required column since the `scores` table was created, so every real
   * scan row has one. Only the CURRENT row's breakdown is ever read (by
   * buildFocus below) — a baseline row carries one too, for symmetry,
   * but nothing here diffs it against the current scan's.
   */
  breakdown: ScoreBreakdown;
}

/** The subject business's real standing in one real competitor scan —
 * rank is 1-based, totalCompetitors includes the subject itself (e.g.
 * rank: 2, totalCompetitors: 10 = "#2 of 10 nearby"). */
export interface CompetitorSnapshot {
  rank: number;
  totalCompetitors: number;
  /** The real review count of whichever business ranked #1 in this same
   * competitor scan — a genuine fact from that scan's own
   * RankedCompetitor list (see lib/competitors.ts), never estimated.
   * null when that scan didn't produce a usable review count for the
   * top-ranked business (e.g. Google returned none). Used only to
   * compute the honest "the top-ranked business has N more reviews"
   * focus pointer below — never shown as a raw number on its own, since
   * without the subject's own real review count alongside it, it's not
   * a comparison anyone could act on.
   */
  topCompetitorReviewCount: number | null;
}

/** Both sides of a real competitor-rank comparison — the caller only
 * ever constructs this when a real competitor scan exists at BOTH the
 * baseline and current points; pass null otherwise, including for a
 * genuine first report (there is nothing to compare a first scan to). */
export interface CompetitorDelta {
  previous: CompetitorSnapshot;
  current: CompetitorSnapshot;
}

/**
 * A single numeric fact (rating, review count) with an honest
 * availability flag. `available: false` means we don't even know the
 * CURRENT value (e.g. this scan predates snapshot tracking) — never
 * confused with "available but unchanged." When available, `previous`/
 * `delta` are independently null on a baseline report or when the prior
 * snapshot itself is missing — never inferred as zero.
 */
export type MetricResult =
  | { available: true; current: number; previous: number | null; delta: number | null }
  | { available: false };

/** Score/grade movement — `current` is always real (a `scores` row
 * always has a total/grade); `previous`/`scoreDelta`/`gradeChanged` are
 * only meaningful once a real baseline scan exists. */
export interface ScoreMovement {
  current: { total: number; grade: Grade };
  previous: { total: number; grade: Grade } | null;
  scoreDelta: number | null;
  gradeChanged: boolean;
}

/** Real competitor-rank movement, or honestly unavailable — never
 * inferred from a single scan, since a rank needs two real points. */
export type CompetitorMovement =
  | { available: true; current: CompetitorSnapshot; previous: CompetitorSnapshot; rankDelta: number }
  | { available: false };

/** Every OTHER real listing-field change (phone/website/hours/
 * categories/photos/status) between the two scans — rating/review-count
 * changes are deliberately excluded here since they're already their own
 * dedicated MetricResult fields above; this only exists so the two
 * numbers never get reported twice. `available: false` when either scan
 * predates profile-snapshot tracking (or this is a baseline report) —
 * distinct from `available: true, changes: []` (a real, checked, quiet
 * month with nothing to report). */
export type ListingChangesResult =
  | { available: true; changes: ProfileChange[] }
  | { available: false };

/** What kind of real fact a closing focus pointer is grounded in —
 * exists so a caller (or a test) can verify every pointer traces back
 * to something real, never free-written advice. */
export type FocusPointerKind = "score_gap" | "growth_move" | "routine";

/** One line in the closing "what to focus on" section. Every pointer is
 * assembled — never generated — from a real fact already computed by
 * the SAME real sources the Growth/Action-Plan pages use, never a
 * second, duplicated decision:
 *   - "score_gap": the real, already action-plan-merged (review cards
 *     combined into one) biggest-opportunity task — `checkId` names
 *     exactly which real check (or the synthetic merged-reviews id),
 *     so this can always be traced back to the breakdown it came from.
 *     At most one of these ever appears, and it's the only pointer
 *     kind that can ever be review-related.
 *   - "growth_move": one real, currently-firing growth move (see
 *     buildGrowthMoves in lib/growthMoves.ts) — which one rotates
 *     deterministically by the real recap month (see
 *     MonthlyReportFocusInputs.monthIndex) — framed with the exact
 *     same honest "brings in customers, doesn't change your score" vs.
 *     "also raises your score" badge text the Growth page itself uses
 *     (dashboard.growth.moves.badge / badgeAlsoScored), decided by the
 *     real growthMoveOverlapsScore() check, never asserted either way.
 *   - "routine": a real recap of how many weekly_checks rows exist for
 *     this business in the recap month — described only as "checked
 *     off," never as a claim that the owner actually posted, replied,
 *     or added a photo (the owner's own self-report, same honesty rule
 *     as the Growth page's own weekly routine checklist).
 */
export interface FocusPointer {
  kind: FocusPointerKind;
  text: string;
  /** The real check this pointer came from — set only for "score_gap". */
  checkId?: string;
}

export interface MonthlyReportFocus {
  /** True only when this scan's real breakdown, competitor standing, and
   * listing changes genuinely had nothing worth flagging — a real,
   * rare, near-perfect result, never a stand-in for "we chose not to
   * show a tip." When true, `pointers` is always empty; the email shows
   * an honest "nothing notable this month" line instead of a general
   * tip, so a near-perfect business is never handed filler advice it
   * doesn't need. */
  nothingNotable: boolean;
  pointers: FocusPointer[];
}

export type MonthlyReportKind = "baseline" | "update";

export interface MonthlyReportContent {
  kind: MonthlyReportKind;
  /** One honest, plain-language headline sentence — the report's own
   * "here's the takeaway," built only from the same real fields below. */
  summary: string;
  score: ScoreMovement;
  rating: MetricResult;
  reviewCount: MetricResult;
  competitor: CompetitorMovement;
  /** The subject's real current competitor standing, independent of
   * whether a previous scan exists to compare against — null when no
   * competitor scan has ever been run. Exists so a baseline (first)
   * report, which structurally has nothing to diff `competitor` against,
   * can still show "here's where you stand today" instead of "not
   * tracked" when a real scan was in fact just run. See
   * emails/MonthlyReportEmail.tsx's CompetitorSection for the only place
   * this is read — always alongside `kind === "baseline"`. */
  competitorStanding: CompetitorSnapshot | null;
  /** Whether this business has EVER had a real competitor scan saved —
   * independent of whether `competitorStanding`/`competitor` have a
   * value right now. Lets the "no standing" case in
   * emails/MonthlyReportEmail.tsx's CompetitorSection tell apart two
   * very different real facts that both leave competitorStanding null:
   * a scan has never been run at all (point to the Competitors page),
   * vs. a scan genuinely ran and found no comparable nearby businesses
   * (say that plainly instead). Defaults to true in
   * buildMonthlyReportContent so every existing caller that doesn't
   * pass it keeps getting the original "couldn't find enough
   * comparable" wording. */
  hasSavedCompetitorScan: boolean;
  listingChanges: ListingChangesResult;
  /** True only for an "update" report where every metric we could
   * actually measure showed no real change — the honest "you held
   * steady" month. Always false for a baseline report (there's nothing
   * yet to call steady against). A metric we couldn't measure never
   * counts against steadiness — this is about what moved among what we
   * could check, not a claim about what we couldn't. */
  isSteady: boolean;
  /** The closing "this month & what to focus on" section — see
   * MonthlyReportFocus. Assembled entirely from this same real content
   * (the current scan's breakdown, the real competitor/listing facts
   * above), never a separately generated summary. */
  focus: MonthlyReportFocus;
}

function roundTo1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatRating(rating: number): string {
  return `${rating.toFixed(1)}★`;
}

function numericMetric(previousValue: number | null | undefined, currentValue: number | null | undefined): MetricResult {
  if (currentValue == null) return { available: false };
  if (previousValue == null) return { available: true, current: currentValue, previous: null, delta: null };
  return { available: true, current: currentValue, previous: previousValue, delta: roundTo1(currentValue - previousValue) };
}

function competitorMovement(delta: CompetitorDelta | null): CompetitorMovement {
  if (!delta) return { available: false };
  return {
    available: true,
    current: delta.current,
    previous: delta.previous,
    // Rank 1 is best, so a falling rank NUMBER is an improvement —
    // positive rankDelta means "moved up."
    rankDelta: delta.previous.rank - delta.current.rank,
  };
}

function listingChanges(
  previous: ProfileSnapshot | null,
  current: ProfileSnapshot | null,
  locale: Locale
): ListingChangesResult {
  if (!previous || !current) return { available: false };
  return {
    available: true,
    changes: diffProfileSnapshots(previous, current, locale).filter((c) => c.field !== "rating" && c.field !== "reviews"),
  };
}

function competitorPhrase(competitor: CompetitorMovement): string | null {
  if (!competitor.available) return null;
  return `#${competitor.current.rank} of ${competitor.current.totalCompetitors} nearby`;
}

function buildBaselineSummary(current: MonthlyReportScoreRow, rating: MetricResult, competitor: CompetitorMovement): string {
  const facts: string[] = [];
  if (rating.available) facts.push(`rating ${formatRating(rating.current)}`);
  const competitorFact = competitorPhrase(competitor);
  if (competitorFact) facts.push(competitorFact);
  facts.push(`score ${current.total} (${current.grade})`);
  return `Here's where you stand today — ${facts.join(", ")}. Month-over-month tracking starts with your next report.`;
}

function buildSteadySummary(current: MonthlyReportScoreRow, rating: MetricResult, competitor: CompetitorMovement): string {
  const facts: string[] = [];
  // "Stable" is a claim about a real comparison — only make it when we
  // actually have a confirmed zero delta, never just because we know
  // today's number with no known previous one to compare it to.
  if (rating.available && rating.delta === 0) facts.push(`rating stable at ${formatRating(rating.current)}`);
  const competitorFact = competitorPhrase(competitor);
  if (competitorFact && competitor.available && competitor.rankDelta === 0) facts.push(`still ${competitorFact}`);
  facts.push(`score unchanged at ${current.total} (${current.grade})`);
  return `You held steady this month — ${facts.join(", ")}.`;
}

function capitalizeFirst(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

function buildMovementSummary(
  scoreDelta: number,
  current: MonthlyReportScoreRow,
  gradeChanged: boolean,
  rating: MetricResult,
  reviewCount: MetricResult,
  competitor: CompetitorMovement,
  changes: ListingChangesResult,
  locale: Locale
): string {
  const parts: string[] = [];

  // Score/grade/rating/competitor phrasing below reuses the EXACT SAME
  // report.fragment.* keys the email headline (buildHeadline in
  // emails/MonthlyReportEmail.tsx) builds from — never a second,
  // separately-worded copy of "your score rose N points" or "you moved
  // up/down" that could drift from it. The trailing "to {total}
  // ({grade})"/join punctuation below is this sentence's own glue, not
  // shared with the headline, so it stays plain template literals.
  if (scoreDelta !== 0) {
    const scoreFragment = tPlural(
      locale,
      scoreDelta > 0 ? "report.fragment.scoreRose" : "report.fragment.scoreDropped",
      Math.abs(scoreDelta)
    );
    parts.push(`${scoreFragment} to ${current.total}${gradeChanged ? ` (${current.grade})` : ""}`);
  } else if (gradeChanged) {
    parts.push(t(locale, "report.fragment.gradeChanged", { grade: current.grade }));
  }

  if (rating.available && rating.delta !== null && rating.delta !== 0) {
    parts.push(
      t(locale, rating.delta > 0 ? "report.fragment.ratingRose" : "report.fragment.ratingDropped", {
        value: rating.current.toFixed(1),
      })
    );
  }

  if (reviewCount.available && reviewCount.delta !== null && reviewCount.delta !== 0) {
    parts.push(
      reviewCount.delta > 0
        ? tPlural(locale, "report.summary.reviewsGained", reviewCount.delta)
        : t(locale, "report.summary.reviewsLost", { count: Math.abs(reviewCount.delta) })
    );
  }

  if (competitor.available && competitor.rankDelta !== 0) {
    parts.push(
      t(locale, competitor.rankDelta > 0 ? "report.fragment.competitorUp" : "report.fragment.competitorDown", {
        rank: competitor.current.rank,
        total: competitor.current.totalCompetitors,
      })
    );
  }

  if (changes.available && changes.changes.length > 0) {
    parts.push(tPlural(locale, "report.summary.listingChanges", changes.changes.length));
  }

  return `${capitalizeFirst(parts.join("; "))}.`;
}

/** The real, already action-plan-merged (review cards combined into
 * one "reviews" card — see mergeReviewTasks in lib/actionPlan.ts)
 * biggest-opportunity task, as computed by the SAME real pipeline the
 * Action Plan/Growth pages use — the caller builds this from
 * buildActionPlan + mergeReviewTasks, never a separately re-derived
 * ranking. Only the fields buildFocus actually needs to phrase the
 * pointer; null when there are no open tasks at all. */
export interface FocusTopActionPlanTask {
  checkId: string;
  label: string;
  action: string;
}

/** One real, currently-firing growth move (see buildGrowthMoves in
 * lib/growthMoves.ts) — the caller passes these through completely
 * unchanged (same real order, referralOk already respected since
 * buildGrowthMoves itself never includes start_referral when it's
 * false), never recomputed here. */
export interface FocusGrowthMove {
  id: GrowthMoveId;
  title: string;
  why: string;
}

/**
 * Everything buildFocus needs beyond the scan's own breakdown — all of
 * it real, already computed by the caller from the exact same real
 * functions the Growth/Action-Plan pages use. Optional/defaulted on
 * buildMonthlyReportContent so a caller that only needs the score/
 * rating/competitor/listing sections (most tests) can omit it entirely
 * — the focus section is then honestly empty rather than fabricated.
 */
export interface MonthlyReportFocusInputs {
  topActionPlanTask: FocusTopActionPlanTask | null;
  growthMoves: FocusGrowthMove[];
  /**
   * A real, monotonically-increasing month index (e.g.
   * `year * 12 + month0`) — NEVER the raw "YYYYMM" digits, which jump
   * unevenly across year boundaries and can collide with `% length`
   * for some business/length combinations (the exact rotation bug
   * buildAssistantStarterPrompts had and fixed — see lib/assistant.ts's
   * own comment on it). This index incrementing by exactly 1 from one
   * real recap month to the next is what guarantees the same month
   * always picks the same growth move, and the next real month always
   * picks a different one whenever more than one fires.
   */
  monthIndex: number;
  /** How many real weekly_checks rows exist for this business within
   * the recap month — null only when this genuinely couldn't be read
   * (never fabricated as 0; a real, honest zero is a normal value). */
  routineCheckedCount: number | null;
}

const EMPTY_FOCUS_INPUTS: MonthlyReportFocusInputs = {
  topActionPlanTask: null,
  growthMoves: [],
  monthIndex: 0,
  routineCheckedCount: null,
};

/** The real, already-merged top action-plan task — at most ONE pointer,
 * and the only kind that can ever be review-related (mergeReviewTasks
 * already combined rating/review_count/review_recency into one real
 * card upstream, so this is never two separate review pointers). */
function scoreGapPointer(topTask: FocusTopActionPlanTask | null, locale: Locale): FocusPointer | null {
  if (!topTask) return null;
  return {
    kind: "score_gap",
    text: t(locale, "report.focus.biggestOpportunity", { label: topTask.label, advice: topTask.action }),
    checkId: topTask.checkId,
  };
}

/**
 * Whether a growth move's own real fix is the SAME real-world action as
 * the score-gap task already shown above it — not merely "also moves
 * the needle on some losing check" (that's growthMoveOverlapsScore's
 * own, deliberately broader question, used for the badge text below).
 * "improve_website" IS the website category's fix in general, so it
 * duplicates any score-gap task that's itself a website.* check;
 * "add_photos_vs_competitors" duplicates one specifically about
 * completeness.photos. Every other move targets its own distinct real
 * action (a coupon, a referral, a price check, a brand-new site) that
 * never coincides with an action-plan task's own wording.
 */
function growthMoveDuplicatesTopTask(moveId: GrowthMoveId, topTaskCheckId: string): boolean {
  switch (moveId) {
    case "improve_website":
      return topTaskCheckId.startsWith("website.");
    case "add_photos_vs_competitors":
      return topTaskCheckId === "completeness.photos";
    default:
      return false;
  }
}

/**
 * ONE real, currently-firing growth move — rotated deterministically by
 * the real recap month (see MonthlyReportFocusInputs.monthIndex) so the
 * same month always shows the same move and the next real month shows
 * a different one whenever more than one qualifies. Framed with the
 * exact same honest "brings in customers, doesn't change your score"
 * vs. "also raises your score" badge text the Growth page itself shows
 * (dashboard.growth.moves.badge / badgeAlsoScored) — decided by the
 * real growthMoveOverlapsScore(), never asserted either way by this
 * function.
 *
 * Skips any move that would just repeat the score-gap pointer already
 * shown above it (see growthMoveDuplicatesTopTask) — rotation then
 * advances to the next real move instead, wrapping around at most once;
 * if every firing move duplicates the score gap, this honestly shows no
 * growth-move pointer at all rather than a redundant one.
 */
function growthMovePointer(
  moves: FocusGrowthMove[],
  losingChecks: Array<{ checkId: string }>,
  monthIndex: number,
  topTaskCheckId: string | null,
  locale: Locale
): FocusPointer | null {
  if (moves.length === 0) return null;
  const startIndex = ((monthIndex % moves.length) + moves.length) % moves.length;
  for (let offset = 0; offset < moves.length; offset++) {
    const move = moves[(startIndex + offset) % moves.length];
    if (topTaskCheckId && growthMoveDuplicatesTopTask(move.id, topTaskCheckId)) continue;
    const overlaps = growthMoveOverlapsScore(move.id, losingChecks);
    const badge = t(locale, overlaps ? "dashboard.growth.moves.badgeAlsoScored" : "dashboard.growth.moves.badge");
    return {
      kind: "growth_move",
      text: t(locale, "report.focus.growthMove", { title: move.title, why: move.why, badge }),
    };
  }
  return null;
}

/**
 * A real recap of this business's own weekly_checks rows for the recap
 * month — described only as "checked off," never as a claim the owner
 * actually posted, replied, or added a photo (same self-report honesty
 * rule as the Growth page's own weekly routine checklist). `null`
 * (genuinely unreadable) means no pointer at all; a real zero still
 * gets an honest pointer to the real checklist, never silently omitted.
 */
function routinePointer(checkedCount: number | null, locale: Locale): FocusPointer | null {
  if (checkedCount === null) return null;
  if (checkedCount === 0) {
    return { kind: "routine", text: t(locale, "report.focus.routineNonePointer") };
  }
  return { kind: "routine", text: tPlural(locale, "report.focus.routineCheckedCount", checkedCount) };
}

/** How many pointers the closing focus section can ever show — one
 * score item, one growth move, one routine recap; never more, and
 * never padded when fewer than 3 real candidates exist. */
const MAX_FOCUS_POINTERS = 3;

/**
 * Assembles the closing "what to focus on" section entirely from real
 * facts — a real action-plan top task (score_gap), a real firing
 * growth move (growth_move), and a real weekly-routine recap (routine)
 * — each at most once, never a generated paragraph and never padded
 * with an invented concern. If literally none of the three real
 * sources had anything (including a genuinely unreadable routine
 * count), this says so honestly instead of forcing content into an
 * otherwise-empty section.
 */
function buildFocus(breakdown: ScoreBreakdown, focusInputs: MonthlyReportFocusInputs, locale: Locale): MonthlyReportFocus {
  const losingChecks = generateSuggestions(breakdown, locale);

  const pointers: FocusPointer[] = [];
  const scoreGap = scoreGapPointer(focusInputs.topActionPlanTask, locale);
  if (scoreGap) pointers.push(scoreGap);
  const growthMove = growthMovePointer(
    focusInputs.growthMoves,
    losingChecks,
    focusInputs.monthIndex,
    focusInputs.topActionPlanTask?.checkId ?? null,
    locale
  );
  if (growthMove) pointers.push(growthMove);
  const routine = routinePointer(focusInputs.routineCheckedCount, locale);
  if (routine) pointers.push(routine);

  if (pointers.length === 0) {
    return { nothingNotable: true, pointers: [] };
  }
  return { nothingNotable: false, pointers: pointers.slice(0, MAX_FOCUS_POINTERS) };
}

/**
 * Builds this month's report content from two real scans (baseline null
 * only for a business's genuine first report) and an optional real
 * competitor-rank comparison. Pure and deterministic: the same three
 * inputs always produce the same content, and every field is either a
 * real number/delta or an honest "unavailable" — nothing here is ever
 * estimated, interpolated, or defaulted to zero.
 */
export function buildMonthlyReportContent(
  baseline: MonthlyReportScoreRow | null,
  current: MonthlyReportScoreRow,
  competitorDelta: CompetitorDelta | null,
  /** The real current competitor standing, if a scan exists right now —
   * independent of `competitorDelta`, which stays null whenever there's
   * no comparable PREVIOUS scan to diff against (always true on a
   * baseline report, by definition). Defaults to null so every existing
   * caller that doesn't pass it keeps behaving exactly as before. */
  currentCompetitorSnapshot: CompetitorSnapshot | null = null,
  locale: Locale = DEFAULT_LOCALE,
  /** Real inputs for the closing focus section (see
   * MonthlyReportFocusInputs) — defaults to "nothing real to show" so
   * every existing caller that only cares about the score/rating/
   * competitor/listing sections can omit this entirely. */
  focusInputs: MonthlyReportFocusInputs = EMPTY_FOCUS_INPUTS,
  /** Whether this business has EVER had a real competitor scan saved —
   * see MonthlyReportContent.hasSavedCompetitorScan's own doc. Defaults
   * to true so every existing caller that doesn't pass it keeps getting
   * the original "couldn't find enough comparable" wording whenever
   * currentCompetitorSnapshot is null. */
  hasSavedCompetitorScan: boolean = true
): MonthlyReportContent {
  const competitor = competitorMovement(competitorDelta);

  if (!baseline) {
    const rating = numericMetric(null, current.profileSnapshot?.rating);
    const reviewCount = numericMetric(null, current.profileSnapshot?.reviewCount);

    return {
      kind: "baseline",
      summary: buildBaselineSummary(current, rating, competitor),
      score: {
        current: { total: current.total, grade: current.grade },
        previous: null,
        scoreDelta: null,
        gradeChanged: false,
      },
      rating,
      reviewCount,
      competitor,
      competitorStanding: currentCompetitorSnapshot,
      hasSavedCompetitorScan,
      // Nothing to diff a first report against, structurally — not "no
      // changes found," genuinely not applicable.
      listingChanges: { available: false },
      isSteady: false,
      focus: buildFocus(current.breakdown, focusInputs, locale),
    };
  }

  const rating = numericMetric(baseline.profileSnapshot?.rating, current.profileSnapshot?.rating);
  const reviewCount = numericMetric(baseline.profileSnapshot?.reviewCount, current.profileSnapshot?.reviewCount);
  const changes = listingChanges(baseline.profileSnapshot, current.profileSnapshot, locale);

  const scoreDelta = current.total - baseline.total;
  const gradeChanged = current.grade !== baseline.grade;

  // A metric we couldn't measure — either fully unavailable, or available
  // now but with no real previous value to compare against (delta: null)
  // — never counts against "steady": this is about whether anything we
  // COULD actually compare moved, not a claim about what we couldn't.
  const metricIsUnchanged = (metric: MetricResult): boolean =>
    !metric.available || metric.delta === null || metric.delta === 0;
  const isSteady =
    scoreDelta === 0 &&
    !gradeChanged &&
    metricIsUnchanged(rating) &&
    metricIsUnchanged(reviewCount) &&
    (!changes.available || changes.changes.length === 0) &&
    (!competitor.available || competitor.rankDelta === 0);

  return {
    kind: "update",
    summary: isSteady
      ? buildSteadySummary(current, rating, competitor)
      : buildMovementSummary(scoreDelta, current, gradeChanged, rating, reviewCount, competitor, changes, locale),
    score: {
      current: { total: current.total, grade: current.grade },
      previous: { total: baseline.total, grade: baseline.grade },
      scoreDelta,
      gradeChanged,
    },
    rating,
    reviewCount,
    competitor,
    competitorStanding: currentCompetitorSnapshot,
    hasSavedCompetitorScan,
    listingChanges: changes,
    isSteady,
    focus: buildFocus(current.breakdown, focusInputs, locale),
  };
}
