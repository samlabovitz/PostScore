// Whole category points — pure, shared by the Overview, the reports, the
// "Improve your website" line and PostAI so every place shows the same
// "28 / 30" (never a category out of 100).

import type { CategoryResult } from "@/lib/scoring";

/** Whole points per category, as the Overview and the reports show them
 * ("15 / 40"): rounded so the three still add up to the rounded total
 * (largest remainder — 14.7 + 21.9 + 0 shows as 15 + 22 + 0 = 37).
 * null for a category with nothing checkable. Same order as `categories`. */
export function wholeCategoryPoints(categories: Array<Pick<CategoryResult, "relativeScore" | "weight">>): Array<number | null> {
  const exact = categories.map((c) => (c.relativeScore === null ? null : (c.relativeScore * c.weight) / 100));
  const known = exact.filter((v): v is number => v !== null);
  const target = Math.round(known.reduce((a, b) => a + b, 0));
  const floors = exact.map((v) => (v === null ? null : Math.floor(v)));
  let left = target - floors.reduce<number>((a, b) => a + (b ?? 0), 0);
  const order = exact
    .map((v, i) => ({ i, rem: v === null ? -1 : v - Math.floor(v) }))
    .filter((x) => x.rem >= 0)
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  const out = [...floors];
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] = (out[i] as number) + 1;
    left--;
  }
  return out;
}

/** The Website category's whole points ("28" of 30), as the Overview shows them. */
export function websiteWholePoints(categories: Array<Pick<CategoryResult, "id" | "relativeScore" | "weight">>): { earned: number; of: number } | null {
  const i = categories.findIndex((c) => c.id === "website");
  if (i < 0) return null;
  const earned = wholeCategoryPoints(categories)[i];
  return earned === null ? null : { earned, of: categories[i].weight };
}
