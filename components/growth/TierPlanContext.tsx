"use client";

// Day 25B step 6 (spec §2c): this week's plan, ranked by what each task does
// for the Growth tier — the order, one tier line per task with "Do this one
// first", and on Grow (or not connected) an "I did this" check per task. The
// one list is shared by Growth plan and Google results (ThisWeekList,
// GoogleResults' Grow list): both read this context; without it (today's
// pages) nothing changes.

import { createContext, useContext, useState, useTransition } from "react";
import { IconCheck } from "@tabler/icons-react";
import { setWeeklyCheckItem } from "@/app/actions/weeklyChecklist";
import type { Rec } from "@/lib/googleRecommendations";
import type { WeeklyChecklistItemId } from "@/lib/weeklyChecklist";
import { t, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface TierPlanValue {
  businessId: string;
  order: Rec["kind"][];
  /** The line under each task ("Goes out Mon, Nov 23, so next week counts → Growing on Mon, Nov 30"). */
  lines: Partial<Record<Rec["kind"], { text: string; first: boolean }>>;
  /** Grow / not connected: "I did this" per task (this week's checks). Null: Premium (Approve). */
  didThis: { checked: WeeklyChecklistItemId[] } | null;
}

export const TierPlanContext = createContext<TierPlanValue | null>(null);

/** A task's own check ("I did this"). */
export const CHECK_ID: Partial<Record<Rec["kind"], WeeklyChecklistItemId>> = { posts: "post_update", replies: "reply_reviews", photos: "add_photo", answers: "answer_questions" };

/** The list in the plan's order (tasks not in it keep their place after). */
export function useTierOrder<T extends { kind: Rec["kind"] }>(list: T[]): T[] {
  const ctx = useContext(TierPlanContext);
  if (!ctx) return list;
  const rank = (k: Rec["kind"]) => {
    const i = ctx.order.indexOf(k);
    return i === -1 ? ctx.order.length : i;
  };
  return [...list].sort((a, b) => rank(a.kind) - rank(b.kind));
}

/** The tier line under a task, with "Do this one first". */
export function TierLineNote({ kind }: { kind: Rec["kind"] }) {
  const locale = useLocale();
  const ctx = useContext(TierPlanContext);
  const line = ctx?.lines[kind];
  if (!line) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-medium text-ink" data-testid={`tier-line-${kind}`}>
      {line.first && (
        <span data-testid="do-first" className="rounded-full bg-[color:color-mix(in_srgb,var(--color-brass)_18%,white)] px-2 py-0.5 text-[11px] font-semibold text-ink">
          {t(locale, "dashboard.growthPlan.doFirst")}
        </span>
      )}
      <span className="text-green">{line.text}</span>
    </p>
  );
}

/** Grow / not connected: "I did this" for a task (a "You told us" check-off; 2 make a week count). */
export function DidThisButton({ kind }: { kind: Rec["kind"] }) {
  const locale = useLocale();
  const ctx = useContext(TierPlanContext);
  const id = CHECK_ID[kind];
  const [checked, setChecked] = useState(() => !!id && !!ctx?.didThis?.checked.includes(id));
  const [pending, start] = useTransition();
  if (!ctx?.didThis || !id) return null;
  return (
    <button
      type="button"
      aria-pressed={checked}
      disabled={pending}
      data-testid={`did-this-${kind}`}
      onClick={() =>
        start(async () => {
          const next = !checked;
          setChecked(next);
          const r = await setWeeklyCheckItem(ctx.businessId, id, next).catch(() => null);
          if (!r || r.status !== "ok") setChecked(!next);
        })
      }
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors",
        checked ? "border-green bg-[color:color-mix(in_srgb,var(--color-green)_10%,white)] text-green" : "border-paper-deep bg-white text-ink hover:border-ink-soft"
      )}
    >
      <IconCheck size={14} aria-hidden />
      {t(locale, checked ? "dashboard.growthPlan.didIt" : "dashboard.growthPlan.didThis")}
    </button>
  );
}
