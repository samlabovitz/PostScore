"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconChevronDown, IconBrandGoogle, IconCircleCheck } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { markTaskDone } from "@/app/actions/actionPlan";
import type { ActionPlanTask, CompletedTask } from "@/lib/actionPlan";

function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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
  context: TaskCardContext
): { label: string; variant: "green" | "amber" | "neutral" } {
  if (task.effort === "quick_win") return { label: "Quick win", variant: "green" };
  if (task.effort === "quick_win_action") {
    return context === "weekly"
      ? { label: "This week's action", variant: "green" }
      : { label: "Ongoing outcome", variant: "neutral" };
  }
  // longer_term
  return context === "weekly"
    ? { label: "First step", variant: "amber" }
    : { label: "Longer-term", variant: "neutral" };
}

export function TaskCard({
  task,
  businessId,
  context = "later",
}: {
  task: ActionPlanTask;
  businessId: string;
  context?: TaskCardContext;
}) {
  const router = useRouter();
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
        message: result.status === "error" ? result.message : "Could not save that — try again.",
      });
    }
  }

  const isPending = task.status === "pending_verification";
  const badge = effortBadge(task, context);
  const pointsLabel =
    context === "weekly" && task.effort !== "quick_win"
      ? `~+${formatPoints(task.promisedPoints)} pts this week`
      : `Up to +${formatPoints(task.promisedPoints)} pts`;

  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">{task.label}</span>
            <Pill variant={badge.variant} className="!px-2 !py-0.5 text-[10px]">
              {badge.label}
            </Pill>
          </div>
          <p className="mt-0.5 text-[13px] text-ink-soft">{task.problem}</p>
          <p className="mt-1.5 text-[12px] text-ink-mute">{task.why}</p>
        </div>
        <Pill variant={isPending ? "neutral" : "brass"} className="shrink-0">
          {isPending ? "Pending" : pointsLabel}
        </Pill>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-fit items-center gap-1 text-[12px] font-medium text-brass hover:underline"
      >
        {expanded ? "Hide how to fix it" : "How to fix it"}
        <IconChevronDown size={13} className={cn("transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="rounded-lg bg-paper p-3 text-[13px] text-ink-soft">
          <div className="mb-1.5">
            <span className="font-medium text-ink">Do this: </span>
            {task.action}
          </div>
          <div>
            <span className="font-medium text-ink">How: </span>
            {task.fix}
          </div>
          {task.ownerActionOnGoogle && (
            <div className="mt-2.5 flex items-start gap-1.5 border-t border-paper-line pt-2.5 text-[12px] text-ink-mute">
              <IconBrandGoogle size={14} className="mt-0.5 shrink-0" />
              <span>
                This is a change you make yourself, on Google — PostScore can tell you exactly what
                to do, but we can&apos;t edit your listing for you.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        {isPending ? (
          <Pill variant="amber">
            Pending — we&apos;ll confirm this on your next scan
          </Pill>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={handleMarkDone}
            disabled={state.kind === "saving"}
          >
            {state.kind === "saving" ? "Saving..." : "I did this"}
          </Button>
        )}
        {state.kind === "error" && <span className="text-[12px] text-red">{state.message}</span>}
      </div>
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
}: {
  tasks: ActionPlanTask[];
  businessId: string;
  emptyMessage: string;
  footnote?: string;
  context?: TaskCardContext;
}) {
  if (tasks.length === 0) {
    return <Card className="p-5 text-sm text-ink-soft">{emptyMessage}</Card>;
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col divide-y divide-paper-line">
        {tasks.map((task) => (
          <TaskCard key={task.checkId} task={task} businessId={businessId} context={context} />
        ))}
      </div>
      {footnote && (
        <p className="mt-4 border-t border-paper-line pt-3 text-[12px] text-ink-mute">{footnote}</p>
      )}
    </Card>
  );
}

export function CompletedTasksCard({ completed }: { completed: CompletedTask[] }) {
  if (completed.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        Confirmed wins
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
              +{formatPoints(task.pointsGained)} pts confirmed
            </Pill>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ActionPlanSection({
  businessId,
  tasks,
  completed,
  error,
}: {
  businessId: string;
  tasks: ActionPlanTask[];
  completed: CompletedTask[];
  /** Set when the plan itself failed to load — kept distinct from a
   * genuinely empty plan so we never claim "nothing to do" when we
   * actually just couldn't check. */
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Card className="p-5 text-sm text-red">
          Couldn&apos;t load your action plan: {error}
        </Card>
      ) : (
        <TaskListCard
          tasks={tasks}
          businessId={businessId}
          emptyMessage="Every determinable check is already earning full points. Nothing to plan for right now."
          footnote={
            'Every estimate here is exactly what its check is currently missing — the same ' +
            "numbers behind the projected score above. They're real math, not a promise: points " +
            'only ever land after a re-scan actually finds the fix, never from clicking "I did ' +
            'this" alone.'
          }
        />
      )}

      <CompletedTasksCard completed={completed} />
    </div>
  );
}
