import { describe, expect, test } from "vitest";
import {
  ASSISTANT_SYSTEM_RULES,
  anthropicFailureMessage,
  buildAssistantContextText,
  buildAssistantLanguageDirective,
  buildAssistantStarterPrompts,
  buildAssistantSystemPrompt,
  type AssistantBusinessContext,
  type AssistantGrowthMove,
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
    httpsUnreachableReason: null,
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
      { id: "post_update", title: "Post an update", checkedThisWeek: true },
      { id: "reply_reviews", title: "Reply to reviews", checkedThisWeek: false },
      { id: "share_review_link", title: "Share your review link", checkedThisWeek: false },
      { id: "add_photo", title: "Add a photo", checkedThisWeek: false },
      { id: "check_hours", title: "Check your hours", checkedThisWeek: true },
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
    referralOk: true,
    couponPresets: [
      { label: "10% off your next visit", description: "A simple loyalty nudge for returning diners." },
    ],
    referralPresets: [
      { referrerReward: "$10 off your next visit", friendReward: "15% off their first visit", description: "The classic restaurant referral." },
    ],
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
    expect(text).toContain("Review count: 6.9/18 pts — losing 11.1 — 58 reviews on Google (full credit at 150+).");
    expect(text).toContain("Uses HTTPS: 0/6 pts — losing 6 —");
  });

  test("precomputes each losing check's missing points (max - earned) so the model never has to subtract itself", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    // 18 - 6.9 = 11.1, 6 - 0 = 6 — both stated explicitly, never left for
    // the model to compute from the earned/max pair alone.
    expect(text).toContain("losing 11.1");
    expect(text).toContain("losing 6");
    expect(text).toContain('"losing N" is precomputed — never recompute it yourself');
  });

  test("clarifies the real website.performance_mobile check's bare category word so 'average' can't be misread as slow", () => {
    const mobileAverage: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      score: {
        ...BASE_CONTEXT.score,
        losingChecks: [
          {
            checkId: "website.performance_mobile",
            label: "Mobile speed",
            category: "website",
            earnedPoints: 6,
            maxPoints: 10,
            explanation: "Real visitors on phones over the last 28 days (Google Chrome data): average.",
          },
        ],
      },
    };
    const text = buildAssistantContextText(mobileAverage);
    expect(text).toContain(
      "AVERAGE (the middle of Google's three real-visitor bands: fast / average / slow — NOT slow)."
    );
    expect(text).not.toMatch(/:\s*average\.$/m);
  });

  test("clarifies fast/slow the same way, and in Spanish too (rápido/promedio/lento)", () => {
    const mobileSlowEs: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      score: {
        ...BASE_CONTEXT.score,
        losingChecks: [
          {
            checkId: "website.performance_mobile",
            label: "Velocidad móvil",
            category: "website",
            earnedPoints: 0,
            maxPoints: 10,
            explanation: "Visitantes reales en teléfonos durante los últimos 28 días (datos de Google Chrome): lento.",
          },
        ],
      },
    };
    const text = buildAssistantContextText(mobileSlowEs, "es");
    expect(text).toContain("LENTO (la peor de las tres franjas reales de Google: rápido / promedio / lento).");
  });

  test("never clarifies any OTHER check's explanation, even if it happens to end in the word 'average'", () => {
    const otherCheck: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      score: {
        ...BASE_CONTEXT.score,
        losingChecks: [
          {
            checkId: "visibility.rating",
            label: "Star rating",
            category: "visibility",
            earnedPoints: 5,
            maxPoints: 10,
            explanation: "Your rating is currently average.",
          },
        ],
      },
    };
    const text = buildAssistantContextText(otherCheck);
    expect(text).toContain("Your rating is currently average.");
    expect(text).not.toContain("NOT slow");
  });

  test("names excluded (not-yet-scored) checks honestly rather than omitting them", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(text).toContain("not currently scored");
    expect(text).toContain("Mobile-friendly");
  });

  test("rounds every points value to at most 1 decimal, even a raw floating-point sum like 14.399999999999999", () => {
    const floatArtifact: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      score: {
        ...BASE_CONTEXT.score,
        total: 74,
        categories: [
          { id: "visibility", label: "Visibility & Reputation", relativeScore: 62, earnedPoints: 14.399999999999999, possiblePoints: 34.00000000000001 },
        ],
        losingChecks: [
          {
            checkId: "visibility.review_count",
            label: "Review count",
            category: "visibility",
            earnedPoints: 6.999999999999999,
            maxPoints: 18,
            explanation: "58 reviews on Google (full credit at 150+).",
          },
        ],
      },
      actionPlan: {
        topTasks: [
          {
            label: "Uses HTTPS",
            category: "website",
            promisedPoints: 6.000000000000001,
            action: "Move your website to HTTPS.",
            effort: "quick_win",
          },
        ],
      },
      profile: {
        ...BASE_CONTEXT.profile,
        fixedItems: [{ label: "Photos on listing", pointsGained: 5.999999999999999, verifiedAt: "1/15/2026" }],
      },
    };
    const text = buildAssistantContextText(floatArtifact);
    expect(text).not.toContain("14.399999999999999");
    expect(text).not.toContain("34.00000000000001");
    expect(text).not.toContain("6.999999999999999");
    expect(text).not.toContain("6.000000000000001");
    expect(text).not.toContain("5.999999999999999");
    // Each of these is only a hair off a whole number (ordinary binary
    // floating-point error), so Number.isInteger still reads them as
    // non-integers and they round to N.0 — exactly how the UI's own
    // formatPoints would render the same raw values, never a bare
    // integer it didn't actually earn.
    expect(text).toContain("14.4/34.0 pts earned in this category");
    expect(text).toContain("Review count: 7.0/18 pts");
    expect(text).toContain("Uses HTTPS (+6.0 pts");
    expect(text).toContain("Photos on listing (+6.0 pts");
  });

  test("prints a whole-number points value bare, with no trailing .0", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(text).toContain("74/100 (Grade C)");
    expect(text).not.toContain("74.0/100");
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
    expect(text).toContain("it does NOT itself unlock anything yet");
    expect(text).toContain("are ALL still not built/synced (a later update) — this is true connected or not");
  });

  test("says the shareable review link/QR sign never needed a GBP connection at all, connected or not", () => {
    const connected: AssistantBusinessContext = { ...BASE_CONTEXT, gbp: { connected: true } };
    const notConnected: AssistantBusinessContext = { ...BASE_CONTEXT, gbp: { connected: false } };
    expect(buildAssistantContextText(connected)).toContain("never required this connection at all");
    expect(buildAssistantContextText(notConnected)).toContain("with no connection needed at all");
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

  test("notes an owner-corrected business type honestly, including what Google actually detected, when the override DIFFERS from auto-detection", () => {
    const overridden: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      profile: {
        ...BASE_CONTEXT.profile,
        businessType: "Liquor & Wine Store",
        businessTypeId: "default",
        autoDetectedBusinessType: "General Business",
        autoDetectedBusinessTypeId: "default_auto", // deliberately different id from businessTypeId above
        businessTypeOverridden: true,
      },
    };
    const text = buildAssistantContextText(overridden);
    expect(text).toContain('Business type: Liquor & Wine Store (owner-corrected from Google\'s auto-detected "General Business")');
    expect(text).not.toContain("set by the owner; matches Google's category");
  });

  test("says the override MATCHES Google's category, never 'owner-corrected,' when the real override resolves to the SAME profile id auto-detection now does — the real Kimmel & Silverman shape", () => {
    // A real business can have BOTH a genuine manual override AND an
    // improved auto-detection (see Fix D — isLikelyLawFirm in
    // config/bizProfiles.ts) that independently lands on the exact same
    // real profile, from the business's own real secondary Google types
    // (Kimmel & Silverman PC, Delaware Lemon Law Firm: override "lawyer",
    // and its real `categories` array already includes "lawyer" too).
    // "Owner-corrected from Google's auto-detected X" would be
    // literally true but read as if the owner fixed a mistake that no
    // longer exists — this must say the override simply matches,
    // never silently drop the fact that it's still a real override.
    const overriddenMatchingAutoDetect: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      profile: {
        ...BASE_CONTEXT.profile,
        businessType: "Law Firm",
        businessTypeId: "lawyer",
        autoDetectedBusinessType: "Law Firm",
        autoDetectedBusinessTypeId: "lawyer",
        businessTypeOverridden: true,
      },
    };
    const text = buildAssistantContextText(overriddenMatchingAutoDetect);
    expect(text).toContain("Business type: Law Firm (set by the owner; matches Google's category).");
    expect(text).not.toContain("owner-corrected from Google's auto-detected");
    expect(text).not.toContain("Business type: Law Firm (auto-detected from Google's category)");
  });

  test("states plainly why the referral tab isn't available, forbids proactively suggesting it, but allows an honest answer if asked", () => {
    const noReferral: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      profile: { ...BASE_CONTEXT.profile, referralOk: false },
    };
    const text = buildAssistantContextText(noReferral);
    expect(text).toContain('The Growth page\'s "Refer a friend" tab is not offered for this business type');
    expect(text).toContain("referral-fee arrangements are restricted for attorneys under most states' rules of professional conduct");
    expect(text).toContain("Never PROACTIVELY suggest or bring up a referral program for this business");
    expect(text).toContain("If the owner directly asks about setting one up, answer honestly");
    expect(text).toContain("suggest they check their own state bar's rules before running any referral program");
    expect(text).toContain("Give no other legal advice beyond that");
  });

  test("says nothing about referral-tab availability when it IS available, rather than cluttering every context", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(BASE_CONTEXT.profile.referralOk).toBe(true);
    expect(text).not.toContain("Refer a friend\" tab is not offered");
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
        referralOk: true,
        couponPresets: [],
        referralPresets: [],
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

  test("states plainly that score history is totals only, with no reason for a change recorded (BASE_CONTEXT has 2 real entries)", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(text).toContain("Score history is totals only — no reason for any change between scans is recorded.");
  });

  test("lists each firing growth move with its title, why, and the real page/tab the owner actually sees", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(text).toContain('GROWTH MOVES (ways to bring in customers — each one\'s own "Score impact" line below says whether it ALSO affects PostScore; never generalize across all of them):');
    expect(text).toContain("Start a coupon: Give new customers a reason to try you.");
    expect(text).toContain('Where in PostScore: "Growth" page, "Coupons" tab.');
    expect(text).toContain('Where in PostScore: "Pricing" page.');
  });

  test("precomputes each growth move's real Score impact (YES when it overlaps a real losing check, NO otherwise)", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    // BASE_CONTEXT's two growth moves (start_coupon, run_price_check) never overlap score.
    expect(text).toContain("Score impact: NO — this is a customer-getting move only; it does not affect this business's PostScore either way.");

    const withImproveWebsite: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      growthMoves: [
        {
          id: "improve_website",
          title: "Improve your website",
          why: "x",
          pricingAssessedAt: null,
          yourPhotoCount: null,
          competitorMedianPhotoCount: null,
          weakWebsiteIssueLabels: ["Performance & mobile"],
        },
      ],
    };
    const text2 = buildAssistantContextText(withImproveWebsite);
    expect(text2).toContain('Score impact: YES, this one ALSO currently costs real points');
  });

  test("add_photos_vs_competitors' Score impact depends on whether completeness.photos is a real losing check — build_starter_site never overlaps", () => {
    const addPhotosMove: AssistantGrowthMove = {
      id: "add_photos_vs_competitors",
      title: "Add photos",
      why: "x",
      pricingAssessedAt: null,
      yourPhotoCount: 3,
      competitorMedianPhotoCount: 10,
      weakWebsiteIssueLabels: [],
    };

    const photosLosing: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      score: {
        ...BASE_CONTEXT.score,
        losingChecks: [
          { checkId: "completeness.photos", label: "Photos", category: "completeness", earnedPoints: 2, maxPoints: 6, explanation: "x" },
        ],
      },
      growthMoves: [addPhotosMove],
    };
    expect(buildAssistantContextText(photosLosing)).toContain("Score impact: YES, this one ALSO currently costs real points");

    const photosNotLosing: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      score: { ...BASE_CONTEXT.score, losingChecks: [] },
      growthMoves: [addPhotosMove],
    };
    expect(buildAssistantContextText(photosNotLosing)).toContain(
      "Score impact: NO — this is a customer-getting move only"
    );

    const starterSite: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      growthMoves: [
        {
          id: "build_starter_site",
          title: "Build a starter site",
          why: "x",
          pricingAssessedAt: null,
          yourPhotoCount: null,
          competitorMedianPhotoCount: null,
          weakWebsiteIssueLabels: [],
        },
      ],
    };
    expect(buildAssistantContextText(starterSite)).toContain("Score impact: NO — this is a customer-getting move only");
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
    expect(text).toContain('exactly 5 items, logged on the Growth page under "Your weekly routine"');
    expect(text).toContain('a DIFFERENT section from "This week\'s plan," which is the score-based action plan above');
    expect(text).toContain("Post an update: checked off this week.");
    expect(text).toContain("Reply to reviews: not checked off this week.");
    expect(text).toContain("Share your review link: not checked off this week.");
    expect(text).toContain("Add a photo: not checked off this week.");
    expect(text).toContain("Check your hours: checked off this week.");
    expect(text).toContain("Streak: 3 consecutive past week(s) fully checked off.");
  });

  test("states exactly where each weekly-routine item is actually done — four on real Google, one (the review link) inside PostScore", () => {
    const text = buildAssistantContextText(BASE_CONTEXT);
    expect(text).toContain("NOT the same thing as a PostScore coupon/promo");
    expect(text).toContain("PostScore's own real shareable review link/QR code sign, on the Reviews page");
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

  test("states the real photo count plainly when it's below Google's 10-photo API cap", () => {
    const text = buildAssistantContextText({
      ...BASE_CONTEXT,
      listing: { ...BASE_CONTEXT.listing, photoCount: 7 },
    });
    expect(text).toContain("Photos on listing: 7.");
    expect(text).not.toContain("or more");
  });

  test("states the photo count as a lower bound, never an exact number, once it hits Google's 10-photo API cap", () => {
    const text = buildAssistantContextText({
      ...BASE_CONTEXT,
      listing: { ...BASE_CONTEXT.listing, photoCount: 10 },
    });
    expect(text).toContain("Photos on listing: 10 or more");
    expect(text).toContain("Google's own data only shares up to 10 photos per listing in this field, so this is a lower bound, not an exact count");
    // Never a bare "10." immediately after the lower-bound phrasing —
    // i.e. never silently drops back to stating it as an exact count.
    expect(text).not.toMatch(/Photos on listing: 10\./);
  });

  test("the real Blue Bottle Coffee case: an unreachable website is spelled out plainly, never left as a bare status the model could read past", () => {
    const text = buildAssistantContextText({
      ...BASE_CONTEXT,
      listing: { ...BASE_CONTEXT.listing, websitePresent: true, httpsStatus: "unreachable" },
    });
    expect(text).toContain("Reachability on the last check: UNREACHABLE");
    expect(text).toContain('the last check could NOT load this site at all');
    expect(text).toContain('Never call this website "live" or "working"');
  });

  test("never claims live/working for a website whose reachability hasn't even been checked yet", () => {
    const text = buildAssistantContextText({
      ...BASE_CONTEXT,
      listing: { ...BASE_CONTEXT.listing, websitePresent: true, httpsStatus: null },
    });
    expect(text).toContain("not yet checked");
    expect(text).toContain('Never assume or say it\'s "live" or "working."');
  });

  test("a real, successfully-checked HTTPS site is still stated plainly as reachable", () => {
    const text = buildAssistantContextText({
      ...BASE_CONTEXT,
      listing: { ...BASE_CONTEXT.listing, websitePresent: true, httpsStatus: "https" },
    });
    expect(text).toContain("Reachability on the last check: https (the last check reached this site successfully)");
  });

  test("Day 4 Part 3c: a site BLOCKED by its own bot protection is never described as down, and says the site may be fine", () => {
    const text = buildAssistantContextText({
      ...BASE_CONTEXT,
      listing: {
        ...BASE_CONTEXT.listing,
        websitePresent: true,
        httpsStatus: "unreachable",
        httpsUnreachableReason: "blocked_automated_check",
      },
    });
    expect(text).toContain("BLOCKED, not confirmed down");
    expect(text).toContain("The site may be working completely fine for a real customer's browser");
    expect(text).toContain("NEVER say customers can't reach this site or that it's down");
    expect(text).not.toContain("could NOT load this site at all");
  });

  test("Day 4 Part 3c: a site that returned a real HTTP error is distinguished from a confirmed outage", () => {
    const text = buildAssistantContextText({
      ...BASE_CONTEXT,
      listing: {
        ...BASE_CONTEXT.listing,
        websitePresent: true,
        httpsStatus: "unreachable",
        httpsUnreachableReason: "http_error",
      },
    });
    expect(text).toContain("returned an ERROR on the last check (not a confirmed outage)");
    expect(text).toContain("NEVER say customers can't reach this site based on this alone");
  });

  test("Day 4 Part 3c: reason 'down' keeps the original strong 'could NOT load this site at all' wording", () => {
    const text = buildAssistantContextText({
      ...BASE_CONTEXT,
      listing: { ...BASE_CONTEXT.listing, websitePresent: true, httpsStatus: "unreachable", httpsUnreachableReason: "down" },
    });
    expect(text).toContain("UNREACHABLE");
    expect(text).toContain("the last check could NOT load this site at all");
  });

  test("Day 4 Part 3c: the system rules never let 'customers can't reach' be said for a blocked or error reason", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("That CUSTOMERS can't reach a website");
    expect(ASSISTANT_SYSTEM_RULES).toContain('unless REAL DATA CONTEXT\'s "Reachability on the last check" line is UNREACHABLE for the reason "no response at all"');
    expect(ASSISTANT_SYSTEM_RULES).toContain("the site may be working completely fine for customers");
  });

  test("still says honestly when no photo count was returned by Google at all", () => {
    const text = buildAssistantContextText({
      ...BASE_CONTEXT,
      listing: { ...BASE_CONTEXT.listing, photoCount: null },
    });
    expect(text).toContain("Photos on listing: not returned by Google.");
  });
});

