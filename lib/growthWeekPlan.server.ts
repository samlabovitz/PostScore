// Server-only. Day 25B step 6: this week's plan as the Growth tier sees it
// (spec §2c) — the order, one tier line per task, the checks already made
// ("I did this"), and how many tasks there are — shared by Growth plan,
// Google results and the Overview's Growth line. Reads only.
import "server-only";
import type { GoogleProfileTabProps } from "@/components/gbp/googleTabParts";
import { tabIdeasFor, weekKinds } from "@/lib/tabIdeas";
import { addDays } from "@/lib/growthTier";
import { onTrackIfWeekCounts, rankWeek, tierLines, type TierLine, type WeekKind } from "@/lib/growthPlan";
import type { GrowthView } from "@/lib/growthPlan.server";
import type { WeeklyChecklistItemId } from "@/lib/weeklyChecklist";
import { growthExtras, type GrowthExtra } from "@/lib/growthWeek";

export interface WeekPlanData {
  order: WeekKind[];
  lines: Partial<Record<WeekKind, TierLine>>;
  /** This week's "I did this" checks (weekly_checks). */
  checked: WeeklyChecklistItemId[];
  /** §2d: the Growth-only tasks after the Google ones (ask for reviews, an offer, a seasonal idea). */
  extras?: GrowthExtra[];
  /** Tasks in this week's plan (the Overview line's "4 tasks this week"): the Google tasks plus the extras. */
  count: number;
  connected: boolean;
}

/** `oneTap`: Premium with Google connected — tasks go out from PostScore (verified). Otherwise each
 * task is done on Google and checked off ("You told us": 2 make a week count). */
export function weekPlanFor(props: GoogleProfileTabProps, timeZone: string, view: GrowthView, checked: WeeklyChecklistItemId[], oneTap: boolean, now = Date.now()): WeekPlanData {
  const recs = weekKinds(tabIdeasFor(props, timeZone, now).recs);
  const kinds = recs.map((r) => r.kind as WeekKind);
  const post = recs.find((r): r is Extract<typeof r, { kind: "posts" }> => r.kind === "posts");
  const connected = props.connected || props.practice;
  const extras = growthExtras(new Date(now));
  const count = kinds.length + extras.length;
  if (view.status !== "ok") return { order: kinds, lines: {}, checked, extras, count, connected };
  const { state, facts } = view;
  // Check-offs, not one tap: the tier line says so (connected here means "PostScore sees it go out").
  const ctx = { thisWeek: state.thisWeek, thisWeekCounts: state.thisWeekCounts, postDate: post?.plan.date ?? null, connected: oneTap };
  const nextWeekTier = state.thisWeekCounts ? onTrackIfWeekCounts(facts, state.tier, addDays(state.thisWeek, 7)) : null;
  return { order: rankWeek(kinds, ctx).order, lines: tierLines(kinds, ctx, nextWeekTier), checked, extras, count, connected };
}
