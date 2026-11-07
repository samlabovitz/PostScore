// M12–M15 (code review, Nov 7): items the owner marked "I did this" never
// crowd out open ones, never become a report's next step, Biggest boost
// names an open item, PostAI matches the card on Free, and a merged card
// is "marked done" only when every part is.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { biggestBoostFrom, reportNextSteps, topRecommendations } from "./overviewTiles";
import { buildActionPlan, MERGED_REVIEW_CHECK_ID, mergeReviewTasks, type ActionPlanTask } from "./actionPlan";
import { getScoreWithSuggestions, type BusinessScoringInput } from "./scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";

function task(partial: Partial<ActionPlanTask>): ActionPlanTask {
  return {
    checkId: "completeness.photos",
    category: "completeness",
    label: "Photos",
    problem: "",
    why: "",
    action: "Add 5 more photos",
    fix: "",
    ownerActionOnGoogle: true,
    promisedPoints: 3,
    status: "open",
    markedDoneAt: null,
    markedPromisedPoints: null,
    markedMetricValue: null,
    effort: "quick_win",
    weeklyTarget: null,
    weightedPoints: 3,
    weightedPointsHigh: null,
    ...partial,
  } as ActionPlanTask;
}

// Hair Express's shape: the three biggest items marked done, two smaller ones open.
const tasks = [
  task({ checkId: "visibility.reviews_merged", category: "visibility", label: "Reviews", weightedPoints: 13.2, status: "pending_verification" }),
  task({ checkId: "visibility.review_replies", category: "visibility", label: "Replying to reviews", weightedPoints: 6, status: "pending_verification" }),
  task({ checkId: "completeness.customer_details", label: "Customer details on your listing", weightedPoints: 1, status: "pending_verification" }),
  task({ checkId: "completeness.photos", label: "Photos", weightedPoints: 2.5 }),
  task({ checkId: "completeness.hours", label: "Hours", weightedPoints: 1.5 }),
];

describe("M13: open items first; Biggest boost names an open item", () => {
  test("open recommendations come before marked-done ones, each group biggest first", () => {
    const recs = topRecommendations(tasks, null, "b");
    expect(recs.map((r) => [r.key, r.pending])).toEqual([
      ["completeness.photos", false],
      ["completeness.hours", false],
      ["visibility.reviews_merged", true],
    ]);
    expect(topRecommendations(tasks, null, "b", {}, Infinity).map((r) => r.key)).toEqual([
      "completeness.photos",
      "completeness.hours",
      "visibility.reviews_merged",
      "visibility.review_replies",
      "completeness.customer_details",
    ]);
  });

  test("Biggest boost is the first open recommendation", () => {
    expect(biggestBoostFrom(topRecommendations(tasks, null, "b"), [], "en")).toEqual({ label: "Photos", promisedPoints: 2.5, weightedPoints: 2.5 });
  });

  test("…and a marked-done one only when nothing is open", () => {
    const allDone = topRecommendations(tasks.filter((x) => x.status === "pending_verification"), null, "b");
    expect(biggestBoostFrom(allDone, [], "en")?.label).toBe("Reviews");
    expect(biggestBoostFrom([], [], "en")).toBeNull();
  });
});

describe("M12: the monthly report's next steps skip marked-done items", () => {
  test("open items only, at most 3, still 3 when there are enough", () => {
    const all = topRecommendations(tasks, null, "b", {}, Infinity);
    expect(reportNextSteps(all).map((r) => r.key)).toEqual(["completeness.photos", "completeness.hours"]);
    const more = [...tasks, task({ checkId: "completeness.phone", label: "Phone", weightedPoints: 1.2 }), task({ checkId: "completeness.categories", label: "Categories", weightedPoints: 1.1 })];
    expect(reportNextSteps(topRecommendations(more, null, "b", {}, Infinity)).map((r) => r.key)).toEqual(["completeness.photos", "completeness.hours", "completeness.phone"]);
    expect(reportNextSteps(topRecommendations(tasks.filter((x) => x.status === "pending_verification"), null, "b", {}, Infinity))).toEqual([]);
  });

  test("the report builds them from the full list, not a top 3 cut before filtering", () => {
    const src = readFileSync("lib/reports/reportData.server.ts", "utf8");
    expect(src).toContain("reportNextSteps(topRecommendations(actionPlan.tasks, actionPlan.websiteBanner, businessId, linkOptions, Infinity))");
  });
});

describe("M14: PostAI's Biggest boost uses exactly the score card's inputs", () => {
  test("Free passes no recommendations (the card's biggest suggestion); paid passes the list", () => {
    const src = readFileSync("app/actions/assistant.ts", "utf8");
    expect(src).toMatch(/biggestBoost: biggestBoostFrom\(\s*plan !== "free" && actionPlanResult\.status === "ok" \? topRecommendations\(/);
    // The page does the same: Free → null recommendations.
    expect(readFileSync("app/business/[id]/page.tsx", "utf8")).toContain("recommendations={free ? null : recommendations}");
  });

  test("the same inputs give the same answer: Free → biggest suggestion; empty paid list → nothing", () => {
    const suggestions = [{ label: "Review count", promisedPoints: 9.2, weightedPoints: 9.2 }] as never;
    expect(biggestBoostFrom(null, suggestions, "en")).toEqual({ label: "Review count", promisedPoints: 9.2, weightedPoints: 9.2 });
    expect(biggestBoostFrom([], suggestions, "en")).toBeNull();
  });
});

describe("M15: a merged card is marked done only when every part is", () => {
  // Several review gaps at once, so they merge into one card.
  const input: BusinessScoringInput = { ...scoringInput(), rating: 3.9, reviewCount: 6, mostRecentReviewDaysAgo: 300 };
  const merged = (doneIds: string[]) => {
    const { breakdown, suggestions } = getScoreWithSuggestions(input, "en");
    const rows = doneIds.map((id, i) => ({ id: `t${i}`, check_id: id, status: "pending_verification", promised_points: 1, marked_done_at: "2026-11-01T00:00:00Z", verified_at: null, marked_metric_value: null }));
    const tasks = mergeReviewTasks(buildActionPlan(breakdown, suggestions, rows as never, input, "en"), breakdown, input, "en");
    return tasks.find((x) => x.checkId === MERGED_REVIEW_CHECK_ID)!;
  };

  test("the review checks really merge here", () => {
    expect(merged([]).mergedCheckIds!.length).toBeGreaterThan(1);
    expect(merged([]).status).toBe("open");
  });

  test("one part marked done → still open; every part → marked done", () => {
    const parts = merged([]).mergedCheckIds!;
    expect(merged([parts[0]]).status).toBe("open");
    expect(merged(parts).status).toBe("pending_verification");
  });

  test("the merged website card follows the same rule", () => {
    const src = readFileSync("lib/actionPlan.ts", "utf8");
    expect(src).toContain('status: websiteTasks.every((task) => task.status === "pending_verification")');
    expect(src).not.toMatch(/status: (reviewTasks|websiteTasks)\.some\(/);
  });
});
