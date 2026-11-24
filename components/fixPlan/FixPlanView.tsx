"use client";

// Day 25B step 3: Presence → Fix plan (docs/plans/day25a-spec.md §2b,
// mockup 07). The top card ("This week: 78 → 87" · "When every fix is done:
// 100 · A"), then every score fix ranked Urgent → High → Medium → Low with
// "+N pts", the running score and one button to where it's fixed
// (lib/fixDestination.ts); then "Website speed: not scored yet". The rows
// are the Growth recap's own step cards (#task-…, "How to fix it", "I did
// this"), so anchors and the step-by-step keep working.
// Plans: Free sees the whole ranked list with points (it's the audit) and
// the steps as a locked preview; Grow gets the steps, "I did this" and
// "Premium does this for you in one click →"; Premium's "Fix it" lands on
// the one-click action.

import Link from "next/link";
import { IconWorld } from "@tabler/icons-react";
import { TaskCard, CompletedTasksCard, FixPriorityTag, FixWhenTag, ReviewGoalLinesContext, type WebsiteRecheckProps } from "@/app/business/[id]/ActionPlanSection";
import { WeeklyPlanCelebration } from "@/app/business/[id]/growth/WeeklyPlanCelebration";
import { DetailsMismatchTasks } from "@/components/overview/DetailsMismatchTasks";
import { FIX_BUTTON_CLASS } from "@/components/scoring/FixButton";
import { GoogleMapsAttribution } from "@/components/google/GoogleMapsAttribution";
import type { ActionPlanTask, CompletedTask } from "@/lib/actionPlan";
import type { FixPlan, FixPlanRow } from "@/lib/fixPlan";
import type { DetailsMismatchState } from "@/lib/detailsMismatch.server";
import { mismatchesCoveredBy, URGENT_DETAILS } from "@/lib/detailsMismatch";
import { isHoursCheck, type HoursCheckState } from "@/lib/hoursCheck";
import { formatShortDate, t, tPlural, useLocale, useTimeZone } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { displayPoints } from "@/lib/pointRange";

// One decimal under 10, whole from 10 up (lib/pointRange.ts).
const round1 = (n: number) => String(displayPoints(n));

function rowTitle(row: FixPlanRow, locale: ReturnType<typeof useLocale>): string {
  return row.kind === "website" ? t(locale, "dashboard.fixPlan.websiteRow") : (row.task.title ?? row.task.label);
}

