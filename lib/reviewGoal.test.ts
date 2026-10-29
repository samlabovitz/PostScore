import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { reviewGoal, reviewLeader, STRETCH_LEADER_FACTOR } from "./competitorComparison";
import { scopeGroupLabel, type CompetitorScope } from "./competitorScope";
import { reviewGoalLines, reviewGoalText } from "./reviewGoal";
import type { SavedCompetitorEntry, SavedCompetitorScan } from "./savedCompetitorScans";

const entry = (name: string, reviewCount: number | null, isSubject = false, rating: number | null = 4.5): SavedCompetitorEntry =>
  ({ name, reviewCount, rating, types: ["hair_salon"], isSubject, total: 50, grade: "C", placeId: name, distanceMeters: 500 }) as unknown as SavedCompetitorEntry;
const scan = (entries: SavedCompetitorEntry[]): SavedCompetitorScan => ({ scanId: "s", createdAt: "2026-10-16T15:49:00Z", entries }) as unknown as SavedCompetitorScan;

// A salon's real competitor set (mean 57): the leader has 188.
const SALONS = scan([entry("You", 10, true), entry("The Beauty Parlor", 188), entry("The Next Paige Salon", 76), entry("Hairdo", 47), entry("Salon Biagio", 15), entry("Salon Zinie", 13), entry("Katherine Winters Hair Salon", 5)]);

describe("the review leader and goal (same scope as the rank)", () => {
  test("leader: the competitor with the most reviews, with name, count and rating", () => {
    expect(reviewLeader(SALONS)).toEqual({ name: "The Beauty Parlor", reviewCount: 188, rating: 4.5 });
  });

  test("beat the leader: the real goal and gap, with the area average", () => {
    const goal = reviewGoal(scan([entry("You", 30, true), entry("A", 60), entry("B", 50), entry("C", 40)]), null, 30)!;
    expect(goal).toMatchObject({ kind: "beat", average: 50, gap: 30, nextUp: null, leader: { name: "A", reviewCount: 60 } });
    expect(reviewGoalLines(goal, "nearby salons", "en")).toEqual(["Nearby salons average 50 reviews.", "Your goal: beat A — 60 reviews (30 more than you)."]);
  });

  test("a leader over 3× the average is a stretch goal, with the nearest competitor above as the next target", () => {
    expect(STRETCH_LEADER_FACTOR).toBe(3);
    const goal = reviewGoal(scan([entry("You", 20, true), entry("Big Chain", 900), entry("Local A", 60), entry("Local B", 30), entry("Local C", 10)]), null, 20)!;
    expect(goal.kind).toBe("stretch");
    expect(goal.nextUp).toMatchObject({ name: "Local B", reviewCount: 30 });
    const text = reviewGoalText(goal, "nearby salons", "en");
    expect(text.goal).toBe("Stretch goal: beat Big Chain — 900 reviews (880 more than you).");
    expect(text.nextUp).toBe("Next up: Local B, 30 reviews.");
  });

  test("already the most reviews: you lead, keep the gap (to #2)", () => {
    const goal = reviewGoal(scan([entry("You", 120, true), entry("A", 80), entry("B", 40), entry("C", 20)]), null, 120)!;
    expect(goal.kind).toBe("lead");
    expect(reviewGoalText(goal, "nearby salons", "en").goal).toBe("You lead nearby with 120 reviews — keep the gap (40 ahead of A).");
  });

  test("fewer than 3 competitors in scope: no leader, no goal (same rule as the average)", () => {
    const few = scan([entry("You", 5, true), entry("A", 60), entry("B", null), entry("C", 40)]);
    expect(reviewLeader(few)).toBeNull();
    expect(reviewGoal(few, null, 5)).toBeNull();
  });

  test("every saved competitor counts (v2) — and the label names the niche's group", () => {
    const s = scan([entry("You", 10, true), entry("Zumiez Skate Shop", 100), entry("Board Co Skate Shop", 80), entry("Ride Skate Shop", 60), entry("American Sports", 900)]);
    const direct: CompetitorScope = { nicheId: "skate_snow", parent: "specialty_store", areas: [], mode: "direct" };
    expect(reviewLeader(s, direct)?.name).toBe("American Sports");
    expect(reviewLeader(s)?.name).toBe("American Sports");
    expect(scopeGroupLabel(s, direct, "en", "specialty stores")).toBe("skate & snow shop businesses nearby");
    expect(scopeGroupLabel(s, null, "en", "salons")).toBe("nearby salons");
    expect(scopeGroupLabel(s, direct, "es", "tiendas")).toMatch(/^negocios cercanos de /);
  });

  test("Spanish (usted)", () => {
    const goal = reviewGoal(SALONS, null, 10)!;
    expect(reviewGoalLines(goal, "salones cercanos", "es")[1]).toBe("Meta ambiciosa: superar a The Beauty Parlor: 188 reseñas (178 más que usted).");
  });

  test("every place uses it: benchmark (Overview, Reviews, reports, PDF, visit, unlock lines), Competitors, Growth and PostAI", () => {
    expect(readFileSync("app/actions/competitors.ts", "utf8")).toContain("reviewGoal: reviewGoal(snapshot.scan, scope,");
    expect(readFileSync("app/business/[id]/competitors/CompetitorsView.tsx", "utf8")).toContain("reviewGoal(scan, scope, own)");
    expect(readFileSync("lib/reports/reportData.server.ts", "utf8")).toContain("reviewGoalLines(benchmark.benchmark.reviewGoal");
    expect(readFileSync("app/actions/weekly.ts", "utf8")).toContain("reviewGoalLines: async () =>");
    expect(readFileSync("app/business/[id]/growth/page.tsx", "utf8")).toContain("reviewGoalLines(benchmark.benchmark.reviewGoal");
    expect(readFileSync("app/actions/assistant.ts", "utf8")).toContain("reviewGoalLines: (() => {");
    expect(readFileSync("lib/assistant.ts", "utf8")).toContain("never compute your own leader, gap or target");
  });
});