describe("buildAssistantStarterPrompts", () => {
  // A real Monday, and the same day 2/4/6/8 weeks later — every helper
  // below that needs "a different week" just offsets by whole weeks
  // from this anchor so the business's real Monday (weekStartFor) moves
  // too.
  const WEEK_1 = new Date("2026-10-05T12:00:00Z");
  const weeksLater = (n: number) => new Date(WEEK_1.getTime() + n * 7 * 24 * 60 * 60 * 1000);

  const SCORE_PROMPTS = [
    "What's hurting my score the most right now?",
    "What are the top 3 things I should fix this week?",
  ];
  const REVIEW_PROMPTS = ["How do I get more Google reviews?", "How do I improve my Google rating?"];
  const GROWTH_OR_ROUTINE_PROMPTS = [
    "What kind of coupon or promo would work for my business?",
    "Should I re-check my prices against competitors?",
    "Should I run a price check against nearby competitors?",
    "What's the fastest way to improve my website?",
    "Do I need a website, and how do I get one?",
    "What photos should I add to my Google listing?",
    "How do I keep my weekly routine going?",
    "What should I do for my weekly routine?",
  ];

  test("only suggests 'what's hurting my score' when a check is actually losing points", () => {
    expect(buildAssistantStarterPrompts(BASE_CONTEXT, "en", WEEK_1)).toContain(SCORE_PROMPTS[0]);

    const nothingLosing: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      score: { ...BASE_CONTEXT.score, losingChecks: [] },
    };
    expect(buildAssistantStarterPrompts(nothingLosing, "en", WEEK_1)).not.toContain(SCORE_PROMPTS[0]);
  });

  test("only suggests 'top 3 things to fix' when there are real open action-plan tasks", () => {
    expect(buildAssistantStarterPrompts(BASE_CONTEXT, "en", WEEK_1)).toContain(SCORE_PROMPTS[1]);

    const noTasks: AssistantBusinessContext = { ...BASE_CONTEXT, actionPlan: { topTasks: [] } };
    expect(buildAssistantStarterPrompts(noTasks, "en", WEEK_1)).not.toContain(SCORE_PROMPTS[1]);
  });

  test("ties the review prompt to whichever of review count/rating is losing more points, and never shows both at once", () => {
    const ratingLosesMore: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      score: {
        ...BASE_CONTEXT.score,
        losingChecks: [
          { checkId: "visibility.rating", label: "Star rating", category: "visibility", earnedPoints: 2, maxPoints: 18, explanation: "x" },
          { checkId: "visibility.review_count", label: "Review count", category: "visibility", earnedPoints: 15, maxPoints: 18, explanation: "x" },
        ],
      },
    };
    const prompts = buildAssistantStarterPrompts(ratingLosesMore, "en", WEEK_1);
    expect(prompts).toContain("How do I improve my Google rating?");
    expect(prompts.filter((p) => REVIEW_PROMPTS.includes(p)).length).toBe(1);
  });

  test("never shows 2 review prompts, even when the top loss is Visibility & Reputation itself (review count)", () => {
    // BASE_CONTEXT's top losing check is visibility.review_count, so
    // "Why is my Visibility & Reputation section losing points?" must
    // be suppressed in favor of the one dedicated review prompt.
    const prompts = buildAssistantStarterPrompts(BASE_CONTEXT, "en", WEEK_1);
    const reviewRelated = prompts.filter(
      (p) => REVIEW_PROMPTS.includes(p) || p === "Why is my Visibility & Reputation section losing points?"
    );
    expect(reviewRelated.length).toBe(1);
  });

  test("falls back to the generic category question when the top loss IS Visibility & Reputation but isn't review count/rating", () => {
    const recencyIsTopLoss: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      score: {
        ...BASE_CONTEXT.score,
        losingChecks: [
          { checkId: "visibility.review_recency", label: "Review recency", category: "visibility", earnedPoints: 0, maxPoints: 4, explanation: "x" },
        ],
      },
    };
    const prompts = buildAssistantStarterPrompts(recencyIsTopLoss, "en", WEEK_1);
    expect(prompts).toContain("Why is my Visibility & Reputation section losing points?");
  });

  test("asks about the real top losing category when it isn't reviews", () => {
    const websiteIsTopLoss: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      score: {
        ...BASE_CONTEXT.score,
        losingChecks: [{ checkId: "website.https", label: "Uses HTTPS", category: "website", earnedPoints: 0, maxPoints: 6, explanation: "x" }],
      },
    };
    expect(buildAssistantStarterPrompts(websiteIsTopLoss, "en", WEEK_1)).toContain(
      "Why is my Website section losing points?"
    );
  });

  test("competitors prompt only appears when a scan has actually been saved", () => {
    expect(buildAssistantStarterPrompts(BASE_CONTEXT, "en", WEEK_1)).toContain(
      "How do I compare to my nearby competitors?"
    );
    const noScan: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      competitors: { available: false, scanAt: null, subjectRank: null, entries: [] },
    };
    expect(buildAssistantStarterPrompts(noScan, "en", WEEK_1)).not.toContain(
      "How do I compare to my nearby competitors?"
    );
  });

  test("one prompt per real fired growth move", () => {
    // BASE_CONTEXT fires start_coupon and run_price_check (already run once).
    const prompts = buildAssistantStarterPrompts(BASE_CONTEXT, "en", WEEK_1);
    expect(prompts).toContain("What kind of coupon or promo would work for my business?");
    expect(prompts).toContain("Should I re-check my prices against competitors?");
  });

  test("a law firm (referral not offered) never gets a referral prompt, even if a referral move somehow fired", () => {
    const lawFirm: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      profile: { ...BASE_CONTEXT.profile, referralOk: false },
      growthMoves: [
        ...BASE_CONTEXT.growthMoves,
        {
          id: "start_referral",
          title: "Start a referral program",
          why: "x",
          pricingAssessedAt: null,
          yourPhotoCount: null,
          competitorMedianPhotoCount: null,
          weakWebsiteIssueLabels: [],
        },
      ],
    };
    const prompts = buildAssistantStarterPrompts(lawFirm, "en", WEEK_1);
    expect(prompts.some((p) => /referral/i.test(p))).toBe(false);
  });

  test("a no-website business gets the 'do I need a website' prompt, never improve_website's wording", () => {
    const noWebsite: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      growthMoves: [
        {
          id: "build_starter_site",
          title: "Build a starter site",
          why: "x",
          pricingAssessedAt: null,
          yourPhotoCount: null,
          competitorMedianPhotoCount: null,
          weakWebsiteIssueLabels: [],
        },
      ],
    };
    const prompts = buildAssistantStarterPrompts(noWebsite, "en", WEEK_1);
    expect(prompts).toContain("Do I need a website, and how do I get one?");
    expect(prompts).not.toContain("What's the fastest way to improve my website?");
  });

  test("an existing website losing points gets the improve_website prompt, never the no-website wording", () => {
    const weakWebsite: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      growthMoves: [
        {
          id: "improve_website",
          title: "Improve your website",
          why: "x",
          pricingAssessedAt: null,
          yourPhotoCount: null,
          competitorMedianPhotoCount: null,
          weakWebsiteIssueLabels: ["Performance & mobile"],
        },
      ],
    };
    const prompts = buildAssistantStarterPrompts(weakWebsite, "en", WEEK_1);
    expect(prompts).toContain("What's the fastest way to improve my website?");
    expect(prompts).not.toContain("Do I need a website, and how do I get one?");
  });

  test("weekly routine: nothing checked off yet gets the 'what should I do' prompt", () => {
    const nothingChecked: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      weeklyRoutine: { items: BASE_CONTEXT.weeklyRoutine.items.map((i) => ({ ...i, checkedThisWeek: false })), streakWeeks: 0 },
    };
    expect(buildAssistantStarterPrompts(nothingChecked, "en", WEEK_1)).toContain(
      "What should I do for my weekly routine?"
    );
  });

  test("weekly routine: a real streak gets the 'keep it going' prompt", () => {
    // BASE_CONTEXT has streakWeeks: 3.
    expect(buildAssistantStarterPrompts(BASE_CONTEXT, "en", WEEK_1)).toContain(
      "How do I keep my weekly routine going?"
    );
  });

  test("the first 3 shown are always different kinds: at most one score question, at most one review question", () => {
    for (let i = 0; i < 8; i++) {
      const first3 = buildAssistantStarterPrompts(BASE_CONTEXT, "en", weeksLater(i)).slice(0, 3);
      expect(first3.filter((p) => SCORE_PROMPTS.includes(p)).length).toBeLessThanOrEqual(1);
      expect(first3.filter((p) => REVIEW_PROMPTS.includes(p)).length).toBeLessThanOrEqual(1);
    }
  });

  test("at least one growth-move-or-routine prompt lands in the first 3 whenever any is eligible", () => {
    for (let i = 0; i < 8; i++) {
      const first3 = buildAssistantStarterPrompts(BASE_CONTEXT, "en", weeksLater(i)).slice(0, 3);
      expect(first3.some((p) => GROWTH_OR_ROUTINE_PROMPTS.includes(p))).toBe(true);
    }
  });

  test("rotation is deterministic: the same real week always returns the same order, a different week returns a different first 3", () => {
    const laterInSameWeek = new Date("2026-10-08T23:00:00Z");
    expect(buildAssistantStarterPrompts(BASE_CONTEXT, "en", WEEK_1)).toEqual(
      buildAssistantStarterPrompts(BASE_CONTEXT, "en", laterInSameWeek)
    );

    const firstThrees = new Set(
      Array.from({ length: 8 }, (_, i) => buildAssistantStarterPrompts(BASE_CONTEXT, "en", weeksLater(i)).slice(0, 3).join("|"))
    );
    expect(firstThrees.size).toBeGreaterThan(1);
  });

  test("never pads below 3 with a signal-less prompt — returns nothing when nothing real qualifies", () => {
    const noRealSignal: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      score: { ...BASE_CONTEXT.score, losingChecks: [] },
      actionPlan: { topTasks: [] },
      growthMoves: [],
      weeklyRoutine: { items: BASE_CONTEXT.weeklyRoutine.items.map((i) => ({ ...i, checkedThisWeek: true })), streakWeeks: 0 },
      competitors: { available: false, scanAt: null, subjectRank: null, entries: [] },
      profile: { ...BASE_CONTEXT.profile, scoreHistory: [{ total: 74, grade: "C", date: "2/1/2026" }], fixedItems: [] },
    };
    expect(buildAssistantStarterPrompts(noRealSignal, "en", WEEK_1)).toEqual([]);
  });

  test("a business with nothing losing and no growth moves still gets a sensible real set from whatever real signal remains", () => {
    const nothingLosingNoMoves: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      score: { ...BASE_CONTEXT.score, losingChecks: [] },
      actionPlan: { topTasks: [] },
      growthMoves: [],
      weeklyRoutine: { items: BASE_CONTEXT.weeklyRoutine.items.map((i) => ({ ...i, checkedThisWeek: false })), streakWeeks: 0 },
    };
    const prompts = buildAssistantStarterPrompts(nothingLosingNoMoves, "en", WEEK_1);
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts).toContain("What should I do for my weekly routine?");
    expect(prompts.some((p) => SCORE_PROMPTS.includes(p) || REVIEW_PROMPTS.includes(p))).toBe(false);
  });

  test("never suggests a question the assistant would have to decline, like a search rank", () => {
    const prompts = buildAssistantStarterPrompts(BASE_CONTEXT, "en", WEEK_1);
    expect(prompts.some((p) => /rank|search position/i.test(p))).toBe(false);
  });

  test("only suggests a 'what's changed' prompt when there's real history or fixed items to talk about", () => {
    expect(buildAssistantStarterPrompts(BASE_CONTEXT, "en", WEEK_1)).toContain("What's changed since I started?");

    const nothingYet: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      profile: { ...BASE_CONTEXT.profile, scoreHistory: [{ total: 74, grade: "C", date: "2/1/2026" }], fixedItems: [] },
    };
    expect(buildAssistantStarterPrompts(nothingYet, "en", WEEK_1)).not.toContain("What's changed since I started?");
  });

  // Regression test for a real bug the live check (scripts/live-check-
  // postai.ts) found: Hudson Shears' starter prompts were IDENTICAL this
  // week and next week, even with 7 real eligible prompts to rotate
  // through. Root cause: the old rotation seeded on
  // Number(weekStartFor(now).replace(/-/g, "")) — the raw YYYY-MM-DD
  // digits — and any 7-day span that stays within one calendar month is
  // a jump of exactly 7 in that number, which collides exactly with
  // `% 7` for a business with exactly 7 eligible candidates (Hudson's
  // real case). Fixed by seeding on a real whole-weeks-since-epoch
  // index instead, which always increments by exactly 1 from one real
  // week to the next (see buildAssistantStarterPrompts's own comment).
  test("rotation bug fix: Hudson Shears' exact real eligible set (7 prompts, no competitor scan, no history, no streak) differs between two real consecutive weeks that stay within the same month", () => {
    const hudsonShears: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      score: {
        ...BASE_CONTEXT.score,
        total: 37,
        grade: "F",
        losingChecks: [
          {
            checkId: "visibility.review_count",
            label: "Review count",
            category: "visibility",
            earnedPoints: 1,
            maxPoints: 18,
            explanation: "10 reviews on Google (full credit at 150+).",
          },
        ],
      },
      actionPlan: {
        topTasks: [
          { label: "Get more reviews", category: "visibility", promisedPoints: 17, action: "Ask for reviews.", effort: "quick_win" },
        ],
      },
      growthMoves: [
        {
          id: "start_coupon",
          title: "Start a coupon",
          why: "x",
          pricingAssessedAt: null,
          yourPhotoCount: 10,
          competitorMedianPhotoCount: null,
          weakWebsiteIssueLabels: [],
        },
        {
          id: "start_referral",
          title: "Start a referral program",
          why: "x",
          pricingAssessedAt: null,
          yourPhotoCount: 10,
          competitorMedianPhotoCount: null,
          weakWebsiteIssueLabels: [],
        },
        {
          id: "run_price_check",
          title: "Run a price check",
          why: "x",
          pricingAssessedAt: null,
          yourPhotoCount: 10,
          competitorMedianPhotoCount: null,
          weakWebsiteIssueLabels: [],
        },
      ],
      weeklyRoutine: {
        items: BASE_CONTEXT.weeklyRoutine.items.map((i) => ({ ...i, checkedThisWeek: false })),
        streakWeeks: 0,
      },
      competitors: { available: false, scanAt: null, subjectRank: null, entries: [] },
      profile: { ...BASE_CONTEXT.profile, referralOk: true, scoreHistory: [], fixedItems: [] },
    };

    const thisWeek = buildAssistantStarterPrompts(hudsonShears, "en", WEEK_1);
    const nextWeek = buildAssistantStarterPrompts(hudsonShears, "en", weeksLater(1));

    expect(thisWeek).toHaveLength(7);
    expect(new Set(thisWeek)).toEqual(
      new Set([
        "What's hurting my score the most right now?",
        "What are the top 3 things I should fix this week?",
        "How do I get more Google reviews?",
        "What kind of coupon or promo would work for my business?",
        "How could a referral program work for my business?",
        "Should I run a price check against nearby competitors?",
        "What should I do for my weekly routine?",
      ])
    );
    // The actual bug: these two were identical before the fix.
    expect(thisWeek).not.toEqual(nextWeek);
    // Still the exact same 7 real candidates either week — only the
    // ORDER (and so which 3 are first) may change.
    expect(new Set(nextWeek)).toEqual(new Set(thisWeek));
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

  test("rule 2 defers to the language directive for a non-English marker, rather than forcing English unconditionally", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("that language has its OWN exact marker text");
    expect(ASSISTANT_SYSTEM_RULES).toContain('never English\'s "General guidance:" in a non-English answer');
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
      // Note: this wording changed from the original "starter-site
      // builder" to the UI's own real label, "starter-site generator"
      // (see dashboard.website.collapsible.title, "Starter website
      // generator") — Day 3 step 2 also split this bullet in two, so
      // the no-website generator and an existing-but-weak website's
      // own score breakdown are never conflated.
      "starter-site generator",
    ]) {
      expect(ASSISTANT_SYSTEM_RULES).toContain(phrase);
    }
    expect(ASSISTANT_SYSTEM_RULES).toContain("never invent a feature, page, or tab that isn't listed here");
  });

  test("points an EXISTING weak website to the Website page's score breakdown, never the no-website starter-site generator", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("An EXISTING website that's losing points");
    expect(ASSISTANT_SYSTEM_RULES).toContain("the Website page's own score breakdown");
    expect(ASSISTANT_SYSTEM_RULES).toContain("never the starter-site generator, which is only for a business with no website at all");
  });

  test("points building a weekly habit to the Growth page's weekly routine checklist", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain('the Growth page\'s "Your weekly routine" checklist');
  });

  test("points 'what should I do this week' to This week's plan, and bigger work to Bigger projects", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain('the Growth page\'s "This week\'s plan"');
    expect(ASSISTANT_SYSTEM_RULES).toContain('"Bigger projects" on the same page');
  });

  test("points adding photos to the Overview page's real Photos check, matching where add_photos_vs_competitors actually sends owners", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain('the Overview page\'s "Photos" check');
    expect(ASSISTANT_SYSTEM_RULES).toContain('"Where your points are"');
  });

  test("never proactively suggests the referral tab when unavailable, but allows an honest answer if the owner asks", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("ONLY when the REAL DATA CONTEXT below doesn't say that tab is unavailable");
    expect(ASSISTANT_SYSTEM_RULES).toContain("never PROACTIVELY suggest or bring up a referral program");
    expect(ASSISTANT_SYSTEM_RULES).toContain("if the owner directly ASKS about one, answer honestly using the real reason given in REAL DATA CONTEXT");
    expect(ASSISTANT_SYSTEM_RULES).toContain("Never give any legal advice beyond what's stated there");
  });

  test("does not default to reviews as the first-listed tool mapping", () => {
    const mappingsBlock = ASSISTANT_SYSTEM_RULES.slice(ASSISTANT_SYSTEM_RULES.indexOf("BE A GUIDE TO POSTSCORE'S OWN TOOLS"));
    const firstBulletIndex = mappingsBlock.indexOf("\n   - ");
    const firstBullet = mappingsBlock.slice(firstBulletIndex, mappingsBlock.indexOf("\n", firstBulletIndex + 1));
    expect(firstBullet.toLowerCase()).not.toContain("review");
  });

  test("rule 8 describes weekly-routine items only as checked/not-checked, never as a real claim about what the owner did", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("WEEKLY ROUTINE: EXACTLY WHAT YOU CAN SEE");
    expect(ASSISTANT_SYSTEM_RULES).toContain('"you\'ve checked off X this week" or "you haven\'t checked off X this week."');
    expect(ASSISTANT_SYSTEM_RULES).toContain("you only ever know whether they logged it, never whether they really did it");
  });

  test("rule 8 explicitly forbids habitual/ongoing-claim phrasings beyond the checkbox itself", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("forbidden phrasings include");
    expect(ASSISTANT_SYSTEM_RULES).toContain('"you\'re already replying,"');
    expect(ASSISTANT_SYSTEM_RULES).toContain('"you\'ve been posting,"');
    expect(ASSISTANT_SYSTEM_RULES).toContain('"you\'re staying on top of,"');
  });

  test("rule 9 requires checking each growth move's own real Score impact line, and forbids a blanket 'none change your score' claim", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain('GROWTH MOVES: CHECK EACH ONE\'S OWN "SCORE IMPACT" LINE — NEVER GENERALIZE');
    expect(ASSISTANT_SYSTEM_RULES).toContain('NEVER state a blanket claim like "none of these change your score"');
    expect(ASSISTANT_SYSTEM_RULES).toContain("if even one of them says YES, that blanket claim is false for the whole list");
    expect(ASSISTANT_SYSTEM_RULES).toContain('never say the owner "doesn\'t run promotions" or "has no referral program"');
  });

  test("rule 9 says real action-plan points DO apply when a growth move's Score impact line says YES", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain('When a move\'s line says YES, quote the real points from its matching losing-check/action-plan entry — never deny or omit them');
  });

  test("rule 10 forbids implying memory of past conversations and requires variety within this one", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("VARIETY, WITHIN THIS CONVERSATION ONLY");
    expect(ASSISTANT_SYSTEM_RULES).toContain("don't imply you remember a past chat");
    expect(ASSISTANT_SYSTEM_RULES).toContain("don't repeat a recommendation you've already given");
    expect(ASSISTANT_SYSTEM_RULES).toContain("at most one review-related suggestion unless they specifically asked about reviews");
  });

  test("rule 10 requires an honest admission when no different real option is left, rather than inventing or repeating one", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("If REAL DATA CONTEXT genuinely has no different real option left to offer, say so honestly");
    expect(ASSISTANT_SYSTEM_RULES).toContain("rather than inventing a new one or just repeating what you already said");
  });

  test("rule 3 forbids stating an exact photo count once REAL DATA CONTEXT already describes it as a capped lower bound", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain('An exact photo count once REAL DATA CONTEXT already describes it as "X or more"');
    expect(ASSISTANT_SYSTEM_RULES).toContain("Google's own data caps there");
  });

  test("rule 7b states how the coupon/referral/reviews/price-check tools actually work, citing the real files, with no automatic tracking claimed", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("HOW POSTSCORE'S TOOLS ACTUALLY WORK");
    expect(ASSISTANT_SYSTEM_RULES).toContain("app/business/[id]/growth/CouponBuilder.tsx");
    expect(ASSISTANT_SYSTEM_RULES).toContain("app/business/[id]/growth/ReferralBuilder.tsx");
    expect(ASSISTANT_SYSTEM_RULES).toContain("app/business/[id]/website-reviews/GetMoreReviews.tsx");
    expect(ASSISTANT_SYSTEM_RULES).toContain("app/actions/pricing.ts");
    expect(ASSISTANT_SYSTEM_RULES).toContain('manually taps "+1 Redeemed"');
    expect(ASSISTANT_SYSTEM_RULES).toContain("no working redeem page behind it");
    expect(ASSISTANT_SYSTEM_RULES).toContain("there is no POS, booking, or automatic detection of any redemption");
    expect(ASSISTANT_SYSTEM_RULES).toContain("There is no trackable link or QR code for referrals at all");
    expect(ASSISTANT_SYSTEM_RULES).toContain("PostScore has no analytics here at all");
    expect(ASSISTANT_SYSTEM_RULES).toContain("never describe any of these four tools doing anything beyond what's stated here");
  });

  test("rule 11 requires quoting points/counts/dates/labels exactly and never recomputing or embellishing", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("QUOTE EXACTLY, NEVER CALCULATE OR EMBELLISH");
    expect(ASSISTANT_SYSTEM_RULES).toContain('never "slower than average," "below average," or "poor" unless REAL DATA CONTEXT itself says so');
    expect(ASSISTANT_SYSTEM_RULES).toContain("never subtract earned from max yourself");
    expect(ASSISTANT_SYSTEM_RULES).toContain("count and list exactly what REAL DATA CONTEXT gives");
  });

  test("rule 5's brevity target now has a concrete hard cap: ~150 words, at most 4 bullets", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("HARD TARGET: under ~150 words, at most 4 bullets");
    expect(ASSISTANT_SYSTEM_RULES).toContain("even then never exceed 4 bullets");
  });

  test("the real Santa Fe case: rule 11 now forbids claiming a coupon/referral/price check is part of the weekly routine", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain(
      "The weekly routine specifically has exactly five possible items (posting an update, replying to reviews, sharing the review link, adding a photo, checking hours)"
    );
    expect(ASSISTANT_SYSTEM_RULES).toContain(
      "a coupon, a referral, a price check, or any other growth move is NEVER part of the weekly routine"
    );
    expect(ASSISTANT_SYSTEM_RULES).toContain('never say or imply anything else is "on," "part of," or "included in" the weekly routine');
  });

  test("rule 12: a review only raises the average when its own stars exceed the CURRENT average — fixes the wrong '4-star reviews will lift it' claim", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("RATING MATH: ONLY A HIGHER-THAN-CURRENT-AVERAGE REVIEW RAISES THE AVERAGE");
    expect(ASSISTANT_SYSTEM_RULES).toContain("a review at or below the current average holds it flat or pulls it down, never up");
    expect(ASSISTANT_SYSTEM_RULES).toContain("say instead that only reviews above the current average would raise it");
  });

  test("rule 1b forbids inventing a cause for a score change — totals only, no reasons recorded", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("Score history is TOTALS ONLY — it never records WHY a score moved between two scans");
    expect(ASSISTANT_SYSTEM_RULES).toContain("NEVER invent or guess a cause unless REAL DATA CONTEXT separately states one");
  });

  test("the law-firm referral restriction extends to coupon ideas — never a referral reward/credit in any form", () => {
    const noReferral: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      profile: { ...BASE_CONTEXT.profile, referralOk: false },
    };
    const text = buildAssistantContextText(noReferral);
    expect(text).toContain("This restriction applies to referral-style incentives in ANY form, not just the Refer a friend tab");
    expect(text).toContain("never suggest a referral reward, a referral credit, or any \"refer a friend\" discount as part of a coupon or promo idea either");
  });

  test("the law-firm restriction now also forbids implying ANY marketing tactic (coupon, promo, ad) is unrestricted or allowed", () => {
    const noReferral: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      profile: { ...BASE_CONTEXT.profile, referralOk: false },
    };
    const text = buildAssistantContextText(noReferral);
    expect(text).toContain(
      'never state or imply that ANY marketing tactic — a coupon, a promo, an ad, or anything else — is unrestricted or definitively allowed'
    );
    expect(text).toContain("attorney advertising rules vary by state bar");
    expect(text).toContain('never say a tactic has "no restrictions" or is simply "fine to do."');
  });

  test("REAL OFFER PRESETS lists this business type's real coupon quick picks, and referral quick picks only when referralOk is true", () => {
    const withReferral = buildAssistantContextText(BASE_CONTEXT);
    expect(withReferral).toContain('REAL OFFER PRESETS (this business type\'s own built-in quick picks');
    expect(withReferral).toContain('"10% off your next visit" — A simple loyalty nudge for returning diners.');
    expect(withReferral).toContain('Referrer gets "$10 off your next visit", friend gets "15% off their first visit"');

    const noReferral: AssistantBusinessContext = {
      ...BASE_CONTEXT,
      profile: { ...BASE_CONTEXT.profile, referralOk: false, referralPresets: [] },
    };
    const withoutReferral = buildAssistantContextText(noReferral);
    expect(withoutReferral).toContain('"10% off your next visit" — A simple loyalty nudge for returning diners.');
    expect(withoutReferral).not.toContain("Referral quick picks");
  });
});

