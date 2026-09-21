"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconChevronDown, IconBrandGoogle, IconCircleCheck } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { markTaskDone } from "@/app/actions/actionPlan";
import {
  pendingCheckStatus,
  weeklyMetricProgress,
  type ActionPlanTask,
  type CompletedTask,
  type PendingCheckStatus,
  type WeeklyMetricProgress,
} from "@/lib/actionPlan";
import { t, useLocale, type Locale } from "@/lib/i18n";

function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatCheckedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const checkedLabel = lastScanAt
    ? t(locale, "dashboard.overview.actionPlan.checkedWithDate", { date: formatCheckedAt(lastScanAt) })
    : t(locale, "dashboard.overview.actionPlan.checkedNoDate");

  // Nothing to compare yet, either way — the honest wait, plus the real
  // current value for context.
  if (pendingStatus === "not_yet_checked" || metricProgress?.kind === "not_yet_checked") {
    return (
      <div className="rounded-lg bg-paper px-3 py-2.5">
        <p className="text-[12.5px] text-ink-soft">{task.problem}</p>
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
      <p className="text-[12.5px] text-ink-soft">{task.problem}</p>
      {note && <p className="mt-1 text-[12px] text-ink-mute">{note}</p>}
    </div>
  );
}

type MarkState = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string };

/** Which list a task card is rendered in — the SAME task (same checkId,
 * same effort) can legitimately appear in both "This week's plan" and
 * "Bigger projects" (see buildWeeklyPlan's duplication for
 * quick_win_action checks), so the badge/points framing is chosen by
 * context, not derived purely from the task's own effort field. */
export type TaskCardContext = "weekly" | "later";

function effortBadge(
  task: ActionPlanTask,
  context: TaskCardContext,
  locale: Locale
): { label: string; variant: "green" | "amber" | "neutral" } {
  if (task.effort === "quick_win") {
    return { label: t(locale, "dashboard.overview.actionPlan.quickWin"), variant: "green" };
  }
  if (task.effort === "quick_win_action") {
    return context === "weekly"
      ? { label: t(locale, "dashboard.overview.actionPlan.thisWeeksAction"), variant: "green" }
      : { label: t(locale, "dashboard.overview.actionPlan.ongoingOutcome"), variant: "neutral" };
  }
  // longer_term
  return context === "weekly"
    ? { label: t(locale, "dashboard.overview.actionPlan.firstStep"), variant: "amber" }
    : { label: t(locale, "dashboard.overview.actionPlan.longerTerm"), variant: "neutral" };
}

