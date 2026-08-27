"use client";

import { useState } from "react";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import { TaskListCard, CompletedTasksCard } from "../ActionPlanSection";
import type { ActionPlanTask, CompletedTask } from "@/lib/actionPlan";
import type { ScoreBreakdown } from "@/lib/scoring";

type Segment = "plan" | "coupons" | "referral";

/** Honest grade-change copy: only claims a letter change when the real
 * projected grade actually differs from today's — otherwise it says so
 * plainly rather than implying movement that isn't there. */
function gradeTransitionLabel(from: string, to: string): string {
  return from === to ? `Stays a ${to}` : `${from} → ${to}`;
}

function ComingTogether({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-8 text-center">
      <div className="text-sm font-semibold text-ink">{title}</div>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] text-ink-soft">{body}</p>
    </Card>
  );
}

export function GrowthView({
  businessId,
  businessName,
  referralOk,
  breakdown,
  actionPlan,
}: {
  businessId: string;
  businessName: string | null;
  referralOk: boolean;
  breakdown: ScoreBreakdown;
  actionPlan: {
    tasks: ActionPlanTask[];
    completed: CompletedTask[];
    weeklyTasks: ActionPlanTask[];
    laterTasks: ActionPlanTask[];
    weeklyProjectedBreakdown: ScoreBreakdown;
    error?: string;
  };
}) {
  const [segment, setSegment] = useState<Segment>("plan");

  const { weeklyProjectedBreakdown } = actionPlan;
  const pointsWithinReach = weeklyProjectedBreakdown.total - breakdown.total;

  const options: SegmentedControlOption<Segment>[] = [
    { value: "plan", label: "Action plan" },
    { value: "coupons", label: "Coupons" },
  ];
  if (referralOk) {
    options.push({ value: "referral", label: "Refer a friend" });
  }

  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div>
        <Link
          href={`/business/${businessId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={15} />
          Back to {businessName ?? "business"}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">Growth</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Raise your score and bring more customers through the door — everything you can act on,
          in one place.
        </p>
      </div>

      <SegmentedControl options={options} value={segment} onChange={setSegment} />

      {segment === "plan" && (
        <div className="flex flex-col gap-6 nav:gap-8">
          <Card className="p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
              If you finish this week&apos;s plan
            </div>
            <div className="mt-3 grid grid-cols-2 gap-6 sm:grid-cols-4">
              <StatTile label="Score today" value={breakdown.total} />
              <StatTile label="Projected after plan" value={weeklyProjectedBreakdown.total} />
              <StatTile
                label="Points within reach"
                value={pointsWithinReach > 0 ? `+${pointsWithinReach}` : "0"}
              />
              <StatTile
                label="Grade"
                value={gradeTransitionLabel(breakdown.grade, weeklyProjectedBreakdown.grade)}
              />
            </div>
            <p className="mt-4 border-t border-paper-line pt-3 text-[12px] text-ink-mute">
              {actionPlan.weeklyTasks.length > 0
                ? `Based on just the ${actionPlan.weeklyTasks.length} task${
                    actionPlan.weeklyTasks.length === 1 ? "" : "s"
                  } below — a realistic week, not every gap at once. See "Bigger projects" for the longer game.`
                : 'Nothing realistic to move this week, so this matches your current score. See "Bigger projects" for the longer game.'}
            </p>
          </Card>

          {actionPlan.error ? (
            <Card className="p-5 text-sm text-red">
              Couldn&apos;t load your action plan: {actionPlan.error}
            </Card>
          ) : (
            <>
              <SectionHeading title={`This week's plan (${actionPlan.weeklyTasks.length})`} />
              <TaskListCard
                tasks={actionPlan.weeklyTasks}
                businessId={businessId}
                context="weekly"
                emptyMessage="You're caught up — no real gaps determinable right now. Nice work."
                footnote={
                  'Every estimate here is exactly what its check is currently missing — the same ' +
                  'numbers behind the projected score above. Points only ever land after a ' +
                  're-scan actually finds the fix, never from clicking "I did this" alone.'
                }
              />

              <SectionHeading title={`Bigger projects (${actionPlan.laterTasks.length})`} />
              <TaskListCard
                tasks={actionPlan.laterTasks}
                businessId={businessId}
                emptyMessage="Nothing longer-term right now — everything determinable is either in this week's plan or already done."
              />
            </>
          )}

          <CompletedTasksCard completed={actionPlan.completed} />
        </div>
      )}

      {segment === "coupons" && (
        <ComingTogether
          title="Coupons are coming together"
          body="Soon you'll be able to create and send coupon offers to your customers right from here."
        />
      )}

      {segment === "referral" && referralOk && (
        <ComingTogether
          title="Refer a friend is coming together"
          body="Soon you'll be able to set up a referral reward so happy customers can send new ones your way."
        />
      )}
    </div>
  );
}
