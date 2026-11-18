// How a check's result is labeled and its points shown — shared by the
// score breakdown (components/scoring/CategoryCard.tsx) and server code
// that builds the same labels (lib/overviewTiles.ts). Pure, no UI.

import type { CheckResult } from "@/lib/scoring";

/** Day 4 Step 3: each row is labeled by its RESULT — never by how sure
 * we are of it (the old green "Verified" read as a pass even at 0 / 1):
 * full points → "Done", fewer → "Needs work", excluded → "Couldn't check". */
export type CheckOutcome = "done" | "needs_work" | "couldnt_check" | "not_scored_yet" | "excellent" | "good";

/** v1.16.0: measured once, close to the limit — waiting for a second test
 * (lib/speedSmoothing.ts). Not "couldn't check": the test worked. */
export function isNotScoredYet(check: Pick<CheckResult, "earnedPoints" | "meta">): boolean {
  return check.earnedPoints === null && check.meta?.noScoreCause === "one_test";
}

/** The Star rating row is labeled by the rating itself (ratingBand in
 * lib/scoring.ts): 4.5★+ "Excellent" and 4.3★+ "Good" are never "Needs
 * work", even while more reviews would still add points. */
export function checkOutcome(check: Pick<CheckResult, "id" | "earnedPoints" | "maxPoints" | "meta">): CheckOutcome {
  if (isNotScoredYet(check)) return "not_scored_yet";
  if (check.earnedPoints === null) return "couldnt_check";
  if (check.id === "visibility.rating" && check.meta?.ratingBand === "excellent") return "excellent";
  if (check.id === "visibility.rating" && check.meta?.ratingBand === "good") return "good";
  return check.earnedPoints >= check.maxPoints ? "done" : "needs_work";
}

export function formatPoints(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
