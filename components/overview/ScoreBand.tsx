"use client";

// The navy score band: the real score in a brass ring, the grade once,
// the projected score with the single biggest real gain, and the honest
// change since the last scan. Text on navy is cream (paper) at ≥ 70%
// (7.4:1+). Translucent colors use color-mix(): Tailwind's "/70"
// shorthand produces no CSS for this project's var()-based colors.

import { useState } from "react";
import Link from "next/link";
import { IconArrowDown, IconArrowUp, IconChevronDown, IconSparkles } from "@tabler/icons-react";
import { AnimatedScoreRing } from "@/components/overview/AnimatedScoreRing";
import { jumpToAnchor } from "@/components/layout/AnchorHighlight";
import { BREAKDOWN_ANCHOR } from "@/components/overview/ScoreBreakdownPanel";
import { formatPoints } from "@/components/scoring/CategoryCard";
import { GRADE_THRESHOLDS, type Grade, type Suggestion } from "@/lib/scoring";
import { scoreChangeSinceLastScan } from "@/lib/overviewTiles";
import type { ScoreHistoryRow } from "@/app/actions/scoring";
import { formatShortDate, t, tPlural, useLocale, useTimeZone } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** "90–100" for A, "60–69" for D — from the real GRADE_THRESHOLDS. */
function gradeRangeLabel(index: number): string {
  const threshold = GRADE_THRESHOLDS[index];
  if (index === 0) return `${threshold.min}–100`;
  return `${threshold.min}–${GRADE_THRESHOLDS[index - 1].min - 1}`;
}

