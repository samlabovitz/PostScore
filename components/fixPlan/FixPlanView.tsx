"use client";

// Day 25B step 3, v2 (docs/mockups/day25b/fix-plan-v2.html): Presence → Fix
// plan. A slim top card ("This week: 78 → 87" · "When every fix is done:
// 100 · A"), then the fixes under "This week" · "Takes a few weeks" · "Takes
// months", each with its subtotal, as compact rows: number, priority, title,
// a status dot, one short why, "+6 pts → 84" and the one button to where
// it's fixed (lib/fixDestination.ts; outline under "Takes months"). A row
// opens to its evidence, how to fix it and "I did this" / "Check again";
// only the first starts open. "Website speed: not scored yet" ends "Takes a
// few weeks". The rows are the Growth recap's own step cards in compact mode
// (#task-…, ?open=howto), so anchors and the step-by-step keep working.
// Plans: Free sees the whole ranked list with points (it's the audit) and
// the steps as a locked preview; Grow gets the steps, "I did this" and
// "Premium does this for you in one click →"; Premium's "Fix it" lands on
// the one-click action.

import Link from "next/link";
import { IconWorld } from "@tabler/icons-react";
import { TaskCard, CompletedTasksCard, FixPriorityTag, ReviewGoalLinesContext, type WebsiteRecheckProps } from "@/app/business/[id]/ActionPlanSection";
import { WeeklyPlanCelebration } from "@/app/business/[id]/growth/WeeklyPlanCelebration";
import { DetailsMismatchTasks } from "@/components/overview/DetailsMismatchTasks";
import { FIX_BUTTON_CLASS } from "@/components/scoring/FixButton";
import { GoogleMapsAttribution } from "@/components/google/GoogleMapsAttribution";
import type { ActionPlanTask, CompletedTask } from "@/lib/actionPlan";
import { groupFixPlan, type FixPlan, type FixPlanRow } from "@/lib/fixPlan";
import type { DetailsMismatchState } from "@/lib/detailsMismatch.server";
import { mismatchesCoveredBy, URGENT_DETAILS } from "@/lib/detailsMismatch";
import { isHoursCheck, type HoursCheckState } from "@/lib/hoursCheck";
import { formatShortDate, t, tPlural, useLocale, useTimeZone } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { displayPoints } from "@/lib/pointRange";

const ORDER = ["this_week", "weeks", "months"] as const;
// One decimal under 10, whole from 10 up (lib/pointRange.ts).
const round1 = (n: number) => String(displayPoints(n));

function rowTitle(row: FixPlanRow, locale: ReturnType<typeof useLocale>): string {
  return row.kind === "website" ? t(locale, "dashboard.fixPlan.websiteRow") : (row.task.title ?? row.task.label);
}

// One color per group, the same in the score card's track and on the group headings below.
const GROUP_COLOR: Record<(typeof ORDER)[number], string> = {
  this_week: "#d9a443",
  weeks: "#8fa6c4",
  months: "repeating-linear-gradient(135deg,#5d6f8c 0 5px,#4a5a75 5px 9px)",
};

/**
 * Option A (docs/mockups/day25b/fix-plan-scorecard.html, Sam's pick, zoomed): "78 → 87" big on top, then one
 * track from today's score to "100 · A", so the This week / few weeks / months segments fill the width.
 */
