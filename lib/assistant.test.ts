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
  growthMoves: [
    {
      id: "start_coupon",
      title: "Start a coupon",
      why: "Give new customers a reason to try you.",
      pricingAssessedAt: null,
      yourPhotoCount: 12,
      competitorMedianPhotoCount: null,
      weakWebsiteIssueLabels: [],
    },
    {
      id: "run_price_check",
      title: "Re-check your prices against competitors",
      why: "Local prices move with the seasons.",
      pricingAssessedAt: "2026-09-24T16:29:18.231+00:00",
      yourPhotoCount: 12,
      competitorMedianPhotoCount: null,
      weakWebsiteIssueLabels: [],
    },
  ],
  weeklyRoutine: {
    items: [
      { title: "Post an update", checkedThisWeek: true },
      { title: "Reply to reviews", checkedThisWeek: false },
      { title: "Share your review link", checkedThisWeek: false },
      { title: "Add a photo", checkedThisWeek: false },
      { title: "Check your hours", checkedThisWeek: true },
    ],
    streakWeeks: 3,
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
  profile: {
    businessType: "Restaurant & Food Service",
    businessTypeId: "restaurant",
    autoDetectedBusinessType: "Restaurant & Food Service",
    autoDetectedBusinessTypeId: "restaurant",
    businessTypeOverridden: false,
    location: "123 River St, Springfield",
    services: ["Brunch", "Catering"],
    avgJobValueLow: 15,
    avgJobValueHigh: 45,
    scoreHistory: [
      { total: 68, grade: "D", date: "1/1/2026" },
      { total: 74, grade: "C", date: "2/1/2026" },
    ],
    fixedItems: [{ label: "Photos on listing", pointsGained: 6, verifiedAt: "1/15/2026" }],
  },
  gbp: { connected: false },
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

  test("points to the connect flow honestly when Google Business Profile isn't connected", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(text).toContain("Google Business Profile connection: not connected");
    expect(text).toContain("Reviews page or Overview page's connect prompt");
  });

  test("says data still isn't synced even when connected, rather than implying it's live", () => {
    const connected: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      gbp: { connected: true },
    };
    const text = buildAssistantContextText(connected);
    expect(text).toContain("Google Business Profile connection: connected");
    expect(text).toContain("still not synced yet");
  });

  test("reflects zero open tasks honestly when the action plan is empty", () => {
    const noTasks: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      actionPlan: { topTasks: [] },
    };
    expect(buildAssistantContextText(noTasks)).toContain("No open tasks.");
  });

  test("includes the persisted business-memory block with real score history and fixed items", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(text).toContain("WHAT WE KNOW ABOUT THIS BUSINESS");
    expect(text).toContain("Services (owner-entered): Brunch, Catering.");
    expect(text).toContain("Typical job/ticket value range (owner-entered): $15-$45.");
    expect(text).toContain("1/1/2026: 68 (D) -> 2/1/2026: 74 (C)");
    expect(text).toContain("Photos on listing (+6 pts, confirmed 1/15/2026)");
  });

  test("notes an owner-corrected business type honestly, including what Google actually detected", () => {
    const overridden: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      profile: {
        ...BASE_CONTEXT.profile,
        businessType: "Liquor & Wine Store",
        businessTypeId: "default",
        autoDetectedBusinessType: "General Business",
        businessTypeOverridden: true,
      },
    };
    const text = buildAssistantContextText(overridden);
    expect(text).toContain('Business type: Liquor & Wine Store (owner-corrected from Google\'s auto-detected "General Business")');
  });

  test("is honest when no services, job value, score history, or fixed items are on file", () => {
    const empty: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      profile: {
        businessType: "Restaurant & Food Service",
        businessTypeId: "restaurant",
        autoDetectedBusinessType: "Restaurant & Food Service",
        autoDetectedBusinessTypeId: "restaurant",
        businessTypeOverridden: false,
        location: null,
        services: [],
        avgJobValueLow: null,
        avgJobValueHigh: null,
        scoreHistory: [],
        fixedItems: [],
      },
    };
    const text = buildAssistantContextText(empty);
    expect(text).toContain("Services: not entered yet");
    expect(text).toContain("Typical job/ticket value range: not entered yet.");
    expect(text).toContain("Score history: no saved scans yet.");
    expect(text).toContain("Confirmed fixed: nothing confirmed fixed yet.");
    expect(text).not.toContain("Brunch");
  });

  test("does not claim a trend with only one saved score", () => {
    const oneScore: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      profile: { ...BASE_CONTEXT.profile, scoreHistory: [{ total: 74, grade: "C", date: "2/1/2026" }] },
    };
    const text = buildAssistantContextText(oneScore);
    expect(text).toContain("only one saved score so far");
    expect(text).toContain("No trend to compare yet.");
  });

  test("lists each firing growth move with its title, why, and the real page/tab the owner actually sees", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(text).toContain("GROWTH MOVES (bring in customers; never change the score):");
    expect(text).toContain("Start a coupon: Give new customers a reason to try you.");
    expect(text).toContain('Where in PostScore: "Growth" page, "Coupons" tab.');
    expect(text).toContain('Where in PostScore: "Pricing" page.');
  });

  test("names the real localized page and tab in Spanish, never an English-only label", () => {
    const text = buildAssistantContextText(BASE_CONTEXT, "es");
    expect(text).toContain('"Crecimiento" page, "Cupones" tab');
    expect(text).toContain('"Precios" page');
  });

  test("names every growth-move destination from the real UI's own labels, for every move id", () => {
    const ids = [
      "start_coupon",
      "start_referral",
      "run_price_check",
      "add_photos_vs_competitors",
      "build_starter_site",
      "improve_website",
    ] as const;
    for (const id of ids) {
      const text = buildAssistantContextText({
        ...BASE_CONTEXT,
        growthMoves: [{ ...BASE_CONTEXT.growthMoves[0], id }],
      });
      // Every move resolves to a real named destination — never an
      // empty label, and never a URL.
      expect(text).toMatch(/Where in PostScore: "[^"]+" page/);
      expect(text).not.toContain("/business/");
    }
  });

  test("states each move's reason as a plain owner-safe fact — no column names, no 'row', no raw URL, no ISO timestamp", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(text).not.toContain("/business/");
    expect(text).not.toContain("pricing_assessed_at");
    expect(text).not.toContain(" row ");
    // No ISO-8601 timestamp anywhere in the rendered context.
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  test("renders a real last-price-check date through the locale's own short-date format", () => {
    const en = buildAssistantContextText(BASE_CONTEXT);
    expect(en).toContain("The last price check in PostScore was run on Sep 24, 2026.");

    const es = buildAssistantContextText(BASE_CONTEXT, "es");
    expect(es).toContain("24 sept 2026");
    expect(es).not.toContain("2026-09-24T16:29:18.231+00:00");
  });

  test("says a price check has never been run, rather than printing a null date", () => {
    const neverRun: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      growthMoves: [{ ...BASE_CONTEXT.growthMoves[1], pricingAssessedAt: null }],
    };
    const text = buildAssistantContextText(neverRun);
    expect(text).toContain("A price check has never been run in PostScore.");
    expect(text).not.toContain("null");
  });

  test("scopes the coupon/referral facts to PostScore, never claiming the owner runs no promotions at all", () => {
    const text = buildAssistantContextText({
      ...BASE_CONTEXT,
      growthMoves: [
        { ...BASE_CONTEXT.growthMoves[0], id: "start_coupon" },
        { ...BASE_CONTEXT.growthMoves[0], id: "start_referral" },
      ],
    });
    expect(text).toContain("No coupon has been created in PostScore yet.");
    expect(text).toContain("PostScore can't see offers run anywhere else");
    expect(text).toContain("No referral program has been set up in PostScore yet.");
  });

  test("carries the same real numbers and labels the photo/website moves are built from", () => {
    const photos = buildAssistantContextText({
      ...BASE_CONTEXT,
      growthMoves: [
        {
          ...BASE_CONTEXT.growthMoves[0],
          id: "add_photos_vs_competitors",
          yourPhotoCount: 4,
          competitorMedianPhotoCount: 9,
        },
      ],
    });
    expect(photos).toContain("This listing has 4 photo(s) on Google");
    expect(photos).toContain("the median among the competitors in the last saved scan is 9");

    const website = buildAssistantContextText({
      ...BASE_CONTEXT,
      growthMoves: [
        {
          ...BASE_CONTEXT.growthMoves[0],
          id: "improve_website",
          weakWebsiteIssueLabels: ["Performance & mobile", "Contact & conversion"],
        },
      ],
    });
    expect(website).toContain("Performance & mobile, Contact & conversion");
  });

  test("always states that growth-move facts describe activity inside PostScore only", () => {
    for (const context of [BASE_CONTEXT, { ...BASE_CONTEXT, growthMoves: [] }]) {
      expect(buildAssistantContextText(context)).toContain(
        "backed by a real fact about activity inside PostScore only"
      );
    }
  });

  test("says plainly when no growth moves are firing, rather than inventing one", () => {
    const noMoves: AssistantBusinessContext = { ...BASE_CONTEXT, growthMoves: [] };
    const text = buildAssistantContextText(noMoves);
    expect(text).toContain("No growth moves are currently firing for this business.");
  });

  test("reports each weekly-routine item as checked or not checked off this week, with the real streak", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(text).toContain("WEEKLY ROUTINE (owner self-reported, resets Mondays):");
    expect(text).toContain("Post an update: checked off this week.");
    expect(text).toContain("Reply to reviews: not checked off this week.");
    expect(text).toContain("Share your review link: not checked off this week.");
    expect(text).toContain("Add a photo: not checked off this week.");
    expect(text).toContain("Check your hours: checked off this week.");
    expect(text).toContain("Streak: 3 consecutive past week(s) fully checked off.");
  });

  test("reports no current streak honestly when there isn't one", () => {
    const noStreak: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      weeklyRoutine: { ...BASE_CONTEXT.weeklyRoutine, streakWeeks: 0 },
    };
    const text = buildAssistantContextText(noStreak);
    expect(text).toContain("No current streak.");
    expect(text).not.toContain("Streak: 0");
  });

  test("always states the weekly routine is owner self-reported and that an unchecked item is never read as 'hasn't done it'", () => {
    for (const context of [
      BASE_CONTEXT,
      { ...BASE_CONTEXT, growthMoves: [] },
      {
        ...BASE_CONTEXT,
        weeklyRoutine: {
          items: BASE_CONTEXT.weeklyRoutine.items.map((item) => ({ ...item, checkedThisWeek: false })),
          streakWeeks: 0,
        },
      },
    ]) {
      const text = buildAssistantContextText(context);
      expect(text).toContain(
        "PostScore cannot see whether they actually posted an update, replied to a review, or added a photo."
      );
      expect(text).toContain('NOT that they haven\'t really done it');
    }
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

  test("only suggests a 'what's changed' prompt when there's real history or fixed items to talk about", () => {
    expect(buildAssistantStarterPrompts(BASE_CONTEXT)).toContain("What's changed since I started?");

    const nothingYet: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      profile: {
        ...BASE_CONTEXT.profile,
        scoreHistory: [{ total: 74, grade: "C", date: "2/1/2026" }],
        fixedItems: [],
      },
    };
    expect(buildAssistantStarterPrompts(nothingYet)).not.toContain("What's changed since I started?");
  });
});

