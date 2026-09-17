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
export type FocusPointerKind = "score_gap" | "competitor_gap" | "listing_issue" | "general_tip";

/** One line in the closing "what to focus on" section. Every pointer is
 * assembled — never generated — from a real fact this scan already
 * produced:
 *   - "score_gap": a real check from THIS scan's own breakdown that's
 *     currently losing points, using that check's own real explanation/
 *     advice copy (see lib/scoring.ts's CHECKS) — never hand-written per
 *     report. `checkId` names exactly which real check, so this can
 *     always be traced back to the breakdown it came from.
 *   - "competitor_gap": a real, computed gap between the subject's own
 *     real current review count and the top-ranked competitor's real
 *     review count from the same competitor scan.
 *   - "listing_issue": a real, already-detected change from
 *     diffProfileSnapshots (the same list rendered under "Listing
 *     changes" elsewhere in the report) — never a separately-invented
 *     description.
 *   - "general_tip": the ONE exception to "grounded in this business's
 *     own data" — a fixed, vetted, evergreen tip from GENERAL_FOCUS_TIPS
 *     below, used only to fill a genuinely empty remaining slot, and
 *     never phrased as a claim about this specific business (no
 *     "checkId", since it isn't tied to one).
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

function listingChanges(previous: ProfileSnapshot | null, current: ProfileSnapshot | null): ListingChangesResult {
  if (!previous || !current) return { available: false };
  return {
    available: true,
    changes: diffProfileSnapshots(previous, current).filter((c) => c.field !== "rating" && c.field !== "reviews"),
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
  changes: ListingChangesResult
): string {
  const parts: string[] = [];

  if (scoreDelta !== 0) {
    parts.push(
      `your score ${scoreDelta > 0 ? "rose" : "dropped"} ${Math.abs(scoreDelta)} point${Math.abs(scoreDelta) === 1 ? "" : "s"} to ${current.total}${gradeChanged ? ` (${current.grade})` : ""}`
    );
  } else if (gradeChanged) {
    parts.push(`your grade changed to ${current.grade}`);
  }

  if (rating.available && rating.delta !== null && rating.delta !== 0) {
    parts.push(`your rating ${rating.delta > 0 ? "rose" : "dropped"} to ${formatRating(rating.current)}`);
  }

  if (reviewCount.available && reviewCount.delta !== null && reviewCount.delta !== 0) {
    parts.push(
      reviewCount.delta > 0
        ? `${reviewCount.delta} new review${reviewCount.delta === 1 ? "" : "s"}`
        : `your review count dropped by ${Math.abs(reviewCount.delta)}`
    );
  }

  if (competitor.available && competitor.rankDelta !== 0) {
    parts.push(
      `you moved ${competitor.rankDelta > 0 ? "up" : "down"} to #${competitor.current.rank} of ${competitor.current.totalCompetitors}`
    );
  }

  if (changes.available && changes.changes.length > 0) {
    parts.push(`${changes.changes.length} listing change${changes.changes.length === 1 ? "" : "s"} detected`);
  }

  return `${capitalizeFirst(parts.join("; "))}.`;
}

/** A small, fixed, hand-vetted set of evergreen best-practice tips —
 * never generated, never claiming anything about a specific business's
 * own data. Used only as a last-resort filler (see buildFocus) when a
 * real scan genuinely didn't produce enough data-derived pointers to
 * fill the section, and always clearly framed as general guidance, not
 * a status report on this business. Deliberately covers ground the
 * scoring engine doesn't measure at all (e.g. Google Business Profile
 * posts aren't a scored check), so it can never contradict or duplicate
 * a real finding shown elsewhere in the same report. */
export const GENERAL_FOCUS_TIPS: FocusPointer[] = [
  {
    kind: "general_tip",
    text: "General tip: posting an update or offer to your Google Business Profile every so often helps keep your listing active in local search — this isn't something we currently measure, so treat it as general guidance, not a status report.",
  },
];

/** Caps how many of the biggest real, currently-losing checks from this
 * scan's own breakdown can become "score_gap" pointers — see
 * buildFocus's overall MAX_FOCUS_POINTERS cap for the section as a
 * whole. */
const MAX_SCORE_GAP_POINTERS = 2;

/** Real, currently-losing checks from this scan's own breakdown, biggest
 * opportunity first — literally generateSuggestions()'s own output
 * (the same real ranking the Website/action-plan pages already show
 * this business), never a separately hand-picked check. */
function scoreGapPointers(breakdown: ScoreBreakdown): FocusPointer[] {
  return generateSuggestions(breakdown)
    .filter((s) => s.promisedPoints > 0)
    .slice(0, MAX_SCORE_GAP_POINTERS)
    .map((s, i) => ({
      kind: "score_gap" as const,
      text:
        i === 0
          ? `Your biggest opportunity: ${s.label} — ${s.advice}`
          : `Also worth a look: ${s.label} — ${s.advice}`,
      checkId: s.checkId,
    }));
}

