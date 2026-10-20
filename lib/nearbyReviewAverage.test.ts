import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { nearbyReviewAverage, MIN_REVIEW_AVERAGE_SAMPLE } from "./competitorComparison";
import type { SavedCompetitorEntry, SavedCompetitorScan } from "./savedCompetitorScans";
import type { CompetitorScope } from "./competitorScope";

const entry = (name: string, reviewCount: number | null, types: string[] = ["hair_salon"], isSubject = false): SavedCompetitorEntry =>
  ({ name, reviewCount, types, isSubject, total: 50, grade: "C", placeId: name, distanceMeters: 500 }) as unknown as SavedCompetitorEntry;
const scan = (entries: SavedCompetitorEntry[]): SavedCompetitorScan => ({ scanId: "s1", createdAt: "2026-10-16T15:49:00Z", entries }) as unknown as SavedCompetitorScan;

describe("the one nearby review average", () => {
  test("a salon's real scan: the mean of its 6 competitors is 57 (owner excluded)", () => {
    const s = scan([
      entry("You", 10, ["hair_salon"], true),
      entry("The Beauty Parlor", 188),
      entry("The Next Paige Salon", 76),
      entry("Hairdo", 47),
      entry("Salon Biagio", 15),
      entry("Salon Zinie", 13),
      entry("Katherine Winters Hair Salon", 5),
    ]);
    expect(nearbyReviewAverage(s)).toBe(57);
  });

  test("uses the same competitor scope as the rank", () => {
    const s = scan([entry("You", 10, ["sporting_goods_store"], true), entry("Zumiez Skate Shop", 100), entry("Board Co Skate Shop", 80), entry("Ride Skate Shop", 60), entry("American Sports", 900)]);
    const direct: CompetitorScope = { nicheId: "skate_snow", parent: "specialty_store", areas: [], mode: "direct" };
    expect(nearbyReviewAverage(s, direct)).toBe(80);
    expect(nearbyReviewAverage(s)).toBe(285);
  });

  test("too few competitors with a review count → no average (the Competitors table compares from 1)", () => {
    expect(MIN_REVIEW_AVERAGE_SAMPLE).toBe(3);
    const few = scan([entry("You", 10, [], true), entry("A", 5), entry("B", null), entry("C", 8)]);
    expect(nearbyReviewAverage(few)).toBeNull();
    expect(nearbyReviewAverage(few, null, 1)).toBe(7);
    expect(nearbyReviewAverage(scan([entry("You", 10, [], true)]), null, 1)).toBeNull();
  });

  test("every place reads it: Overview/reports/PDF/unlock lines (via the benchmark), PostAI and the Competitors page", () => {
    const actions = readFileSync("app/actions/competitors.ts", "utf8");
    expect(actions).toContain("competitorReviewAverage: nearbyReviewAverage(snapshot.scan, scope)");
    expect(actions).not.toMatch(/function competitorReviewAverage/);
    expect(readFileSync("app/actions/assistant.ts", "utf8")).toContain("nearbyReviewAverage: nearbyReviewAverage(snapshot.scan, competitorScope)");
    expect(readFileSync("lib/reports/reportData.server.ts", "utf8")).toContain("benchmark.benchmark.competitorReviewAverage");
    expect(readFileSync("lib/competitorComparison.ts", "utf8")).toContain('m.checkId === "visibility.review_count" ? nearbyReviewAverage(scan, null, 1)');
    // No other place averages review counts on its own.
    for (const f of ["components/overview/GrowMoreCustomers.tsx", "components/overview/FreeOverview.tsx", "lib/upgradeFacts.ts", "lib/reports/reportPdf.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/reviewCount[^\n]*reduce\(|\/\s*counts\.length/);
    }
  });
});
