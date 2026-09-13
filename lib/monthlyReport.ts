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
import type { Grade } from "./scoring";

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
}

/** The subject business's real standing in one real competitor scan —
 * rank is 1-based, totalCompetitors includes the subject itself (e.g.
 * rank: 2, totalCompetitors: 10 = "#2 of 10 nearby"). */
export interface CompetitorSnapshot {
  rank: number;
  totalCompetitors: number;
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
  };
}
