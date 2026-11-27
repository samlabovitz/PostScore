import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { breakdownHasQuotes, breakdownWithoutQuotes } from "./breakdownStorage";
import { clearedRowPatch, hasRawValues } from "./competitorRawCleanup";
import { cleanBreakdownQuotes } from "./breakdownQuotesCleanup.server";
import { resolveChangeDisplay } from "./scoreChanges";
import { scoreBusiness, type ScoreBreakdown } from "./scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";

const live = scoreBusiness(scoringInput({ rating: 4.6, reviewCount: 120 }));

describe("a saved breakdown keeps our results, never text quoting Google", () => {
  const saved = breakdownWithoutQuotes(live);

  test("no explanation text, notes or quoted counts — in the flat list AND every category", () => {
    expect(breakdownHasQuotes(live)).toBe(true);
    expect(breakdownHasQuotes(saved)).toBe(false);
    const json = JSON.stringify(saved);
    expect(json).not.toMatch(/4\.6★|120 reviews|on Google|"note"|"recentReviews"/);
    for (const cat of saved.categories) for (const c of cat.checks) expect(c.explanation).toBe("");
  });

  test("points, confidence, flags, gaps, total and grade unchanged", () => {
    expect(saved.total).toBe(live.total);
    expect(saved.grade).toBe(live.grade);
    expect(saved.checks.map((c) => [c.id, c.earnedPoints, c.maxPoints, c.confidence, c.gaps ?? null])).toEqual(live.checks.map((c) => [c.id, c.earnedPoints, c.maxPoints, c.confidence, c.gaps ?? null]));
    expect(saved.categories.map((c) => [c.id, c.earnedPoints, c.possiblePoints, c.relativeScore])).toEqual(live.categories.map((c) => [c.id, c.earnedPoints, c.possiblePoints, c.relativeScore]));
    const rating = saved.checks.find((c) => c.id === "visibility.rating")!;
    expect(rating.meta).toEqual(live.checks.find((c) => c.id === "visibility.rating")!.meta);
    expect(breakdownWithoutQuotes(saved)).toEqual(saved);
  });

  test("pages show the live score's own words; a check no longer scored has none (never the saved text)", () => {
    const check = saved.checks.find((c) => c.id === "visibility.review_count")!;
    expect(resolveChangeDisplay(check, live, "en").explanation).toBe(live.checks.find((c) => c.id === "visibility.review_count")!.explanation);
    const gone: ScoreBreakdown = { ...live, checks: live.checks.filter((c) => c.id !== "visibility.review_count") };
    expect(resolveChangeDisplay(check, gone, "en").explanation).toBe("");
    // Gained / Lost: the reason from the live score's own words (resolveChangeDisplay), never the saved text.
    expect(readFileSync("components/overview/SinceLastScanCard.tsx", "utf8")).toContain("helpSplit(resolveChangeDisplay(check, liveBreakdown, locale).explanation).first");
  });

  test("every scan saves this way (the one place scores are written)", () => {
    expect(readFileSync("app/actions/scoring.ts", "utf8")).toContain("breakdown_json: breakdownWithoutQuotes(breakdownJson),");
  });
});

describe("competitor scans: the category lists 2b-3 missed", () => {
  test("a cleared row with text left in its categories still counts as holding Google's values, and the patch cleans both lists", () => {
    const leftover = { ...breakdownWithoutQuotes(live), categories: live.categories };
    const row = { id: "r", breakdown_json: leftover };
    expect(hasRawValues(row)).toBe(true);
    const patched = clearedRowPatch(row);
    expect(breakdownHasQuotes(patched.breakdown_json)).toBe(false);
  });
});

describe("the one-off cleanup", () => {
  function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
    const updates: Array<{ table: string; id: unknown; value: Record<string, unknown> }> = [];
    const db = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.order = () => chain;
        chain.range = async () => ({ data: tables[table], error: null });
        chain.update = (value: Record<string, unknown>) => ({ eq: async (_c: string, id: unknown) => (updates.push({ table, id, value }), { error: null }) });
        return chain;
      },
    } as unknown as SupabaseClient;
    return { db, updates };
  }
  const tables = () => ({
    scores: [{ id: "s1", breakdown_json: live }, { id: "s2", breakdown_json: breakdownWithoutQuotes(live) }],
    competitor_scans: [{ id: "c1", breakdown_json: { ...breakdownWithoutQuotes(live), categories: live.categories }, pending_breakdown_json: null }, { id: "c2", breakdown_json: breakdownWithoutQuotes(live), pending_breakdown_json: null }],
  });

  test("dry run: counts only", async () => {
    const { db, updates } = fakeDb(tables());
    expect(await cleanBreakdownQuotes(db, { dryRun: true })).toEqual({ scores: 2, scoresWithQuotes: 1, competitorRows: 2, competitorRowsWithQuotes: 1 });
    expect(updates).toEqual([]);
  });

  test("live: only rows with text, cleaned; points untouched", async () => {
    const { db, updates } = fakeDb(tables());
    await cleanBreakdownQuotes(db, { dryRun: false });
    expect(updates.map((u) => `${u.table}:${u.id}`)).toEqual(["scores:s1", "competitor_scans:c1"]);
    for (const u of updates) {
      expect(breakdownHasQuotes(u.value.breakdown_json)).toBe(false);
      expect((u.value.breakdown_json as ScoreBreakdown).total).toBe(live.total);
    }
    expect(updates[1].value).not.toHaveProperty("pending_breakdown_json");
  });
});