describe("anthropicFailureMessage", () => {
  test("a 401 (auth failure) gets the short, honest, generic unavailable message", () => {
    expect(anthropicFailureMessage(401)).toBe(
      "PostAI isn't available right now. Please try again in a few minutes."
    );
  });

  test("a 500 (server error) gets the same generic unavailable message as a 401", () => {
    expect(anthropicFailureMessage(500)).toBe(anthropicFailureMessage(401));
  });

  test("a 429 (rate limited) gets its own distinct message, never the generic one", () => {
    expect(anthropicFailureMessage(429)).toBe(
      "PostAI is getting a lot of requests right now. Please try again in a minute."
    );
    expect(anthropicFailureMessage(429)).not.toBe(anthropicFailureMessage(401));
  });

  test("never contains the real HTTP status, a request id, or any other technical detail — only ever one of two fixed, reviewed strings", () => {
    for (const status of [401, 403, 404, 429, 500, 503, 0]) {
      const message = anthropicFailureMessage(status);
      expect(message).not.toMatch(/\b\d{3}\b/); // no 3-digit status-looking number anywhere
      expect(message.toLowerCase()).not.toContain("request_id");
      expect(message.toLowerCase()).not.toContain("request-id");
      expect(message.toLowerCase()).not.toContain("error_type");
      expect(message.toLowerCase()).not.toContain("anthropic api");
    }
  });

  test("resolves the Spanish (usted) wording for both the generic and rate-limit cases", () => {
    expect(anthropicFailureMessage(401, "es")).toBe(
      "PostAI no está disponible en este momento. Inténtelo de nuevo en unos minutos."
    );
    expect(anthropicFailureMessage(429, "es")).toBe(
      "PostAI está recibiendo muchas solicitudes en este momento. Inténtelo de nuevo en un minuto."
    );
  });
});

