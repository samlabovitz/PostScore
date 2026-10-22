// Free plan: the pieces that make "upgrading gets you a step-by-step path
// to every missing point" obvious. Pure — shared by the Overview and its
// tests. Grow and above never use any of this.

import type { ScoreWithSuggestions } from "@/lib/scoring";

/** Where "See how to fix it" and every locked "How to fix this" row
 * scroll to: the upgrade box right after the Score breakdown. */
export const FIX_PLAN_ANCHOR = "fix-plan";

/** "+N points are waiting to be fixed": every point the current score is
 * missing, from the real score (so it follows any scoring change). */
export function freeWaitingPoints(total: number): number {
  return Math.max(0, Math.round(100 - total));
}


/** Free: the score result without any fix advice in it — the page only
 * needs the numbers, and the advice must never reach a Free page's HTML
 * (not even in the data React sends along). */
export function withoutAdvice(result: ScoreWithSuggestions): ScoreWithSuggestions {
  return { ...result, suggestions: result.suggestions.map((s) => ({ ...s, advice: "" })) };
}
