// The report's "Score by category" rows — the real PostScore categories
// with their real maxes (Visibility & Reputation /40, Google Listing
// Completeness /30, Website /30), built exactly as the Overview's
// breakdown panel builds them: the same whole points (wholeCategoryPoints),
// bar shares and done / needs work / couldn't check counts. Pure.

import type { CategoryResult } from "@/lib/scoring";
import { categoryBarShares, categoryOutcomeCounts, wholeCategoryPoints } from "@/lib/overviewTiles";
import type { ReportCategory } from "./reportPdf";

export function reportCategories(categories: CategoryResult[]): ReportCategory[] {
  const points = wholeCategoryPoints(categories);
  return categories.map((c, i) => {
    const shares = categoryBarShares(c);
    return { label: c.label, points: points[i], weight: c.weight, earned: shares.earned, unchecked: shares.unchecked, ...categoryOutcomeCounts(c) };
  });
}