describe("buildAssistantLanguageDirective", () => {
  test("is empty for the default (English) locale — ASSISTANT_SYSTEM_RULES is already English", () => {
    expect(buildAssistantLanguageDirective("en")).toBe("");
  });

  test("instructs the model to answer in Spanish, including translating page/tab names, for es", () => {
    const directive = buildAssistantLanguageDirective("es");
    expect(directive).toContain("Respond in");
    expect(directive).toContain("Spanish");
    expect(directive).toContain("translate every such name");
  });

  test("only the Spanish directive adds the usted-only formality instruction", () => {
    expect(buildAssistantLanguageDirective("es")).toContain('Use the formal "usted" form');
    expect(buildAssistantLanguageDirective("es")).toContain('never "tú"');
  });

  test("the Spanish directive distinguishes puntuación (PostScore score) from calificación (Google rating) and forbids swapping them", () => {
    const directive = buildAssistantLanguageDirective("es");
    expect(directive).toContain('"puntuación" means ONLY the PostScore score');
    expect(directive).toContain('"calificación" means ONLY the Google star rating');
    expect(directive).toContain("Never swap these two terms");
  });

  test("the English directive has no puntuación/calificación note — it's Spanish-specific", () => {
    expect(buildAssistantLanguageDirective("en")).not.toContain("puntuación");
  });

  test("the Spanish directive overrides the general-guidance marker to the real Spanish text, 'Consejo general:' — never the English one", () => {
    const directive = buildAssistantLanguageDirective("es");
    expect(directive).toContain('becomes exactly "Consejo general:" in Spanish');
    expect(directive).toContain('never the English "General guidance:"');
  });

  test("the Spanish directive forbids leaving English jargon (e.g. 'built-in') in an otherwise-Spanish answer", () => {
    const directive = buildAssistantLanguageDirective("es");
    expect(directive).toContain("never leave an English word in place");
    expect(directive).toContain('never "built-in"');
  });

  test("the English directive has neither the marker override nor the anti-jargon note — both are Spanish-specific", () => {
    const directive = buildAssistantLanguageDirective("en");
    expect(directive).not.toContain("Consejo general");
    expect(directive).not.toContain("built-in");
  });
});

describe("buildAssistantSystemPrompt", () => {
  test("concatenates the real rules, the real context text, and the real language directive, in that order", () => {
    const system = buildAssistantSystemPrompt(BASE_CONTEXT, "en");
    expect(system.startsWith(ASSISTANT_SYSTEM_RULES)).toBe(true);
    expect(system).toContain(buildAssistantContextText(BASE_CONTEXT, "en"));
    // English has no language directive to append.
    expect(system).toBe(`${ASSISTANT_SYSTEM_RULES}\n\n${buildAssistantContextText(BASE_CONTEXT, "en")}`);
  });

  test("appends the real Spanish language directive for es, after the rules and context", () => {
    const system = buildAssistantSystemPrompt(BASE_CONTEXT, "es");
    expect(system).toBe(
      `${ASSISTANT_SYSTEM_RULES}\n\n${buildAssistantContextText(BASE_CONTEXT, "es")}${buildAssistantLanguageDirective("es")}`
    );
  });
});
