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

  test("next up: the nearest competitor above them, with the area average", () => {
    const goal = reviewGoal(scan([entry("You", 30, true), entry("A", 60), entry("B", 50), entry("C", 40)]), null, 30)!;
    expect(goal).toMatchObject({ kind: "next", average: 50, gap: 10, nextUp: { name: "C", reviewCount: 40 }, leader: { name: "A", reviewCount: 60 } });
    // The leader (60) is within 3× their 30 reviews: a stretch goal too.
    expect(reviewGoalLines(goal, "nearby salons", "en")).toEqual(["Nearby salons average 50 reviews.", "Next up: C, 40 reviews.", "Stretch goal: beat A — 60 reviews (30 more than you)."]);
  });

  test("a leader over 3× their own count is never shown (Lulu's Tacos: never “beat X — 5,337 reviews”)", () => {
    expect(STRETCH_LEADER_FACTOR).toBe(3);
    const goal = reviewGoal(scan([entry("You", 187, true), entry("Big Chain", 5337), entry("Casa Kahlo", 222), entry("Local B", 30), entry("Local C", 10)]), null, 187)!;
    expect(goal.nextUp).toMatchObject({ name: "Casa Kahlo", reviewCount: 222 });
    expect(goal.stretch).toBeNull();
    const text = reviewGoalText(goal, "nearby salons", "en");
    expect(text.goal).toBe("Next up: Casa Kahlo, 222 reviews.");
    expect(text.stretch).toBeNull();
    expect(reviewGoalLines(goal, "nearby salons", "en").join(" ")).not.toContain("5,337");
  });

  test("only the leader above them: next up is the leader, no stretch line", () => {
    const goal = reviewGoal(scan([entry("You", 50, true), entry("A", 60), entry("B", 40), entry("C", 20)]), null, 50)!;
    expect(reviewGoalLines(goal, "nearby salons", "en")).toEqual(["Nearby salons average 40 reviews.", "Next up: A, 60 reviews."]);
  });

  test("Rooted On Main: next up is Sacksy Thyme (22); “Rooted” (114, another business) is over 3× their 15", () => {
    const goal = reviewGoal(scan([entry("Rooted On Main", 15, true), entry("Rooted", 114), entry("The Little Treasure Shoppe", 48), entry("Sacksy Thyme Natural Wellness", 22), entry("Creations By Emas", 1), entry("Surfshore", 1)]), null, 15)!;
    expect(reviewGoalLines(goal, "nearby gift shops", "en").slice(1)).toEqual(["Next up: Sacksy Thyme Natural Wellness, 22 reviews."]);
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
    // The same plural words as the rank line (nicheGroupNoun).
    expect(scopeGroupLabel(s, direct, "en", "specialty stores")).toBe("nearby skate & snow shops");
    expect(scopeGroupLabel(s, null, "en", "salons")).toBe("nearby salons");
    expect(scopeGroupLabel(s, direct, "es", "tiendas")).toBe("tiendas de skate y snowboard cercanas");
    expect(scopeGroupLabel(s, null, "es", "tiendas especializadas")).toBe("tiendas especializadas de la zona");
  });

  test("Art & pottery studios: the review goal says what the rank line says (EN + ES)", async () => {
    const { reviewGoalLines } = await import("./reviewGoal");
    const { nicheById } = await import("./niches");
    const clay: CompetitorScope = { nicheId: "art_classes", parent: "tutor_education", areas: [], mode: "direct" };
    const s = scan([entry("You", 48, true), entry("Fired Up Pottery, LLC", 117), entry("The Painted Plate", 74)]);
    expect(scopeGroupLabel(s, clay, "en", "tutoring services")).toBe("nearby art & pottery studios");
    const goal = { kind: "next", average: 51, ownCount: 48, gap: 26, leader: { name: "Fired Up Pottery, LLC", reviewCount: 117 }, runnerUp: null, nextUp: { name: "The Painted Plate", reviewCount: 74 }, stretch: { name: "Fired Up Pottery, LLC", reviewCount: 117 } } as never;
    expect(reviewGoalLines(goal, scopeGroupLabel(s, clay, "en", "tutoring services"), "en")[0]).toBe("Nearby art & pottery studios average 51 reviews.");
    expect(reviewGoalLines(goal, scopeGroupLabel(s, clay, "es", "servicios de tutoría"), "es")[0]).toBe("Estudios de arte y cerámica cercanos: 51 reseñas en promedio.");
    expect(nicheById("mexican")).not.toBeNull();
  });

  test("Spanish (usted)", () => {
    const goal = reviewGoal(SALONS, null, 10)!;
    expect(reviewGoalLines(goal, "salones de la zona", "es")).toEqual(["Salones de la zona: 57 reseñas en promedio.", "Siguiente: Salon Zinie, 13 reseñas."]);
  });

  test("every place uses it: benchmark (Overview, Reviews, reports, PDF, visit, unlock lines), Competitors, Growth and PostAI", () => {
    expect(readFileSync("app/actions/competitors.ts", "utf8")).toContain("reviewGoal: countsKnown ? reviewGoal(snapshot.scan, scope,");
    expect(readFileSync("app/business/[id]/competitors/CompetitorsView.tsx", "utf8")).toContain("reviewGoal(scan, scope, own)");
    expect(readFileSync("lib/reports/reportData.server.ts", "utf8")).toContain("reviewGoalLines(benchmark.benchmark.reviewGoal");
    expect(readFileSync("app/actions/weekly.ts", "utf8")).toContain("reviewGoalLines: async () =>");
    expect(readFileSync("app/business/[id]/growth/page.tsx", "utf8")).toContain("reviewGoalLines(benchmark.benchmark.reviewGoal");
    expect(readFileSync("app/actions/assistant.ts", "utf8")).toContain("reviewGoalLines: (() => {");
    expect(readFileSync("lib/assistant.ts", "utf8")).toContain("never compute your own leader, gap or target");
  });
});
