"use client";

// Celebrates hitting this week's goal — only with REAL points: the first
// visit of the week records the real score and the plan's projected
// goal (this device), and the celebration plays only when a re-scan
// after that has raised the real score to the goal. "I did this" clicks
// never count. Once per business per week; "reduce motion" skips the
// confetti.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconTrophy, IconX } from "@tabler/icons-react";
import { celebrationKey, claimCelebration, confettiBurst, goalHit, parseWeekGoal, prefersReducedMotion, weekGoalKey } from "@/lib/celebrate";
import { readStorage, writeStorage } from "@/lib/signStudio/design";
import { t, useLocale } from "@/lib/i18n";

export function WeeklyGoalCelebration({
  businessId,
  weekStart,
  today,
  projected,
  lastScanAt,
  children,
}: {
  businessId: string;
  weekStart: string;
  /** The real score (from the latest scan). */
  today: number;
  /** This week's plan, projected. */
  projected: number;
  lastScanAt: string | null;
  children: ReactNode;
}) {
  const locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<{ start: number; now: number; diff: number } | null>(null);

  useEffect(() => {
    const now = Math.round(today);
    const goalKey = weekGoalKey(businessId, weekStart);
    const goal = parseWeekGoal(readStorage(goalKey));
    if (!goal) {
      const target = Math.round(projected);
      if (target > now) writeStorage(goalKey, JSON.stringify({ start: now, goal: target, setAt: new Date().toISOString() }));
      return;
    }
    const hit = goalHit(goal, now, lastScanAt);
    if (!hit || !claimCelebration(celebrationKey("goal", businessId, weekStart))) return;
    if (!prefersReducedMotion()) {
      const rect = ref.current?.getBoundingClientRect();
      if (rect) confettiBurst(rect);
    }
    setToast(hit);
    const timer = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(timer);
  }, [businessId, weekStart, today, projected, lastScanAt]);

  return (
    <>
      <div ref={ref}>{children}</div>
      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_45%,white)] bg-white px-4 py-3 shadow-card"
        >
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass text-white">
            <IconTrophy size={16} />
          </span>
          <p className="flex-1 text-[13.5px] font-semibold text-ink">{t(locale, "dashboard.growth.goalHit", { start: toast.start, now: toast.now, diff: toast.diff })}</p>
          <button type="button" onClick={() => setToast(null)} aria-label={t(locale, "dashboard.websiteReviews.studio.close")} className="rounded-lg p-1 text-ink-mute hover:bg-paper hover:text-ink">
            <IconX size={16} />
          </button>
        </div>
      )}
    </>
  );
}