export function TaskCard({
  task,
  businessId,
  context = "later",
  lastScanAt = null,
}: {
  task: ActionPlanTask;
  businessId: string;
  context?: TaskCardContext;
  /** When the business's most recent scan ran — see getLastScanAt() in
   * app/actions/scoring.ts. Optional/defaults null so the (unused)
   * ActionPlanSection wrapper below doesn't need updating; every real
   * call site (GrowthView) always passes the true value. */
  lastScanAt?: string | null;
}) {
  const router = useRouter();
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<MarkState>({ kind: "idle" });

  async function handleMarkDone() {
    setState({ kind: "saving" });
    const result = await markTaskDone(businessId, task.checkId);
    if (result.status === "ok") {
      router.refresh();
    } else {
      setState({
        kind: "error",
        message:
          result.status === "error" ? result.message : t(locale, "dashboard.overview.actionPlan.couldNotSave"),
      });
    }
  }

  const isPending = task.status === "pending_verification";
  const pendingStatus = isPending ? pendingCheckStatus(task, lastScanAt) : null;
  const metricProgress = isPending ? weeklyMetricProgress(task, lastScanAt) : null;
  // Once a re-scan has actually looked at this task (whichever way it
  // went), hand it back to the owner as a fresh weekly ask rather than
  // leaving it stuck — see the button below. Prefers the real numeric
  // verdict when one exists, same as the pill/status text below.
  const checkedAlready = metricProgress
    ? metricProgress.kind !== "not_yet_checked"
    : pendingStatus !== null && pendingStatus !== "not_yet_checked";
  const canMarkAgain = isPending && checkedAlready;
  const badge = effortBadge(task, context, locale);
  const status = taskStatus(task, pendingStatus, metricProgress, locale);
  const pointsLabel =
    context === "weekly" && task.effort !== "quick_win"
      ? t(locale, "dashboard.overview.actionPlan.pointsThisWeek", { points: formatPoints(task.promisedPoints) })
      : t(locale, "dashboard.overview.actionPlan.pointsUpTo", { points: formatPoints(task.promisedPoints) });
  // The obtainable ask, front and center — a weekly target for a
  // gradual check, or the one-shot action itself when there isn't one.
  const headline = task.weeklyTarget ?? task.action;

  return (
    <div className="flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">{task.label}</span>
          <Pill variant={badge.variant} className="!px-2 !py-0.5 text-[10px]">
            {badge.label}
          </Pill>
        </div>
        <Pill variant={status.variant} className="shrink-0">
          {status.label}
        </Pill>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-[13.5px] font-medium text-brass">{headline}</p>
        <Pill variant="neutral" className="!px-2 !py-0.5 text-[10.5px]">
          {pointsLabel}
        </Pill>
      </div>

      <p className="text-[12px] text-ink-mute">{task.why}</p>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-fit items-center gap-1 text-[12px] font-medium text-brass hover:underline"
      >
        {expanded
          ? t(locale, "dashboard.overview.actionPlan.hideHowToFix")
          : t(locale, "dashboard.overview.actionPlan.howToFixIt")}
        <IconChevronDown size={13} className={cn("transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="rounded-lg bg-paper p-3 text-[13px] text-ink-soft">
          <div className="mb-1.5">
            <span className="font-medium text-ink">{t(locale, "dashboard.overview.actionPlan.doThisLabel")}</span>
            {task.action}
          </div>
          <div>
            <span className="font-medium text-ink">{t(locale, "dashboard.overview.actionPlan.howLabel")}</span>
            {task.fix}
          </div>
          {task.ownerActionOnGoogle && (
            <div className="mt-2.5 flex items-start gap-1.5 border-t border-paper-line pt-2.5 text-[12px] text-ink-mute">
              <IconBrandGoogle size={14} className="mt-0.5 shrink-0" />
              <span>{t(locale, "dashboard.overview.actionPlan.ownerActionOnGoogle")}</span>
            </div>
          )}
        </div>
      )}

      <CurrentStatus
        task={task}
        pendingStatus={pendingStatus}
        metricProgress={metricProgress}
        lastScanAt={lastScanAt}
      />

      {(!isPending || canMarkAgain) && (
        <div className="flex items-center gap-3">
          <Button
            variant="default"
            size="sm"
            onClick={handleMarkDone}
            disabled={state.kind === "saving"}
          >
            {state.kind === "saving"
              ? t(locale, "dashboard.overview.actionPlan.saving")
              : canMarkAgain
                ? t(locale, "dashboard.overview.actionPlan.didThisAgain")
                : t(locale, "dashboard.overview.actionPlan.didThis")}
          </Button>
          {state.kind === "error" && <span className="text-[12px] text-red">{state.message}</span>}
        </div>
      )}
    </div>
  );
}

/** A card listing a set of tasks, or an honest empty-state message when
 * the set is empty — the caller supplies the message so a "nothing left
 * this week" state can read differently from a "nothing longer-term
 * either" state. */
export function TaskListCard({
  tasks,
  businessId,
  emptyMessage,
  footnote,
  context = "later",
  lastScanAt = null,
}: {
  tasks: ActionPlanTask[];
  businessId: string;
  emptyMessage: string;
  footnote?: string;
  context?: TaskCardContext;
  lastScanAt?: string | null;
}) {
  if (tasks.length === 0) {
    return <Card className="p-5 text-sm text-ink-soft">{emptyMessage}</Card>;
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col divide-y divide-paper-line">
        {tasks.map((task) => (
          <TaskCard
            key={task.checkId}
            task={task}
            businessId={businessId}
            context={context}
            lastScanAt={lastScanAt}
          />
        ))}
      </div>
      {footnote && (
        <p className="mt-4 border-t border-paper-line pt-3 text-[12px] text-ink-mute">{footnote}</p>
      )}
    </Card>
  );
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
          <div
            key={task.checkId}
            className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
          >
            <span className="flex items-center gap-2 text-sm text-ink">
              <IconCircleCheck size={16} className="shrink-0 text-green" />
              {task.label}
            </span>
            <Pill variant="green" className="shrink-0">
              {t(locale, "dashboard.overview.actionPlan.pointsConfirmed", {
                points: formatPoints(task.pointsGained),
              })}
            </Pill>
          </div>
        ))}
      </div>
    </Card>
  );
}