/** A real, positive gap between the top-ranked business's real review
 * count and the subject's own real current review count, in the same
 * competitor scan — null (no pointer) unless every real fact it needs
 * is actually available: a real competitor comparison, a real current
 * review count, the subject genuinely isn't already #1, and the top
 * competitor's own review count was itself real. Never estimated when
 * any of those is missing. */
function competitorGapPointer(competitor: CompetitorMovement, reviewCount: MetricResult): FocusPointer | null {
  if (!competitor.available || !reviewCount.available) return null;
  if (competitor.current.rank <= 1) return null;
  const topReviews = competitor.current.topCompetitorReviewCount;
  if (topReviews === null) return null;
  const gap = topReviews - reviewCount.current;
  if (gap <= 0) return null;
  return {
    kind: "competitor_gap",
    text: `The top-ranked business near you has ${gap} more review${gap === 1 ? "" : "s"} than you — closing that gap moves your ranking.`,
  };
}

/** A real, already-detected listing change worth the owner's attention —
 * scoped to the fields most likely to actually matter operationally
 * (phone/website/status), never the full raw list already shown
 * elsewhere in the report (categories/photos churn is real but rarely
 * something to "focus on"). Picks diffProfileSnapshots' own first match,
 * never a separately-invented description. */
function listingIssuePointer(listingChanges: ListingChangesResult): FocusPointer | null {
  if (!listingChanges.available) return null;
  const notable = listingChanges.changes.find(
    (c) => c.field === "phone" || c.field === "website" || c.field === "status"
  );
  if (!notable) return null;
  return { kind: "listing_issue", text: `Listing change worth a look: ${notable.description}` };
}

/** How many pointers (data-derived plus, at most, one general tip) the
 * closing focus section ever shows — enough to feel like real,
 * actionable guidance without turning into a second action plan. */
const MAX_FOCUS_POINTERS = 3;

/**
 * Assembles the closing "what to focus on" section entirely from real
 * facts this scan already produced — never a generated paragraph. Every
 * pointer traces back to a real check (score_gap), a real computed
 * competitor gap (competitor_gap), or a real detected change
 * (listing_issue); the one allowed exception is a single fixed,
 * clearly-labeled evergreen tip used only to fill a genuinely empty
 * remaining slot (see GENERAL_FOCUS_TIPS). If literally nothing real
 * stood out, this says so honestly instead of inventing a concern or
 * forcing a generic tip into an otherwise-empty section.
 */
function buildFocus(
  breakdown: ScoreBreakdown,
  competitor: CompetitorMovement,
  reviewCount: MetricResult,
  listingChanges: ListingChangesResult
): MonthlyReportFocus {
  const scoreGaps = scoreGapPointers(breakdown);
  const competitorGap = competitorGapPointer(competitor, reviewCount);
  const listingIssue = listingIssuePointer(listingChanges);

  const pointers: FocusPointer[] = [];
  if (scoreGaps[0]) pointers.push(scoreGaps[0]);
  if (competitorGap) pointers.push(competitorGap);
  if (listingIssue) pointers.push(listingIssue);
  if (scoreGaps[1] && pointers.length < MAX_FOCUS_POINTERS) pointers.push(scoreGaps[1]);

  if (pointers.length === 0) {
    return { nothingNotable: true, pointers: [] };
  }
  if (pointers.length < MAX_FOCUS_POINTERS) {
    pointers.push(GENERAL_FOCUS_TIPS[0]);
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
  competitorDelta: CompetitorDelta | null
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
      // Nothing to diff a first report against, structurally — not "no
      // changes found," genuinely not applicable.
      listingChanges: { available: false },
      isSteady: false,
      focus: buildFocus(current.breakdown, competitor, reviewCount, { available: false }),
    };
  }

  const rating = numericMetric(baseline.profileSnapshot?.rating, current.profileSnapshot?.rating);
  const reviewCount = numericMetric(baseline.profileSnapshot?.reviewCount, current.profileSnapshot?.reviewCount);
  const changes = listingChanges(baseline.profileSnapshot, current.profileSnapshot);

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
      : buildMovementSummary(scoreDelta, current, gradeChanged, rating, reviewCount, competitor, changes),
    score: {
      current: { total: current.total, grade: current.grade },
      previous: { total: baseline.total, grade: baseline.grade },
      scoreDelta,
      gradeChanged,
    },
    rating,
    reviewCount,
    competitor,
    listingChanges: changes,
    isSteady,
    focus: buildFocus(current.breakdown, competitor, reviewCount, changes),
  };
}