describe("ASSISTANT_SYSTEM_RULES", () => {
  test("explicitly forbids fabricating each of the disclosed-as-unavailable facts", () => {
    for (const phrase of [
      "Individual reviews",
      "search or Google Maps ranking",
      "competitor's exact price",
      "reply-rate/response-time stats",
    ]) {
      expect(ASSISTANT_SYSTEM_RULES).toContain(phrase);
    }
  });

  test("requires general guidance to be labeled with the exact prefix the UI parses", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain('"General guidance:"');
  });

  test("instructs the assistant not to recite panel-visible identity facts back to the owner", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("DON'T RECITE WHAT THE OWNER CAN ALREADY SEE");
    expect(ASSISTANT_SYSTEM_RULES).toContain("What I know about your business");
  });

  test("points the assistant to PostScore's own real tools/pages, never an invented one", () => {
    for (const phrase of [
      "Reviews page",
      "Growth page's Coupons tab",
      "Growth page's Refer a friend tab",
      "the Pricing page",
      "the Competitors page",
      "starter-site builder",
    ]) {
      expect(ASSISTANT_SYSTEM_RULES).toContain(phrase);
    }
    expect(ASSISTANT_SYSTEM_RULES).toContain("never invent a feature, page, or tab that isn't listed here");
  });
});