export function TopCard({ plan, every, lastScanAt }: { plan: FixPlan; every: { score: number; grade: string }; lastScanAt: string | null }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const from = plan.today;
  const span = Math.max(1, every.score - from);
  const at = (n: number) => `${(Math.max(0, Math.min(span, n - from)) / span) * 100}%`;
  let prev = from;
  const segments = groupFixPlan(plan).map((g, i, all) => {
    const to = i === all.length - 1 ? every.score : g.to;
    const seg = { when: g.when, left: at(prev), width: `calc(${at(to)} - ${at(prev)})` };
    prev = to;
    return seg;
  });
  const weekStop = !plan.thisWeekDone && plan.thisWeek > from && plan.thisWeek < every.score;
  const soft = "text-[color:color-mix(in_srgb,var(--color-paper)_72%,transparent)]";
  return (
    <section data-testid="fix-plan-top" className="rounded-2xl bg-ink px-4 pb-4 pt-4 text-paper shadow-card sm:px-6 sm:pt-5">
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
          <p className={cn("text-[13.5px]", soft)}>{tPlural(locale, "dashboard.fixPlan.thisWeekLabel", plan.thisWeekCount, { count: plan.thisWeekCount })}</p>
          <p className="mt-1 flex items-baseline gap-3 font-serif font-semibold leading-none" data-testid="fix-plan-this-week">
            <span className="text-[38px] tabular-nums sm:text-[44px]">{plan.today}</span>
            <span aria-hidden className="text-[28px] text-brass sm:text-[32px]">→</span>
            <span className="text-[38px] tabular-nums text-brass sm:text-[44px]">{plan.thisWeek}</span>
          </p>
        </>
      )}
      <div className="mt-5 flex items-center gap-3 sm:gap-4" data-testid="fix-plan-track-row">
        <div className="relative min-w-0 flex-1 pb-7">
          <div
            className="relative h-2.5 rounded-full bg-[color:color-mix(in_srgb,var(--color-paper)_12%,transparent)]"
            role="img"
            aria-label={t(locale, "dashboard.fixPlan.trackLabel", { now: from, week: plan.thisWeek, every: every.score })}
            data-testid="fix-plan-track"
          >
            {segments.map((seg, i) => (
              <div
                key={seg.when}
                data-segment={seg.when}
                className={cn("absolute inset-y-0", i === 0 && "rounded-l-full", i === segments.length - 1 && "rounded-r-full")}
                style={{ left: seg.left, width: seg.width, background: GROUP_COLOR[seg.when] }}
              />
            ))}
            <span aria-hidden className="absolute -top-[5px] left-0 h-5 w-0.5 rounded bg-paper" />
            {weekStop && <span aria-hidden className="absolute -top-[5px] h-5 w-0.5 -translate-x-px rounded bg-paper" style={{ left: at(plan.thisWeek) }} />}
          </div>
          <span className="absolute left-0 top-[18px] whitespace-nowrap text-[12px]" data-testid="fix-plan-now">
            <b className="font-serif text-[15px] text-white">{from}</b> <span className={soft}>{t(locale, "dashboard.fixPlan.trackNow")}</span>
          </span>
          {weekStop && (
            <span className="absolute top-[18px] translate-x-1.5 whitespace-nowrap text-[12px]" style={{ left: at(plan.thisWeek) }} data-testid="fix-plan-week">
              <b className="font-serif text-[15px] text-white">{plan.thisWeek}</b> <span className={cn("hidden sm:inline", soft)}>{t(locale, "dashboard.fixPlan.trackWeek")}</span>
            </span>
          )}
        </div>
        <p className="-mt-7 whitespace-nowrap font-serif text-[18px] font-semibold leading-none sm:text-[22px]" data-testid="fix-plan-every">
          {every.score} <span className="text-[15px] text-[color:color-mix(in_srgb,var(--color-paper)_80%,transparent)]">· {every.grade}</span>
          <span className={cn("mt-1 hidden font-sans text-[12px] font-medium sm:block", soft)}>{t(locale, "dashboard.fixPlan.trackEvery")}</span>
        </p>
      </div>
      <div className={cn("flex flex-wrap justify-between gap-x-4 gap-y-1 text-[12px]", soft)}>
        {plan.rows.some((r) => r.when === "months") && <span>{t(locale, "dashboard.overview.someFixesTakeMonths")}</span>}
        <span>{lastScanAt ? t(locale, "dashboard.fixPlan.fromLastScan", { date: formatShortDate(lastScanAt, locale, timeZone) }) : t(locale, "dashboard.fixPlan.fromLastScanNoDate")}</span>
      </div>
    </section>
  );
}