/** The grade; tapping it shows what each letter means (the real ranges). */
function GradeExplainer({ grade }: { grade: Grade }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t(locale, "dashboard.overview.gradeMeaningAriaLabel")}
        className="inline-flex items-center gap-2 rounded-lg border border-[color:color-mix(in_srgb,var(--color-brass)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--color-paper)_6%,transparent)] px-2.5 py-1 text-paper transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-paper)_12%,transparent)]"
      >
        <span className="text-[12px] font-medium text-[color:color-mix(in_srgb,var(--color-paper)_70%,transparent)]">{t(locale, "dashboard.overview.gradeColumn")}</span>
        <span className="font-serif text-lg font-bold leading-none">{grade}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-60 rounded-xl border border-paper-deep bg-white p-4 shadow-card">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-soft">
            {t(locale, "dashboard.overview.gradeRangesHeading")}
          </div>
          <div className="flex flex-col gap-1.5">
            {GRADE_THRESHOLDS.map((threshold, i) => (
              <div
                key={threshold.grade}
                className={cn("flex items-center justify-between text-sm", threshold.grade === grade ? "font-semibold text-ink" : "text-ink-soft")}
              >
                <span>{threshold.grade}</span>
                <span className="tabular-nums">{gradeRangeLabel(i)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** "Since last scan": the change from the two latest saved scans —
 * "No change", "↑ 2 points", or (when PostScore's scoring changed in
 * between) the honest scoring-update wording instead of a delta. The
 * arrow opens the recent scans it came from. */
export function SinceLastScanControl({ history }: { history: ScoreHistoryRow[] }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [open, setOpen] = useState(false);
  const change = scoreChangeSinceLastScan(history);

  if (change.kind === "first") {
    return (
      <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--color-paper)_10%,transparent)] bg-[color:color-mix(in_srgb,var(--color-paper)_5%,transparent)] p-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:color-mix(in_srgb,var(--color-paper)_70%,transparent)]">{t(locale, "dashboard.overview.sinceLastScanLabel")}</div>
        <div className="mt-1.5 text-sm text-[color:color-mix(in_srgb,var(--color-paper)_70%,transparent)]">{t(locale, "dashboard.overview.trackingStartsNow")}</div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full rounded-xl border border-[color:color-mix(in_srgb,var(--color-paper)_10%,transparent)] bg-[color:color-mix(in_srgb,var(--color-paper)_5%,transparent)] p-4 text-left transition-colors hover:border-[color:color-mix(in_srgb,var(--color-paper)_25%,transparent)]"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:color-mix(in_srgb,var(--color-paper)_70%,transparent)]">{t(locale, "dashboard.overview.sinceLastScanLabel")}</span>
          <IconChevronDown size={15} className={cn("shrink-0 text-[color:color-mix(in_srgb,var(--color-paper)_80%,transparent)] transition-transform", open && "rotate-180")} aria-hidden />
        </div>
        {change.kind === "scoring_updated" ? (
          <div className="mt-1.5 text-[14px] font-semibold leading-snug text-paper">{t(locale, "dashboard.overview.scoreCard.scoringUpdated")}</div>
        ) : (
          <div className="mt-1 flex items-center gap-2 font-serif text-2xl font-bold text-paper">
            {change.delta !== 0 && (
              // Solid status color behind a cream arrow (5.3:1+); the
              // words say the direction too.
              <span aria-hidden className={cn("flex h-6 w-6 items-center justify-center rounded-full", change.delta > 0 ? "bg-green" : "bg-red")}>
                {change.delta > 0 ? <IconArrowUp size={15} className="text-paper" /> : <IconArrowDown size={15} className="text-paper" />}
              </span>
            )}
            {change.delta === 0
              ? t(locale, "dashboard.overview.noChange")
              : `${change.delta > 0 ? "" : "−"}${tPlural(locale, "dashboard.overview.band.points", Math.abs(change.delta), { count: Math.abs(change.delta) })}`}
            {change.delta !== 0 && <span className="sr-only">{change.delta > 0 ? "up" : "down"}</span>}
          </div>
        )}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border border-paper-deep bg-white p-3 shadow-card">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-soft">{t(locale, "dashboard.overview.recentScansHeading")}</div>
          <div className="flex flex-col divide-y divide-paper-line">
            {history.slice(0, 6).map((row) => (
              <div key={row.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink-soft">{formatShortDate(row.created_at, locale, timeZone)}</span>
                <span className="font-medium text-ink">
                  {row.total} · {row.grade}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** "up to +5 pts": whole points; a fix under one point keeps its decimal
 * rather than rounding up to a promise. */
export function boostPoints(points: number): string {
  return points >= 1 ? String(Math.round(points)) : formatPoints(points);
}

/** The full-width navy band, as before: the score ring and grade, the
 * projected score (with the biggest single boost), and "Since last scan". */
export function ScoreBand({
  businessId,
  score,
  grade,
  history,
  projectedScore,
  projectedGrade,
  biggestBoost,
  freeWaitingPoints,
}: {
  businessId: string;
  score: number;
  grade: Grade;
  /** Saved scans, newest first. */
  history: ScoreHistoryRow[];
  projectedScore: number;
  projectedGrade: Grade;
  biggestBoost: Suggestion | null;
  /** Free: the points waiting to be fixed (the scoring's own projection)
   * replace the projected score, with no suggestion shown; undefined on
   * Grow and above. */
  freeWaitingPoints?: number | null;
}) {
  const locale = useLocale();
  return (
    <section className="relative rounded-2xl bg-ink p-5 shadow-card sm:p-6 nav:p-7">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[color:color-mix(in_srgb,var(--color-brass)_15%,transparent)] blur-3xl" />
      </div>
      <div className="relative grid grid-cols-1 items-center gap-5 nav:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] nav:gap-6">
        <div className="flex items-center justify-center gap-5 nav:justify-start">
          <div className="flex flex-col items-center gap-2">
            <AnimatedScoreRing score={score} businessId={businessId} size={164} />
            {/* A real link (works without JS); the click jumps in place
                and opens + highlights the breakdown. */}
            <a
              href={`#${BREAKDOWN_ANCHOR}`}
              onClick={(e) => {
                e.preventDefault();
                jumpToAnchor(BREAKDOWN_ANCHOR);
              }}
              className="-my-1 inline-flex items-center whitespace-nowrap rounded px-1.5 py-1 text-[12px] font-medium text-[color:color-mix(in_srgb,var(--color-paper)_70%,transparent)] underline-offset-2 transition-colors hover:text-paper hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass"
            >
              {t(locale, "dashboard.overview.band.seeBreakdown")}
            </a>
          </div>
          <div className="flex flex-col items-start gap-2.5">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:color-mix(in_srgb,var(--color-paper)_70%,transparent)]">{t(locale, "dashboard.overview.currentScoreHeading")}</div>
            <GradeExplainer grade={grade} />
          </div>
        </div>

        {freeWaitingPoints !== undefined ? (
          <div data-testid="free-waiting" className="flex flex-col justify-center gap-1 rounded-xl border border-[color:color-mix(in_srgb,var(--color-paper)_10%,transparent)] bg-[color:color-mix(in_srgb,var(--color-paper)_5%,transparent)] p-4">
            {freeWaitingPoints && freeWaitingPoints > 0 ? (
              <>
                <span className="font-serif text-2xl font-bold text-brass">+{freeWaitingPoints}</span>
                <span className="text-[13px] font-medium text-paper">
                  {freeWaitingPoints === 1 ? t(locale, "dashboard.free.waitingPointsOne") : t(locale, "dashboard.free.waitingPoints", { points: freeWaitingPoints })}
                </span>
              </>
            ) : (
              <span className="text-[13px] font-medium text-paper">{t(locale, "dashboard.free.waitingNone")}</span>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--color-paper)_10%,transparent)] bg-[color:color-mix(in_srgb,var(--color-paper)_5%,transparent)] p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:color-mix(in_srgb,var(--color-paper)_70%,transparent)]">{t(locale, "dashboard.overview.projectedLabel")}</div>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-2xl font-bold text-paper">{projectedScore}</span>
              <span className="text-sm text-[color:color-mix(in_srgb,var(--color-paper)_70%,transparent)]">{t(locale, "dashboard.overview.scoreOutOf100WithGrade", { grade: projectedGrade })}</span>
            </div>
            <Link href={`/business/${businessId}/growth`} className="w-fit text-[12.5px] font-medium text-[color:color-mix(in_srgb,var(--color-paper)_80%,transparent)] hover:text-paper hover:underline">
              {t(locale, "dashboard.overview.seeActionPlan")}
            </Link>
            {biggestBoost && (
              <Link
                href={`/business/${businessId}/growth`}
                className="mt-1 inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border border-[color:color-mix(in_srgb,var(--color-brass)_50%,transparent)] bg-[color:color-mix(in_srgb,var(--color-brass)_15%,transparent)] px-3 py-1 text-[12.5px] font-semibold text-paper hover:bg-[color:color-mix(in_srgb,var(--color-brass)_25%,transparent)]"
              >
                <IconSparkles size={14} className="shrink-0 text-brass" />
                <span className="truncate">
                  {t(locale, "dashboard.overview.biggestBoost", { points: boostPoints(biggestBoost.promisedPoints), label: biggestBoost.label })}
                </span>
              </Link>
            )}
          </div>
        )}

        <SinceLastScanControl history={history} />
      </div>
    </section>
  );
}
