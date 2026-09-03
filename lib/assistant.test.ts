import { describe, expect, test } from "vitest";
import {
  ASSISTANT_SYSTEM_RULES,
  buildAssistantContextText,
  buildAssistantStarterPrompts,
  type AssistantBusinessContext,
} from "./assistant";

const BASE_CONTEXT: AssistantBusinessContext = {
  listing: {
    name: "Riverside Cafe",
    categoryLabel: "Restaurant & Food Service",
    rating: 4.3,
    reviewCount: 58,
    phonePresent: true,
    addressPresent: true,
    hoursPresent: true,
    websitePresent: true,
    httpsStatus: "https",
    photoCount: 12,
    businessStatus: "OPERATIONAL",
    categoriesCount: 2,
  },
  score: {
    total: 74,
    grade: "C",
    categories: [
      { id: "visibility", label: "Visibility & Reputation", relativeScore: 62, earnedPoints: 25, possiblePoints: 40 },
      { id: "completeness", label: "Google Listing Completeness", relativeScore: 90, earnedPoints: 27, possiblePoints: 30 },
      { id: "website", label: "Website", relativeScore: 78, earnedPoints: 23.4, possiblePoints: 30 },
    ],
    losingChecks: [
      {
        checkId: "visibility.review_count",
        label: "Review count",
        category: "visibility",
        earnedPoints: 6.9,
        maxPoints: 18,
        explanation: "58 reviews on Google (full credit at 150+).",
      },
      {
        checkId: "website.https",
        label: "Uses HTTPS",
        category: "website",
        earnedPoints: 0,
        maxPoints: 6,
        explanation: "Confirmed by a live check: the site only loads over HTTP.",
      },
    ],
    excludedChecks: [
      { label: "Mobile-friendly", confidence: "NOT_FOUND", explanation: "Not yet implemented." },
    ],
  },
  actionPlan: {
    topTasks: [
      {
        label: "Uses HTTPS",
        category: "website",
        promisedPoints: 6,
        action: "Move your website to HTTPS.",
        effort: "quick_win",
      },
    ],
  },
  competitors: {
    available: true,
    scanAt: "1/2/2026",
    subjectRank: 2,
    entries: [
      { name: "Downtown Diner", isSubject: false, total: 88, grade: "B", priceLevelSymbol: "$$" },
      { name: "Riverside Cafe", isSubject: true, total: 74, grade: "C", priceLevelSymbol: "$$" },
    ],
  },
};

describe("buildAssistantContextText", () => {
  test("includes the real score, grade, and category breakdown", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(text).toContain("74/100 (Grade C)");
    expect(text).toContain("Visibility & Reputation: 62/100");
  });

  test("includes losing checks with their real explanations, never invented ones", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(text).toContain("Review count: 6.9/18 pts — 58 reviews on Google (full credit at 150+).");
    expect(text).toContain("Uses HTTPS: 0/6 pts");
  });

  test("names excluded (not-yet-scored) checks honestly rather than omitting them", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(text).toContain("not currently scored");
    expect(text).toContain("Mobile-friendly");
  });

  test("includes real competitor entries with price level, when a scan is available", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(text).toContain("Downtown Diner: PostScore 88 (B), Google price level: $$");
    expect(text).toContain("ranks #2 of 2");
  });

  test("is honest about a missing competitor scan rather than fabricating one", () => {
    const noCompetitors: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      competitors: { available: false, scanAt: null, subjectRank: null, entries: [] },
    };
    const text = buildAssistantContextText(noCompetitors);
    expect(text).toContain("No competitor scan has ever been saved");
    expect(text).not.toContain("PostScore 88");
  });

  test("reflects zero open tasks honestly when the action plan is empty", () => {
    const noTasks: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      actionPlan: { topTasks: [] },
    };
    expect(buildAssistantContextText(noTasks)).toContain("No open tasks.");
  });
});

describe("buildAssistantStarterPrompts", () => {
  test("returns a non-empty, deduplicated-feeling set of concrete questions", () => {
    const prompts = buildAssistantStarterPrompts(BASE_CONTEXT);
    expect(prompts.length).toBeGreaterThan(3);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  test("tailors one prompt to the business's real biggest-opportunity category", () => {
    const prompts = buildAssistantStarterPrompts(BASE_CONTEXT);
    expect(prompts.some((p) => p.includes("Visibility & Reputation"))).toBe(true);
  });

  test("phrases the competitor prompt differently when no scan is saved yet", () => {
    const noCompetitors: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      competitors: { available: false, scanAt: null, subjectRank: null, entries: [] },
    };
    const prompts = buildAssistantStarterPrompts(noCompetitors);
    expect(prompts).toContain("How can I compare to my nearby competitors?");
    expect(prompts).not.toContain("How do I compare to my nearby competitors?");
  });

  test("never suggests a question the assistant would have to decline, like a search rank", () => {
    const prompts = buildAssistantStarterPrompts(BASE_CONTEXT);
    expect(prompts.some((p) => /rank|search position/i.test(p))).toBe(false);
  });
});

describe("ASSISTANT_SYSTEM_RULES", () => {
  test("explicitly forbids fabricating each of the disclosed-as-unavailable facts", () => {
    for (const phrase of [
      "Individual reviews",
      "search or Google Maps ranking",
      "competitor's exact price",
      "Reply rates, response times",
    ]) {
      expect(ASSISTANT_SYSTEM_RULES).toContain(phrase);
    }
  });

  test("requires general guidance to be labeled with the exact prefix the UI parses", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain('"General guidance:"');
  });
});
