"use client";

// Celebrates finishing EVERY step of this week's plan — only when a real
// re-check confirmed each one (a re-scan marked it completed, or Google is
// actually connected); "I did this" clicks never count. The first visit
// of the week records the plan's steps and the real score (this device);
// the message uses only the real score change. Once per week's plan;
// "reduce motion" skips the confetti. Rendered before
// WeeklyGoalCelebration and claims its slot too, so only one toast plays.

import { useEffect, useRef, useState } from "react";
import { IconTrophy, IconX } from "@tabler/icons-react";
import { celebrationKey, claimCelebration, confettiBurst, parseWeekPlan, planStepIds, prefersReducedMotion, weekPlanDone, weekPlanKey } from "@/lib/celebrate";
import { readStorage, writeStorage } from "@/lib/signStudio/design";
import type { ActionPlanTask, CompletedTask } from "@/lib/actionPlan";
import { t, useLocale, type Locale } from "@/lib/i18n";

/** The message, from the real score change only. */
export function planDoneMessage(diff: number, locale: Locale): string {
  if (diff <= 0) return t(locale, "dashboard.growth.planDone");
  return diff === 1 ? t(locale, "dashboard.growth.planDoneUpOne") : t(locale, "dashboard.growth.planDoneUp", { diff });
}

export function WeeklyPlanCelebration({
  businessId,
  weekStart,
  today,
  weeklyTasks,
  completed,
  gbpConnected,
  lastScanAt,
}: {
  businessId: string;
  weekStart: string;
  /** The real score (from the latest scan). */
  today: number;
  weeklyTasks: Array<Pick<ActionPlanTask, "checkId" | "mergedCheckIds">>;
  completed: Array<Pick<CompletedTask, "checkId" | "verifiedAt">>;
  gbpConnected: boolean;
  lastScanAt: string | null;
}) {
  const locale = useLocale();
  const ref = useRef<HTMLSpanElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const steps = planStepIds(weeklyTasks).join(",");

  useEffect(() => {
    const key = weekPlanKey(businessId, weekStart);
    const plan = parseWeekPlan(readStorage(key));
    if (!plan) {
      if (steps) writeStorage(key, JSON.stringify({ steps: steps.split(","), start: Math.round(today), setAt: new Date().toISOString() }));
      return;
    }
    const done = weekPlanDone(plan, { completed, gbpConnected, score: today, lastScanAt });
    if (!done || !claimCelebration(celebrationKey("plan", businessId, weekStart))) return;
    // One toast: the plan's message covers the score goal too.
    claimCelebration(celebrationKey("goal", businessId, weekStart));
    if (!prefersReducedMotion()) {
      const rect = ref.current?.parentElement?.getBoundingClientRect();
      if (rect) confettiBurst(rect);
    }
    setMessage(planDoneMessage(done.diff, locale));
    const timer = setTimeout(() => setMessage(null), 7000);
    return () => clearTimeout(timer);
    // `completed` changes identity each render; its content is in lastScanAt/today.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, weekStart, today, steps, gbpConnected, lastScanAt, locale]);

  return (
    <>
      <span ref={ref} aria-hidden className="hidden" />
      {message && (
        <div
          role="status"
          data-testid="plan-done"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_45%,white)] bg-white px-4 py-3 shadow-card"
        >
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass text-white">
            <IconTrophy size={16} />
          </span>
          <p className="flex-1 text-[13.5px] font-semibold text-ink">{message}</p>
          <button type="button" onClick={() => setMessage(null)} aria-label={t(locale, "dashboard.websiteReviews.studio.close")} className="rounded-lg p-1 text-ink-mute hover:bg-paper hover:text-ink">
            <IconX size={16} />
          </button>
        </div>
      )}
    </>
  );
}
