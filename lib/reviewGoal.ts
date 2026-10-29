// The review goal in words — one shared wording for every place a review
// gap appears (Overview, Reviews, Competitors, reports + PDF, "Since your
// last visit", Growth's review task, the Free unlock line). The numbers come
// from reviewGoal() in lib/competitorComparison.ts (same scope as the rank);
// the group is scopeGroupLabel() in lib/competitorScope.ts. Pure.

import { shortName } from "@/lib/displayName";
import { formatCount, t, type Locale } from "./i18n";
import type { ReviewGoal } from "./competitorComparison";

export interface ReviewGoalText {
  /** "{Group} average 57 reviews." */
  average: string;
  /** The goal (beat / stretch / lead). */
  goal: string;
  /** Stretch only: the nearest competitor above them. */
  nextUp: string | null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function reviewGoalText(goal: ReviewGoal, group: string, locale: Locale): ReviewGoalText {
  const n = (v: number) => formatCount(v, locale);
  const average = capitalize(t(locale, "dashboard.reviewGoal.average", { group, avg: n(goal.average) }));
  const text =
    goal.kind === "lead"
      ? t(locale, "dashboard.reviewGoal.lead", { count: n(goal.ownCount), gap: n(goal.gap), name: shortName(goal.runnerUp?.name ?? goal.leader.name) })
      : t(locale, goal.kind === "stretch" ? "dashboard.reviewGoal.stretch" : "dashboard.reviewGoal.beat", { name: shortName(goal.leader.name), count: n(goal.leader.reviewCount), gap: n(goal.gap) });
  const nextUp = goal.kind === "stretch" && goal.nextUp ? t(locale, "dashboard.reviewGoal.nextUp", { name: shortName(goal.nextUp.name), count: n(goal.nextUp.reviewCount) }) : null;
  return { average, goal: text, nextUp };
}

/** All lines, in order (for reports, PostAI, the PDF). */
export function reviewGoalLines(goal: ReviewGoal, group: string, locale: Locale): string[] {
  const text = reviewGoalText(goal, group, locale);
  return [text.average, text.goal, ...(text.nextUp ? [text.nextUp] : [])];
}