/** "This week: 78 → 87" and "When every fix is done: 100 · A". */
function TopCard({ plan, every, lastScanAt }: { plan: FixPlan; every: { score: number; grade: string }; lastScanAt: string | null }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  // On the 0–100 scale.
  const pct = (n: number) => `${Math.max(0, Math.min(100, n))}%`;
  return (
    <section data-testid="fix-plan-top" className="rounded-2xl bg-ink p-5 text-paper shadow-card sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {plan.thisWeekDone ? (
            <>
              <p className="font-serif text-[24px] font-semibold leading-tight sm:text-[28px]" data-testid="fix-plan-done">
                {plan.thisWeekCount > 0 ? t(locale, "dashboard.fixPlan.doneTitle") : t(locale, "dashboard.fixPlan.noneThisWeek")}
              </p>
              {plan.next && (
                <p className="mt-1.5 text-[14px] text-[color:color-mix(in_srgb,var(--color-paper)_80%,transparent)]" data-testid="fix-plan-next">
                  {t(locale, "dashboard.fixPlan.next", { fix: rowTitle(plan.next, locale), points: round1(plan.next.points) })}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-[13.5px] text-[color:color-mix(in_srgb,var(--color-paper)_75%,transparent)]">{tPlural(locale, "dashboard.fixPlan.thisWeekLabel", plan.thisWeekCount, { count: plan.thisWeekCount })}</p>
              <p className="mt-1 flex items-baseline gap-3 font-serif font-semibold leading-none" data-testid="fix-plan-this-week">
                <span className="text-[44px] tabular-nums sm:text-[56px]">{plan.today}</span>
                <span aria-hidden className="text-[32px] text-brass sm:text-[40px]">→</span>
                <span className="text-[44px] tabular-nums text-brass sm:text-[56px]">{plan.thisWeek}</span>
              </p>
            </>
          )}
        </div>
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--color-paper)_15%,transparent)] px-4 py-3 sm:max-w-[300px]" data-testid="fix-plan-every">
          <p className="text-[13px] text-[color:color-mix(in_srgb,var(--color-paper)_75%,transparent)]">{t(locale, "dashboard.fixPlan.everyFix")}</p>
          <p className="mt-0.5 font-serif text-[26px] font-semibold leading-none">
            {every.score} <span className="text-[15px] text-[color:color-mix(in_srgb,var(--color-paper)_70%,transparent)]">· {every.grade}</span>
          </p>
          {plan.rows.some((r) => r.when === "months") && <p className="mt-1.5 text-[12px] text-[color:color-mix(in_srgb,var(--color-paper)_70%,transparent)]">{t(locale, "dashboard.overview.someFixesTakeMonths")}</p>}
        </div>
      </div>
      {/* Today (solid), this week (brass), the rest of the way to "every fix" (lighter). */}
      <div className="relative mt-5 h-2.5 overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--color-paper)_15%,transparent)]" role="img" aria-label={`${plan.today} → ${plan.thisWeek} → ${every.score}`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-[color:color-mix(in_srgb,var(--color-paper)_35%,transparent)]" style={{ width: pct(every.score) }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-brass" style={{ width: pct(plan.thisWeek) }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-[color:color-mix(in_srgb,var(--color-brass)_60%,black)]" style={{ width: pct(plan.today) }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[12.5px] text-[color:color-mix(in_srgb,var(--color-paper)_75%,transparent)]">
        <span>{t(locale, "dashboard.fixPlan.nowThisWeek", { now: plan.today, week: plan.thisWeek })}</span>
        <span>{lastScanAt ? t(locale, "dashboard.fixPlan.fromLastScan", { date: formatShortDate(lastScanAt, locale, timeZone) }) : t(locale, "dashboard.fixPlan.fromLastScanNoDate")}</span>
      </div>
    </section>
  );
}