/** The other website checks, as one compact row to the Website page. */
function WebsiteRow({ row, step, businessId, outline }: { row: Extract<FixPlanRow, { kind: "website" }>; step: number; businessId: string; outline: boolean }) {
  const locale = useLocale();
  return (
    <li id="fix-website" className="scroll-mt-20 border-t border-paper-line first:border-t-0" data-testid="fix-plan-website">
      <div className="grid grid-cols-[26px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5 nav:grid-cols-[26px_112px_minmax(0,1fr)_auto]">
        <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full font-serif text-[12.5px] font-semibold text-ink ps-icon-tile">{step}</span>
        <span className="hidden nav:block"><FixPriorityTag priority={row.priority} /></span>
        <div className="col-start-2 min-w-0 nav:col-start-3">
          <span className="mb-1 flex nav:hidden"><FixPriorityTag priority={row.priority} /></span>
          <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink"><IconWorld size={15} className="text-ink-soft" aria-hidden />{rowTitle(row, locale)}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-mute">{tPlural(locale, "dashboard.growth.websiteBanner.improve", row.banner.improvements, { earned: row.banner.earned, of: row.banner.of, points: Math.max(1, Math.round(row.points)) })}</p>
        </div>
        <div className="col-start-2 flex items-center justify-between gap-3 nav:col-start-4 nav:justify-end">
          <span className="whitespace-nowrap text-[13px] font-semibold text-ink-soft">
            {t(locale, "dashboard.fixPlan.pts", { points: round1(row.points) })} → <b className="font-serif text-[16px] text-ink">{row.running}</b>
          </span>
          <Link href={`/business/${businessId}/website`} data-testid="fix-button" data-kind="steps" className={cn(FIX_BUTTON_CLASS, outline && "!border-paper-deep !bg-white !text-ink hover:!bg-paper")}>
            {t(locale, "dashboard.fixPlan.fixIt")} →
          </Link>
          <span className="w-4" aria-hidden />
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

        <div id="weekly-plan" className="scroll-mt-20 flex flex-col gap-6">
          {plan.rows.length === 0 ? (
            <p className="rounded-2xl border border-paper-deep bg-white p-5 text-sm text-ink-soft">{t(locale, "dashboard.fixPlan.empty")}</p>
          ) : (
            (() => {
              const groups = groupFixPlan(plan);
              // "Website speed: not scored yet" ends "Takes a few weeks" (its own group when there's none).
              const withSpeed = plan.speed && !groups.some((g) => g.when === "weeks") ? [...groups, { when: "weeks" as const, rows: [], points: 0, upTo: false, to: 0 }].sort((a, b) => ORDER.indexOf(a.when) - ORDER.indexOf(b.when)) : groups;
              let step = 0;
              return withSpeed.map((g) => (
                <section key={g.when} className="flex flex-col gap-2.5" data-testid={`fix-group-${g.when}`}>
                  <div className="flex items-baseline gap-3 px-0.5">
                    <span aria-hidden data-dot={g.when} className="h-2.5 w-2.5 shrink-0 self-center rounded-full" style={{ background: GROUP_COLOR[g.when] }} />
                    <h2 className="font-serif text-[18px] font-semibold text-ink">{t(locale, `dashboard.fixPlan.when.${g.when}` as Parameters<typeof t>[1])}</h2>
                    {g.rows.length > 0 && (
                      <span className="ml-auto whitespace-nowrap text-[13px] font-semibold text-ink-soft" data-testid="fix-group-subtotal">
                        {t(locale, g.upTo ? "dashboard.fixPlan.upToPts" : "dashboard.fixPlan.pts", { points: round1(g.points) })} → <b className="font-serif text-[16px] text-ink">{g.to}</b>
                      </span>
                    )}
                  </div>
                  <ol className="overflow-hidden rounded-2xl border border-paper-deep bg-white shadow-card" data-testid="fix-plan-rows">
                    {g.rows.map((row) => {
                      step++;
                      const outline = g.when === "months";
                      return row.kind === "website" ? (
                        <WebsiteRow key={row.key} row={row} step={step} businessId={businessId} outline={outline} />
                      ) : (
                        <TaskCard
                          key={row.key}
                          task={mismatchesCoveredBy(row.task, mismatches).some((m) => URGENT_DETAILS.includes(m.field)) ? { ...row.task, urgent: true } : row.task}
                          businessId={businessId}
                          context="weekly"
                          step={step}
                          lastScanAt={lastScanAt}
                          websiteRecheck={websiteRecheck}
                          premium={premium}
                          merged={mismatchesCoveredBy(row.task, mismatches)}
                          hoursCheck={isHoursCheck(row.task) ? hoursCheck : null}
                          fixPlan={{ priority: row.priority, running: row.running, locked: free, compact: { open: step === 1, outline } }}
                        />
                      );
                    })}
                    {g.when === "weeks" && plan.speed && (
                      <li className="grid grid-cols-[26px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-t border-dashed border-paper-deep bg-paper/60 px-4 py-3.5 first:border-t-0 sm:px-5 nav:grid-cols-[26px_112px_minmax(0,1fr)_auto]" data-testid="fix-plan-speed">
                        <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-paper-deep text-[12px] text-ink-mute">–</span>
                        <span className="hidden nav:block" />
                        <div className="col-start-2 min-w-0 nav:col-start-3">
                          <p className="text-[14px] font-medium text-ink-soft">{t(locale, "dashboard.fixPlan.speedTitle")}</p>
                          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-mute">{t(locale, "dashboard.fixPlan.speedShort")}</p>
                        </div>
                        <span className="col-start-2 whitespace-nowrap text-[13px] font-semibold text-ink-mute nav:col-start-4">{t(locale, "dashboard.fixPlan.speedUpTo", { points: plan.speed.upTo })}</span>
                      </li>
                    )}
                  </ol>
                </section>
              ));
            })()
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
