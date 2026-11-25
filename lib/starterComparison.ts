// The Website page's "Your website scores {x} / 30. A PostScore starter site would score {y} / 30."
// Both sides are real: x is the saved scan's Website points (rounded as the Overview's breakdown,
// lib/categoryPoints.ts); y is the starter template's own generated HTML scored by the same
// scoreBusiness() checks (lib/starterSiteScoring.ts, app/actions/website.ts). Pure.

export type StarterComparison =
  /** No website: "A starter site would add {gain} points to your score." */
  | { kind: "add"; starter: number; gain: number; of: number }
  /** The starter scores higher: "Recommended" + "Build your starter site →". */
  | { kind: "recommended"; current: number; starter: number; of: number }
  /** The current site scores the same or higher: keep it; the starter is a backup. */
  | { kind: "keep"; current: number; starter: number; of: number };

export function starterComparison(input: { hasWebsite: boolean; current: { earned: number; of: number } | null; starter: number | null }): StarterComparison | null {
  if (input.starter === null) return null;
  const of = input.current?.of ?? 30;
  if (!input.hasWebsite) return { kind: "add", starter: input.starter, gain: Math.max(0, input.starter - (input.current?.earned ?? 0)), of };
  if (!input.current) return null;
  return input.starter > input.current.earned ? { kind: "recommended", current: input.current.earned, starter: input.starter, of } : { kind: "keep", current: input.current.earned, starter: input.starter, of };
}
