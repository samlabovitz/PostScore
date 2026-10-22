"use client";

import { useState, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconChevronDown, IconBrandGoogle, IconCircleCheck, IconPhoto, IconTag, IconTicket, IconTrendingUp, IconUsers, IconWorld } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LINK_PILL_CLASS } from "@/components/ui/linkPill";
import { taskFixLink } from "@/lib/overviewTiles";
import type { LinkOptions } from "@/lib/postaiLinks";
import { cn } from "@/lib/utils";
import { wholePointRange } from "@/lib/pointRange";
import { markTaskDone } from "@/app/actions/actionPlan";
import { WebsiteRecheck } from "@/components/scoring/WebsiteRecheck";
import {
  pendingCheckStatus,
  weeklyMetricProgress,
  type ActionPlanTask,
  type CompletedTask,
  type PendingCheckStatus,
  type WeeklyMetricProgress,
} from "@/lib/actionPlan";
import type { GrowthMove } from "@/lib/growthMoves";
import { GoogleMapsAttribution } from "@/components/google/GoogleMapsAttribution";
import { formatMonthDayTime, t, useLocale, useTimeZone, type Locale } from "@/lib/i18n";

/** What a website task needs for "Re-check my website". */
export interface WebsiteRecheckProps {
  left: number;
  hasWebsite: boolean;
}

/** Points are always shown as whole numbers ("about +2 pts", never "+1.5"). */
function wholePoints(value: number): number {
  return wholePointRange(value, null).low;
}

const STATUS_PILL: Record<"neutral" | "amber" | "green" | "red" | "brass", string> = {
  neutral: "border-paper-deep bg-paper text-ink-soft",
  amber: "border-[color:color-mix(in_srgb,var(--color-amber)_35%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_12%,white)] text-ink",
  green: "border-[color:color-mix(in_srgb,var(--color-green)_35%,white)] bg-[color:color-mix(in_srgb,var(--color-green)_10%,white)] text-green",
  red: "border-[color:color-mix(in_srgb,var(--color-red)_35%,white)] bg-[color:color-mix(in_srgb,var(--color-red)_10%,white)] text-red",
  brass: "border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_12%,white)] text-ink",
};