/** The other website checks, as one row to the Website page. */
function WebsiteRow({ row, step, businessId }: { row: Extract<FixPlanRow, { kind: "website" }>; step: number; businessId: string }) {
  const locale = useLocale();
  return (
    <li id="fix-website" className="scroll-mt-20 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5" data-testid="fix-plan-website">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-serif text-[14px] font-semibold text-ink ps-icon-tile">
          {step}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <IconWorld size={15} className="text-ink-soft" aria-hidden />
              <h3 className="text-[14.5px] font-semibold text-ink">{rowTitle(row, locale)}</h3>
              <FixPriorityTag priority={row.priority} />
              <FixWhenTag when={row.when} />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="inline-flex whitespace-nowrap rounded-full border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)] px-2.5 py-0.5 text-[12px] font-semibold text-ink">{t(locale, "dashboard.fixPlan.pts", { points: round1(row.points) })}</span>
              <span className="whitespace-nowrap text-[13px] text-ink-soft">
                {t(locale, "dashboard.fixPlan.scoreArrow", { score: "" }).trim()} <b className="font-serif text-[18px] text-ink">{row.running}</b>
              </span>
            </div>
          </div>
          <p className="text-[13px] text-ink-soft">{tPlural(locale, "dashboard.growth.websiteBanner.improve", row.banner.improvements, { earned: row.banner.earned, of: row.banner.of, points: Math.max(1, Math.round(row.points)) })}</p>
          <div className="border-t border-paper-line pt-3">
            <Link href={`/business/${businessId}/website`} data-testid="fix-button" data-kind="steps" className={FIX_BUTTON_CLASS}>
              {t(locale, "dashboard.fixPlan.fixIt")} →
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}

export function FixPlanView({
  businessId,
  plan,
  every,
  free,
  premium,
  lastScanAt,
  weekStart,
  completed,
  gbpConnected,
  websiteRecheck = null,
  detailsMismatch = null,
  hoursCheck = null,
  reviewGoalLines = [],
}: {
  businessId: string;
  plan: FixPlan;
  /** The Overview's projection: every fix done. */
  every: { score: number; grade: string };
  free: boolean;
  premium: boolean;
  lastScanAt: string | null;
  weekStart: string;
  completed: CompletedTask[];
  gbpConnected: boolean;
  websiteRecheck?: WebsiteRecheckProps | null;
  detailsMismatch?: DetailsMismatchState | null;
  hoursCheck?: HoursCheckState | null;
  reviewGoalLines?: string[];
}) {
  const locale = useLocale();
  const mismatches = detailsMismatch?.mismatches ?? [];
  const tasks = plan.rows.flatMap((r) => (r.kind === "task" ? [r.task] : []));
  const covered = new Set(tasks.flatMap((task) => mismatchesCoveredBy(task, mismatches).map((m) => m.field)));
  const standalone = mismatches.filter((m) => !covered.has(m.field));
  const weekTasks: ActionPlanTask[] = plan.rows.flatMap((r) => (r.kind === "task" && r.when === "this_week" ? [r.task] : []));
  return (
    <ReviewGoalLinesContext.Provider value={reviewGoalLines}>
      <div className="flex flex-col gap-6 nav:gap-8" data-testid="fix-plan">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[30px]">{t(locale, "dashboard.fixPlan.title")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t(locale, "dashboard.fixPlan.subtitle")}</p>
        </div>

        {!free && <WeeklyPlanCelebration businessId={businessId} weekStart={weekStart} today={plan.today} weeklyTasks={weekTasks} completed={completed} gbpConnected={gbpConnected} lastScanAt={lastScanAt} />}
        <TopCard plan={plan} every={every} lastScanAt={lastScanAt} />

        {standalone.length > 0 && <DetailsMismatchTasks businessId={businessId} mismatches={standalone} owner={detailsMismatch?.owner ?? null} />}

        <div id="weekly-plan" className="scroll-mt-20 flex flex-col gap-3">
          {plan.rows.length === 0 ? (
            <p className="rounded-2xl border border-paper-deep bg-white p-5 text-sm text-ink-soft">{t(locale, "dashboard.fixPlan.empty")}</p>
          ) : (
            <ol className="flex flex-col gap-3" data-testid="fix-plan-rows">
              {plan.rows.map((row, i) =>
                row.kind === "website" ? (
                  <WebsiteRow key={row.key} row={row} step={i + 1} businessId={businessId} />
                ) : (
                  <TaskCard
                    key={row.key}
                    task={mismatchesCoveredBy(row.task, mismatches).some((m) => URGENT_DETAILS.includes(m.field)) ? { ...row.task, urgent: true } : row.task}
                    businessId={businessId}
                    context="weekly"
                    step={i + 1}
                    lastScanAt={lastScanAt}
                    websiteRecheck={websiteRecheck}
                    premium={premium}
                    merged={mismatchesCoveredBy(row.task, mismatches)}
                    hoursCheck={isHoursCheck(row.task) ? hoursCheck : null}
                    fixPlan={{ priority: row.priority, running: row.running, locked: free }}
                  />
                )
              )}
            </ol>
          )}
          {plan.speed && (
            <div className={cn("flex items-start gap-3 rounded-2xl border border-dashed border-paper-deep bg-white/60 p-4 sm:p-5")} data-testid="fix-plan-speed">
              <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-paper-deep text-[13px] text-ink-mute">–</span>
              <div className="min-w-0">
                <p className="text-[14.5px] font-semibold text-ink">{t(locale, "dashboard.fixPlan.speedTitle")}</p>
                <p className="mt-0.5 text-[13px] text-ink-soft">
                  {plan.speed.explanation} {t(locale, "dashboard.fixPlan.speedUpTo", { points: plan.speed.upTo })}
                </p>
              </div>
            </div>
          )}
          {/* Rows quote the Google listing (reviews, rating, hours…). */}
          <GoogleMapsAttribution className="mt-0 px-1">
            <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.fixPlan.footnote")}</p>
          </GoogleMapsAttribution>
        </div>

        {!free && <CompletedTasksCard completed={completed} />}
      </div>
    </ReviewGoalLinesContext.Provider>
  );
}