function StatusPill({ variant, children, className }: { variant: keyof typeof STATUS_PILL; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex w-fit items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold", STATUS_PILL[variant], className)}>{children}</span>;
}

type StatusVariant = "neutral" | "amber" | "green" | "red" | "brass";

/**
 * The ONE real status for a task, shown in exactly one place (the
 * card's top-right pill) — never restated or contradicted elsewhere on
 * the card. "open" tasks are simply "To do". When a real numeric weekly
 * target exists (metricProgress non-null — see weeklyMetricProgress in
 * lib/actionPlan.ts), the pill shows the real "X of Y" fraction for a
 * gradual check with actual progress; otherwise it falls back to the
 * points-based pendingCheckStatus() verdict (one-shot checks, or a
 * gradual check with no recorded numeric baseline yet). "Complete this
 * week" means real forward movement was detected on a re-scan — the
 * underlying check may still not be fully closed, so it's distinct from
 * a permanent Confirmed win.
 */
function taskStatus(
  task: ActionPlanTask,
  pendingStatus: PendingCheckStatus | null,
  metricProgress: WeeklyMetricProgress | null,
  locale: Locale
): { label: string; variant: StatusVariant } {
  if (task.status !== "pending_verification") {
    return { label: t(locale, "dashboard.overview.actionPlan.toDo"), variant: "neutral" };
  }

  if (metricProgress) {
    switch (metricProgress.kind) {
      case "complete":
        return { label: t(locale, "dashboard.overview.actionPlan.completeThisWeek"), variant: "green" };
      case "partial":
        return {
          label: t(locale, "dashboard.overview.actionPlan.inProgressFraction", {
            gained: metricProgress.gained,
            targetDelta: metricProgress.targetDelta,
          }),
          variant: "brass",
        };
      case "not_quite_yet":
        return { label: t(locale, "dashboard.overview.actionPlan.notQuiteYet"), variant: "amber" };
      case "not_yet_checked":
      default:
        return { label: t(locale, "dashboard.overview.actionPlan.inProgress"), variant: "amber" };
    }
  }

  switch (pendingStatus) {
    case "progressed":
      return { label: t(locale, "dashboard.overview.actionPlan.completeThisWeek"), variant: "green" };
    case "regressed":
      return { label: t(locale, "dashboard.overview.actionPlan.checkedWorse"), variant: "red" };
    case "unchanged":
      return { label: t(locale, "dashboard.overview.actionPlan.checkedNoChange"), variant: "amber" };
    case "not_yet_checked":
    default:
      return { label: t(locale, "dashboard.overview.actionPlan.inProgress"), variant: "amber" };
  }
}

/**
 * The card's one "where things stand" block, shown exactly once — never
 * restates the status word above (that's the pill's job). When a real
 * numeric weekly target exists (metricProgress), this shows the actual
 * re-scanned number against the real target ("Progress: 1 of 3 new
 * reviews — 15 so far, 2 to go"), replacing the generic check
 * explanation with a more specific, motivating real number. Otherwise it
 * falls back to the check's own live explanation (`task.problem`) plus a
 * short honest note from pendingCheckStatus() — one-shot checks, or a
 * gradual check with no recorded numeric baseline yet. Never frames real
 * progress as points already earned: score points only ever confirm
 * from reconcileTasks() after a re-scan, never from this note or a
 * click.
 */
function CurrentStatus({
  task,
  pendingStatus,
  metricProgress,
  lastScanAt,
}: {
  task: ActionPlanTask;
  pendingStatus: PendingCheckStatus | null;
  metricProgress: WeeklyMetricProgress | null;
  lastScanAt: string | null;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const checkedLabel = lastScanAt
    ? t(locale, "dashboard.overview.actionPlan.checkedWithDate", { date: formatMonthDayTime(lastScanAt, locale, timeZone) })
    : t(locale, "dashboard.overview.actionPlan.checkedNoDate");

  // Nothing to compare yet, either way — the honest wait, plus the real
  // current value for context.
  if (pendingStatus === "not_yet_checked" || metricProgress?.kind === "not_yet_checked") {
    return (
      <div className="rounded-lg bg-paper px-3 py-2.5">
        <ProblemText task={task} />
        <p className="mt-1 text-[12px] text-ink-mute">
          {t(locale, "dashboard.overview.actionPlan.willCheckNextRescan")}
        </p>
      </div>
    );
  }

  if (metricProgress) {
    const { kind, current, baseline, targetDelta, gained } = metricProgress;
    let line: string;
    if (kind === "complete") {
      line = `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.doneThisWeek", { current })}`;
    } else if (kind === "partial") {
      const remaining = Math.max(0, targetDelta - gained);
      line = `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.progressText", {
        gained,
        targetDelta,
        current,
        remaining,
      })}`;
    } else {
      // not_quite_yet
      line =
        current < baseline
          ? `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.downTo", { current, baseline })}`
          : `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.stillAt", { current })}`;
    }
    return (
      <div className="rounded-lg bg-paper px-3 py-2.5">
        <p className={cn("text-[12.5px]", kind === "complete" ? "font-medium text-green" : "text-ink-soft")}>
          {line}
        </p>
      </div>
    );
  }

  // Fallback: points-based, for one-shot checks or a gradual check with
  // no recorded numeric baseline yet.
  const gradual = task.effort === "quick_win_action";
  let note: string | null = null;
  if (pendingStatus === "regressed") {
    note = `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.movedWrongWay")}`;
  } else if (pendingStatus === "progressed") {
    note = `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.realProgress")}`;
  } else if (pendingStatus === "unchanged") {
    note = gradual
      ? `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.noRealChangeYet")}`
      : `${checkedLabel} ${t(locale, "dashboard.overview.actionPlan.googleStillDoesntShow")}`;
  }

  return (
    <div className="rounded-lg bg-paper px-3 py-2.5">
      <ProblemText task={task} />
      {note && <p className="mt-1 text-[12px] text-ink-mute">{note}</p>}
    </div>
  );
}

/** The review goal in words (lib/reviewGoal.ts), for the review task —
 * provided by the Growth page; empty elsewhere. */
export const ReviewGoalLinesContext = createContext<string[]>([]);

const isReviewTask = (task: ActionPlanTask) => task.checkId === "reviews.merged" || task.checkId === "visibility.review_count";

/** The check's own explanation — one line per check on the merged reviews
 * card (review count and rating each have their own "full credit at …") —
 * and, on the review task, the goal: beat the leader (shared wording). */
function ProblemText({ task }: { task: ActionPlanTask }) {
  const goalLines = useContext(ReviewGoalLinesContext);
  const lines = task.problemLines && task.problemLines.length > 0 ? task.problemLines : [task.problem];
  return (
    <>
      {lines.map((line) => (
        <p key={line} className="text-[12.5px] text-ink-soft">
          {line}
        </p>
      ))}
      {isReviewTask(task) &&
        goalLines.slice(1).map((line) => (
          <p key={line} className="text-[12.5px] font-semibold text-ink" data-testid="task-review-goal">
            {line}
          </p>
        ))}
    </>
  );
}

type MarkState = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string };

/** Which list a task card is rendered in — the SAME task (same checkId,
 * same effort) can legitimately appear in both "This week's plan" and
 * "Bigger projects" (see buildWeeklyPlan's duplication for
 * quick_win_action checks), so the badge/points framing is chosen by
 * context, not derived purely from the task's own effort field. */
export type TaskCardContext = "weekly" | "later";

function effortBadge(task: ActionPlanTask, context: TaskCardContext, locale: Locale): string {
  if (task.effort === "quick_win") return t(locale, "dashboard.overview.actionPlan.quickWin");
  if (task.effort === "quick_win_action") {
    return context === "weekly" ? t(locale, "dashboard.overview.actionPlan.thisWeeksAction") : t(locale, "dashboard.overview.actionPlan.ongoingOutcome");
  }
  return context === "weekly" ? t(locale, "dashboard.overview.actionPlan.firstStep") : t(locale, "dashboard.overview.actionPlan.longerTerm");
}

/** The small brass points chip — whole numbers only. Exported for tests. */
export function taskPointsLabel(task: ActionPlanTask, context: TaskCardContext, locale: Locale): string {
  // The real weighted contribution to the 0-100 total (see
  // ActionPlanTask.weightedPoints) — what makes a weekly card's points
  // add up to "within reach".
  const range = task.weightedPointsHigh !== null ? wholePointRange(task.weightedPoints, task.weightedPointsHigh) : null;
  if (range !== null) {
    return range.high !== null
      ? t(locale, "dashboard.overview.actionPlan.pointsRangeOnceLive", { low: range.low, high: range.high })
      : t(locale, "dashboard.overview.actionPlan.pointsOnceLive", { points: range.low });
  }
  return context === "weekly" && task.effort !== "quick_win"
    ? t(locale, "dashboard.overview.actionPlan.pointsThisWeek", { points: wholePoints(task.weightedPoints) })
    : t(locale, "dashboard.overview.actionPlan.pointsUpTo", { points: wholePoints(task.weightedPoints) });
}

const POINTS_CHIP =
  "inline-flex w-fit items-center whitespace-nowrap rounded-full border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)] px-2.5 py-0.5 text-[12px] font-semibold text-ink";

export function TaskCard({
  task,
  businessId,
  context = "later",
  lastScanAt = null,
  step = null,
  linkOptions = {},
  websiteRecheck = null,
}: {
  task: ActionPlanTask;
  businessId: string;
  context?: TaskCardContext;
  /** When the business's most recent scan ran — see getLastScanAt(). */
  lastScanAt?: string | null;
  /** 1, 2, 3… in "This week's plan". */
  step?: number | null;
  /** Which tools this business has — for the fix link (same as PostAI's). */
  linkOptions?: LinkOptions;
  /** Website re-checks left today — website fixes get "Re-check my website". */
  websiteRecheck?: WebsiteRecheckProps | null;
}) {
  const router = useRouter();
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<MarkState>({ kind: "idle" });

  async function handleMarkDone() {
    setState({ kind: "saving" });
    // The merged reviews card stands in for 2-3 real checks (see
    // mergeReviewTasks in lib/actionPlan.ts) — "I did this" marks every
    // one of their real underlying tasks rows, never the synthetic
    // checkId itself (which names no real task row).
    const checkIds = task.mergedCheckIds ?? [task.checkId];
    const results = await Promise.all(checkIds.map((checkId) => markTaskDone(businessId, checkId)));
    const failed = results.find((r) => r.status !== "ok");
    if (!failed) {
      router.refresh();
    } else {
      setState({
        kind: "error",
        message: failed.status === "error" ? failed.message : t(locale, "dashboard.overview.actionPlan.couldNotSave"),
      });
    }
  }

  const isPending = task.status === "pending_verification";
  const pendingStatus = isPending ? pendingCheckStatus(task, lastScanAt) : null;
  const metricProgress = isPending ? weeklyMetricProgress(task, lastScanAt) : null;
  // Once a re-scan has actually looked at this task (whichever way it
  // went), hand it back to the owner as a fresh weekly ask.
  const checkedAlready = metricProgress ? metricProgress.kind !== "not_yet_checked" : pendingStatus !== null && pendingStatus !== "not_yet_checked";
  const canMarkAgain = isPending && checkedAlready;
  const status = taskStatus(task, pendingStatus, metricProgress, locale);
  // The obtainable ask, front and center — a weekly target for a
  // gradual check, or the one-shot action itself when there isn't one.
  const headline = task.weeklyTarget ?? task.action;
  // Where this is fixed — the same link PostAI and the Overview use. None
  // when that's this Growth page itself.
  const fix = task.effort === "setup" ? null : taskFixLink(task.checkId, businessId, linkOptions);
  const fixLink = fix && !fix.href.startsWith(`/business/${businessId}/growth`) ? fix : null;

  return (
    <li id={`task-${task.checkId.replace(/\./g, "-")}`} className="scroll-mt-20 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-3">
        {step !== null && (
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-serif text-[14px] font-semibold text-ink ps-icon-tile">
            {step}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-[14.5px] font-semibold text-ink">{task.label}</h3>
              <span className="text-[11.5px] text-ink-mute">{effortBadge(task, context, locale)}</span>
            </div>
            <StatusPill variant={status.variant} className="shrink-0">
              {status.label}
            </StatusPill>
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <p className="text-[13.5px] font-medium text-ink">{headline}</p>
            <span className={POINTS_CHIP}>{taskPointsLabel(task, context, locale)}</span>
          </div>

          <p className="text-[12.5px] leading-snug text-ink-soft">{task.why}</p>

          {task.mergedLabels && task.mergedLabels.length > 0 && (
            <p className="text-[12px] text-ink-mute">
              <span className="font-medium text-ink-soft">{t(locale, "dashboard.overview.actionPlan.mergedReviewsHelpsLabel")}</span>{" "}
              {task.mergedLabels.join(", ")}
            </p>
          )}

          {task.timingNote && <p className="text-[12px] italic text-ink-mute">{task.timingNote}</p>}

          <CurrentStatus task={task} pendingStatus={pendingStatus} metricProgress={metricProgress} lastScanAt={lastScanAt} />

          <div>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink hover:text-brass"
            >
              {expanded ? t(locale, "dashboard.overview.actionPlan.hideHowToFix") : t(locale, "dashboard.overview.actionPlan.howToFixIt")}
              <IconChevronDown size={14} className={cn("transition-transform", expanded && "rotate-180")} aria-hidden />
            </button>
            {expanded && (
              <div className="mt-2 rounded-xl border border-paper-line bg-paper p-3.5 text-[13px] leading-relaxed text-ink-soft">
                <p className="mb-1.5">
                  <span className="font-semibold text-ink">{t(locale, "dashboard.overview.actionPlan.doThisLabel")}</span>
                  {task.action}
                </p>
                <p>
                  <span className="font-semibold text-ink">{t(locale, "dashboard.overview.actionPlan.howLabel")}</span>
                  {task.fix}
                </p>
                {task.ownerActionOnGoogle && (
                  <p className="mt-2.5 flex items-start gap-1.5 border-t border-paper-line pt-2.5 text-[12px] text-ink-mute">
                    <IconBrandGoogle size={14} className="mt-0.5 shrink-0" aria-hidden />
                    <span>
                      {t(locale, "dashboard.overview.actionPlan.ownerActionOnGoogle")}{" "}
                      <span data-testid="after-google-change" className="font-medium text-ink-soft">{t(locale, "dashboard.rescan.afterGoogleChange")}</span>
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {(fixLink || !isPending || canMarkAgain) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-paper-line pt-3">
              {fixLink && (
                <Link href={fixLink.href} className={LINK_PILL_CLASS}>
                  {fixLink.label ? t(locale, fixLink.label) : t(locale, "dashboard.overview.recs.seeCheck")}
                </Link>
              )}
              {(!isPending || canMarkAgain) && (
                <Button variant="default" size="sm" onClick={handleMarkDone} disabled={state.kind === "saving"}>
                  {state.kind === "saving"
                    ? t(locale, "dashboard.overview.actionPlan.saving")
                    : canMarkAgain
                      ? t(locale, "dashboard.overview.actionPlan.didThisAgain")
                      : t(locale, "dashboard.overview.actionPlan.didThis")}
                </Button>
              )}
              {state.kind === "error" && <span className="text-[12px] text-red">{state.message}</span>}
            </div>
          )}
          {websiteRecheck && task.checkId.startsWith("website.") && task.checkId !== "website.has_website" && (
            <div className="border-t border-paper-line pt-3">
              <WebsiteRecheck businessId={businessId} initialLeft={websiteRecheck.left} hasWebsite={websiteRecheck.hasWebsite} compact />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

const MOVE_ICON: Record<GrowthMove["id"], typeof IconTicket> = {
  start_coupon: IconTicket,
  start_referral: IconUsers,
  run_price_check: IconTag,
  add_photos_vs_competitors: IconPhoto,
  build_starter_site: IconWorld,
  improve_website: IconWorld,
};

/**
 * A growth move's card — never a status pill, points, or a mark-done
 * button: a growth move never earns points on its own. The small neutral
 * pill is the one thing that must never be skipped — it keeps a growth
 * move from being mistaken for a scored task. `overlapsActionPlan` is real
 * live data (growthMoveOverlapsActionPlan): when this move's real check
 * is CURRENTLY an open task above, the pill says so instead of the
 * flatly-false "doesn't change your score".
 */
export function GrowthMoveCard({ move, overlapsActionPlan }: { move: GrowthMove; overlapsActionPlan: boolean }) {
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const Icon = MOVE_ICON[move.id] ?? IconTrendingUp;

  return (
    <li className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-paper-deep bg-white p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
          <Icon size={17} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-[14px] font-semibold text-ink">{move.title}</h3>
          <StatusPill variant="neutral" className="!text-[10.5px] !font-medium">
            {t(locale, overlapsActionPlan ? "dashboard.growth.moves.badgeAlsoScored" : "dashboard.growth.moves.badge")}
          </StatusPill>
        </div>
      </div>
      {move.meta && <p className="text-[11.5px] text-ink-mute">{move.meta}</p>}
      <p className="text-[12.5px] leading-snug text-ink-soft">{move.why}</p>
      <div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink hover:text-brass"
        >
          {expanded ? t(locale, "dashboard.overview.actionPlan.hideHowToFix") : t(locale, "dashboard.overview.actionPlan.howToFixIt")}
          <IconChevronDown size={14} className={cn("transition-transform", expanded && "rotate-180")} aria-hidden />
        </button>
        {expanded && <p className="mt-2 rounded-xl border border-paper-line bg-paper p-3.5 text-[13px] leading-relaxed text-ink-soft">{move.howTo}</p>}
      </div>
      <Link href={move.href} className={cn(LINK_PILL_CLASS, "mt-auto")}>
        {t(locale, "dashboard.growth.moves.goLabel")} →
      </Link>
    </li>
  );
}

/** Tasks as separate cards (numbered in "This week's plan"), or an honest
 * empty-state message — the caller supplies it so "nothing left this
 * week" can read differently from "nothing longer-term either". */
export function TaskListCard({
  tasks,
  businessId,
  emptyMessage,
  footnote,
  context = "later",
  lastScanAt = null,
  linkOptions = {},
  websiteRecheck = null,
}: {
  tasks: ActionPlanTask[];
  businessId: string;
  emptyMessage: string;
  footnote?: string;
  context?: TaskCardContext;
  lastScanAt?: string | null;
  linkOptions?: LinkOptions;
  websiteRecheck?: WebsiteRecheckProps | null;
}) {
  if (tasks.length === 0) {
    return <Card className="p-5 text-sm text-ink-soft">{emptyMessage}</Card>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {tasks.map((task, i) => (
          <TaskCard
            key={task.checkId}
            task={task}
            businessId={businessId}
            context={context}
            lastScanAt={lastScanAt}
            step={context === "weekly" ? i + 1 : null}
            linkOptions={linkOptions}
            websiteRecheck={websiteRecheck}
          />
        ))}
      </ol>
      {/* Listing tasks quote the Google listing (reviews, rating, hours…):
          the logo shares the footnote's line. */}
      {tasks.some(showsListingData) ? (
        <GoogleMapsAttribution className="mt-0 px-1">{footnote && <p className="text-[12px] text-ink-mute">{footnote}</p>}</GoogleMapsAttribution>
      ) : (
        footnote && <p className="px-1 text-[12px] text-ink-mute">{footnote}</p>
      )}
    </div>
  );
}

/** A task about the Google listing (not the website), or the website task
 * that compares against Google's listing. */
function showsListingData(task: ActionPlanTask): boolean {
  return !task.checkId.startsWith("website.") || task.checkId.includes("google");
}

export function CompletedTasksCard({ completed }: { completed: CompletedTask[] }) {
  const locale = useLocale();
  if (completed.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        {t(locale, "dashboard.overview.actionPlan.confirmedWinsHeading")}
      </div>
      <div className="flex flex-col divide-y divide-paper-line">
        {completed.map((task) => (
          <div key={task.checkId} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <span className="flex items-center gap-2 text-sm text-ink">
              <IconCircleCheck size={16} className="shrink-0 text-green" aria-hidden />
              {task.label}
            </span>
            <StatusPill variant="green" className="shrink-0">
              {t(locale, "dashboard.overview.actionPlan.pointsConfirmed", { points: wholePoints(task.pointsGained) })}
            </StatusPill>
          </div>
        ))}
      </div>
    </Card>
  );
}
