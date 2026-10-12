import { describe, expect, test } from "vitest";
import {
  CATEGORY_WEIGHTS,
  CHECKS,
  CategoryId,
  MAX_PERFORMANCE_CARRY_FORWARD_MS,
  applyCheckFix,
  businessRowToScoringInput,
  carryForwardMobilePerformance,
  generateSuggestions,
  getScoreWithSuggestions,
  gradeFromTotal,
  scoreBusiness,
  type BusinessScoringInput,
  type MobilePerformanceMeasurement,
  type WebsiteAnalysis,
  type WebsiteTrustAnalysis,
  type WebsiteTrustOverride,
} from "./scoring";
import { DEFAULT_LOCALE, t } from "./i18n";
import { reachabilityReasonMessageKey } from "./websiteReachability";
import { keyForInfoConflict, keyForStaleNotice } from "./websiteTrust";

// A real, fully-good website analysis — see WebsiteAnalysis in
// lib/scoring.ts and lib/websiteAnalysis.ts for how this gets collected
// for a real business. Used by PERFECT_INPUT below.
const GOOD_WEBSITE_ANALYSIS: WebsiteAnalysis = {
  content: {
    hasTitle: true,
    hasMetaDescription: true,
    hasViewportTag: true,
    headingCount: 5,
    visibleTextLength: 900,
    hasPhoneLink: true,
    hasEmailLink: true,
    hasCtaText: true,
    isLikelyClientRenderedShell: false,
    renderedContentSignals: null,
  },
  mobilePerformance: { method: "lab", fieldCategory: null, labScore: 96 },
  mobilePerformanceFailureReason: null,
  contentFetchFailureReason: null,
  httpsUnreachableReason: null,
  screenshotUrl: "https://example.com/screenshot.png",
  additionalPages: [],
  lastScreenshotRefreshAt: "2024-01-01T00:00:00.000Z",
  aboutPresence: { state: "found", url: "https://example.com/about", locatedOnHomepage: false, reason: null, note: null },
  servicesPresence: { state: "found", url: "https://example.com/services", locatedOnHomepage: false, reason: null, note: null },
  websiteTrust: null,
  checkedAt: "2024-01-01T00:00:00.000Z",
};

// A fully-clean site-trust result (Oct 10 detection) — no spam, no
// Safe Browsing threat, every comparable field matches the listing, no
// stale notices, not abandoned. Used by the website-trust describe
// block below to build each specific "one real finding" variant.
const CLEAN_TRUST: WebsiteTrustAnalysis = {
  spamSignals: [],
  safeBrowsingThreat: null,
  safeBrowsingChecked: true,
  infoConflicts: [
    { field: "phone", comparison: "matches", siteValue: "555-5555", googleValue: "555-5555" },
    { field: "address", comparison: "matches", siteValue: "123 Main St", googleValue: "123 Main St" },
    { field: "hours", comparison: "matches", siteValue: "see site", googleValue: "see listing" },
  ],
  staleNotices: [],
  abandonedSignals: { newestDateFound: "2026-01-01", templateLeftovers: [], looksAbandoned: false },
  websiteKind: "independent",
  listingLinkBroken: false,
  checkedAt: "2026-01-01T00:00:00.000Z",
};

// A business where every real, collectible field is present and good —
// including a real, fully-analyzed website (v1.6.0: performance/mobile,
// content depth, and contact/conversion are now real, collected checks,
// not permanent placeholders). Review recency is still NOT_FOUND here
// (it's never collected today), which is itself part of what this suite
// checks.
const PERFECT_INPUT: BusinessScoringInput = {
  rating: 4.9,
  reviewCount: 500,
  mostRecentReviewDaysAgo: null,
  phone: "+1-555-123-4567",
  address: "742 Evergreen Terrace, Springfield",
  openingHours: ["Monday: 9:00 AM – 5:00 PM"],
  website: "https://example.com",
  httpsStatus: "https",
  categories: ["cafe", "coffee_shop"],
  primaryCategory: "Cafe",
  photoCount: 12,
  businessStatus: "OPERATIONAL",
  websiteAnalysis: GOOD_WEBSITE_ANALYSIS,
};

// A realistic partially-filled-out business: has a Google listing with
// some basics, but is missing a website entirely and has weak reviews.
const STRUGGLING_INPUT: BusinessScoringInput = {
  rating: 3.2,
  reviewCount: 6,
  mostRecentReviewDaysAgo: null,
  phone: "+1-555-999-0000",
  address: "10 Market St",
  openingHours: null,
  website: null,
  httpsStatus: null,
  categories: null,
  primaryCategory: "Hardware Store",
  photoCount: 0,
  businessStatus: "OPERATIONAL",
  websiteAnalysis: null,
};

describe("config integrity", () => {
  test("each category's check weights sum to that category's declared weight", () => {
    for (const categoryId of Object.keys(CATEGORY_WEIGHTS) as CategoryId[]) {
      const sum = CHECKS.filter((c) => c.category === categoryId).reduce(
        (s, c) => s + c.maxPoints,
        0
      );
      expect(sum).toBe(CATEGORY_WEIGHTS[categoryId]);
    }
  });

  test("category weights sum to 100 (Oct 10 revision: the 4 new website.* site-trust checks were fit INSIDE Website's existing 30, not added on top — see CATEGORY_WEIGHTS' own doc)", () => {
    const total = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  test("check ids are unique", () => {
    const ids = CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("grade thresholds", () => {
  test.each([
    [100, "A"],
    [90, "A"],
    [89, "B"],
    [80, "B"],
    [79, "C"],
    [70, "C"],
    [69, "D"],
    [60, "D"],
    [59, "F"],
    [0, "F"],
  ] as const)("total %i -> grade %s", (total, grade) => {
    expect(gradeFromTotal(total)).toBe(grade);
  });
});

describe("scoreBusiness determinism", () => {
  test("identical input always produces an identical breakdown", () => {
    const a = scoreBusiness(STRUGGLING_INPUT);
    const b = scoreBusiness({ ...STRUGGLING_INPUT });
    expect(b).toEqual(a);
  });

  test("a business with every determinable check perfect scores 100 / A", () => {
    // PERFECT_INPUT's own shared mobilePerformance.labScore (96, not 100)
    // happens to round to a total of exactly 100 anyway (99.9 -> 100) —
    // overridden to a true 100 here (and websiteTrust filled in clean)
    // so this test asserts what its name says: every determinable check
    // actually perfect, not a rounding coincidence.
    const input: BusinessScoringInput = {
      ...PERFECT_INPUT,
      websiteAnalysis: {
        ...GOOD_WEBSITE_ANALYSIS,
        mobilePerformance: { method: "lab", fieldCategory: null, labScore: 100 },
        websiteTrust: {
          spamSignals: [],
          safeBrowsingThreat: null,
          safeBrowsingChecked: true,
          infoConflicts: [
            { field: "phone", comparison: "matches", siteValue: "555-5555", googleValue: "555-5555" },
            { field: "address", comparison: "matches", siteValue: "123 Main St", googleValue: "123 Main St" },
            { field: "hours", comparison: "matches", siteValue: "see site", googleValue: "see listing" },
          ],
          staleNotices: [],
          abandonedSignals: { newestDateFound: "2026-01-01", templateLeftovers: [], looksAbandoned: false },
          websiteKind: "independent",
          listingLinkBroken: false,
          checkedAt: "2024-01-01T00:00:00.000Z",
        },
      },
    };
    const breakdown = scoreBusiness(input);
    expect(breakdown.total).toBe(100);
    expect(breakdown.grade).toBe("A");
  });
});

describe("confidence-aware scoring", () => {
  test("NOT_FOUND checks carry a null earnedPoints, never a zero", () => {
    const breakdown = scoreBusiness(PERFECT_INPUT);
    const recency = breakdown.checks.find((c) => c.id === "visibility.review_recency")!;
    expect(recency.confidence).toBe("NOT_FOUND");
    expect(recency.earnedPoints).toBeNull();
  });

  test("a verified real zero (no photos) is distinct from NOT_FOUND and does count against the score", () => {
    const input: BusinessScoringInput = { ...PERFECT_INPUT, photoCount: 0 };
    const breakdown = scoreBusiness(input);
    const photos = breakdown.checks.find((c) => c.id === "completeness.photos")!;
    expect(photos.confidence).toBe("VERIFIED");
    expect(photos.earnedPoints).toBe(0);
  });

  test("below Google's photo-count cap, the photos explanation states the real exact count", () => {
    const input: BusinessScoringInput = { ...PERFECT_INPUT, photoCount: 7 };
    const breakdown = scoreBusiness(input);
    const photos = breakdown.checks.find((c) => c.id === "completeness.photos")!;
    expect(photos.explanation).toBe("7 photos on the listing.");
  });

  test("at Google's photo-count cap, the photos explanation says 'or more' rather than an exact count", () => {
    const input: BusinessScoringInput = { ...PERFECT_INPUT, photoCount: 10 };
    const breakdown = scoreBusiness(input);
    const photos = breakdown.checks.find((c) => c.id === "completeness.photos")!;
    expect(photos.explanation).toBe("10 or more photos on the listing.");
    expect(photos.earnedPoints).toBe(4);
  });

  test("a confirmed zero — no reviews, no rating — is scored as a real weakness, never excluded (the v1.4.0 fix)", () => {
    const input: BusinessScoringInput = {
      ...PERFECT_INPUT,
      rating: null,
      reviewCount: null,
    };
    const breakdown = scoreBusiness(input);

    const rating = breakdown.checks.find((c) => c.id === "visibility.rating")!;
    const reviewCount = breakdown.checks.find((c) => c.id === "visibility.review_count")!;
    // A saved business only reaches scoring after a real, successful
    // fetch — so null here is a CONFIRMED zero, not missing data. Both
    // checks are VERIFIED and scored at the floor, never excluded.
    expect(rating.confidence).toBe("VERIFIED");
    expect(rating.earnedPoints).toBe(0);
    expect(reviewCount.confidence).toBe("VERIFIED");
    expect(reviewCount.earnedPoints).toBe(0);

    const visibility = breakdown.categories.find((c) => c.id === "visibility")!;
    // possiblePoints stays real (34, from rating + review_count) — the
    // category is fully determinable, just genuinely scoring zero on
    // its two real-data checks, not renormalized away as unknown.
    expect(visibility.possiblePoints).toBe(34);
    expect(visibility.earnedPoints).toBe(0);
    expect(visibility.relativeScore).toBe(0);

    // THE BUG THIS FIXES: before v1.4.0, both checks went NOT_FOUND, the
    // whole category got excluded, and the score renormalized across
    // just Completeness (30) and Website (30) — a business with zero
    // reviews and no rating could hit 100. Now a perfect listing with no
    // social proof caps well below a passing grade.
    expect(breakdown.total).toBe(60);
    expect(breakdown.grade).toBe("D");
  });

  test("a genuinely inconsistent response — reviews exist but no rating came back — still honestly excludes the rating check", () => {
    const input: BusinessScoringInput = { ...PERFECT_INPUT, rating: null, reviewCount: 25 };
    const breakdown = scoreBusiness(input);
    const rating = breakdown.checks.find((c) => c.id === "visibility.rating")!;
    // A positive confirmed review count with no rating is an
    // unexplainable data inconsistency, not a confirmed zero — this
    // stays excluded, same as before.
    expect(rating.confidence).toBe("NOT_FOUND");
    expect(rating.earnedPoints).toBeNull();
  });

  test("an unrecognized business status is UNCERTAIN, not a failure", () => {
    const input: BusinessScoringInput = { ...PERFECT_INPUT, businessStatus: "SOMETHING_NEW" };
    const breakdown = scoreBusiness(input);
    const status = breakdown.checks.find((c) => c.id === "completeness.business_status")!;
    expect(status.confidence).toBe("UNCERTAIN");
    expect(status.earnedPoints).toBeNull();
  });

  // v1.5.0 replaced website.https's naive "does the URL string start
  // with https://" logic with a real network probe result
  // (httpsStatus, see lib/websiteHttps.ts) — the string itself is never
  // consulted anymore, since Google's listed scheme frequently
  // disagrees with what the site actually serves.
  describe("website.https reads the real probe result, never the URL string", () => {
    test("confirmed https (a live check succeeded over HTTPS) earns full points, VERIFIED", () => {
      // The URL string itself says http:// — exactly the case that used
      // to score wrong — but the real probe confirmed HTTPS works.
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        website: "http://example.com",
        httpsStatus: "https",
      };
      const breakdown = scoreBusiness(input);
      const https = breakdown.checks.find((c) => c.id === "website.https")!;
      expect(https.confidence).toBe("VERIFIED");
      expect(https.earnedPoints).toBe(https.maxPoints);
    });

    test("confirmed http-only (no working https found) scores as missing HTTPS, VERIFIED", () => {
      const input: BusinessScoringInput = { ...PERFECT_INPUT, httpsStatus: "http_only" };
      const breakdown = scoreBusiness(input);
      const https = breakdown.checks.find((c) => c.id === "website.https")!;
      expect(https.confidence).toBe("VERIFIED");
      expect(https.earnedPoints).toBe(0);
    });

    test("a probe that couldn't complete (unreachable) is NOT_FOUND — excluded, never scored as a failure", () => {
      const input: BusinessScoringInput = { ...PERFECT_INPUT, httpsStatus: "unreachable" };
      const breakdown = scoreBusiness(input);
      const https = breakdown.checks.find((c) => c.id === "website.https")!;
      expect(https.confidence).toBe("NOT_FOUND");
      expect(https.earnedPoints).toBeNull();
    });

    test("a website that simply hasn't been checked yet (httpsStatus null) is also NOT_FOUND, not a guess", () => {
      const input: BusinessScoringInput = { ...PERFECT_INPUT, httpsStatus: null };
      const breakdown = scoreBusiness(input);
      const https = breakdown.checks.find((c) => c.id === "website.https")!;
      expect(https.confidence).toBe("NOT_FOUND");
      expect(https.earnedPoints).toBeNull();
    });

    test("simulateFix reaches full points by confirming httpsStatus, without needing to rewrite the URL string", () => {
      const input: BusinessScoringInput = { ...PERFECT_INPUT, httpsStatus: "http_only" };
      const fixed = applyCheckFix(input, "website.https");
      expect(fixed.website).toBe(input.website); // untouched — the real fix is a working endpoint, not a string
      const breakdown = scoreBusiness(fixed);
      const https = breakdown.checks.find((c) => c.id === "website.https")!;
      expect(https.earnedPoints).toBe(https.maxPoints);
    });
  });

  describe("website.about_presence / website.services_presence (Day 4 Step 2c): real three-state detection", () => {
    test("found on a dedicated page: VERIFIED, full point, explanation names the real URL", () => {
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        websiteAnalysis: {
          ...GOOD_WEBSITE_ANALYSIS,
          aboutPresence: { state: "found", url: "https://example.com/about", locatedOnHomepage: false, reason: null, note: null },
        },
      };
      const breakdown = scoreBusiness(input);
      const check = breakdown.checks.find((c) => c.id === "website.about_presence")!;
      expect(check.confidence).toBe("VERIFIED");
      expect(check.earnedPoints).toBe(1);
      expect(check.explanation).toContain("https://example.com/about");
    });

    test("found on the homepage (no dedicated page): VERIFIED, full point, explanation says homepage, not a URL", () => {
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        websiteAnalysis: {
          ...GOOD_WEBSITE_ANALYSIS,
          aboutPresence: { state: "found", url: null, locatedOnHomepage: true, reason: null, note: null },
        },
      };
      const breakdown = scoreBusiness(input);
      const check = breakdown.checks.find((c) => c.id === "website.about_presence")!;
      expect(check.earnedPoints).toBe(1);
      expect(check.explanation.toLowerCase()).toContain("homepage");
    });

    test("a real PDF menu/list: Services is found (note pdf_only) — presence doesn't require readable content", () => {
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        websiteAnalysis: {
          ...GOOD_WEBSITE_ANALYSIS,
          servicesPresence: { state: "found", url: "https://example.com/menu.pdf", locatedOnHomepage: false, reason: null, note: "pdf_only" },
        },
      };
      const breakdown = scoreBusiness(input);
      const check = breakdown.checks.find((c) => c.id === "website.services_presence")!;
      expect(check.confidence).toBe("VERIFIED");
      expect(check.earnedPoints).toBe(1);
      expect(check.explanation).toContain("PDF");
    });

    test("not_found with no note: a real, confirmed zero — VERIFIED, 0/1, counts against the score, honest next-step explanation", () => {
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        websiteAnalysis: {
          ...GOOD_WEBSITE_ANALYSIS,
          aboutPresence: { state: "not_found", url: null, locatedOnHomepage: false, reason: null, note: null },
        },
      };
      const breakdown = scoreBusiness(input);
      const check = breakdown.checks.find((c) => c.id === "website.about_presence")!;
      expect(check.confidence).toBe("VERIFIED");
      expect(check.earnedPoints).toBe(0);
      expect(check.explanation.toLowerCase()).not.toContain("single-page"); // the old, now-inaccurate caveat must be gone
      expect(check.explanation.toLowerCase()).not.toContain("excluded"); // not_found now counts against the score — never say "excluded"
    });

    test("not_found with note 'broken_link': a real, confirmed zero — its own honest explanation naming the broken URL, counts against the score", () => {
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        websiteAnalysis: {
          ...GOOD_WEBSITE_ANALYSIS,
          servicesPresence: { state: "not_found", url: "https://example.com/services", locatedOnHomepage: false, reason: null, note: "broken_link" },
        },
      };
      const breakdown = scoreBusiness(input);
      const check = breakdown.checks.find((c) => c.id === "website.services_presence")!;
      expect(check.confidence).toBe("VERIFIED");
      expect(check.earnedPoints).toBe(0);
      expect(check.explanation).toContain("https://example.com/services");
      expect(check.explanation.toLowerCase()).toContain("broken");
    });

    test("couldnt_check (unlike not_found) is still genuinely excluded — NOT_FOUND, null points, never a zero", () => {
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        websiteAnalysis: {
          ...GOOD_WEBSITE_ANALYSIS,
          aboutPresence: { state: "couldnt_check", url: "https://example.com/about", locatedOnHomepage: false, reason: "down", note: null },
        },
      };
      const breakdown = scoreBusiness(input);
      const check = breakdown.checks.find((c) => c.id === "website.about_presence")!;
      expect(check.confidence).toBe("NOT_FOUND");
      expect(check.earnedPoints).toBeNull();
    });

    test("couldnt_check reuses the SAME shared reachability message key as website.content_depth/contact_conversion's UI wording — never a separate, drifting string", () => {
      for (const reason of ["timed_out", "down", "blocked_automated_check", "http_error"] as const) {
        const input: BusinessScoringInput = {
          ...PERFECT_INPUT,
          websiteAnalysis: {
            ...GOOD_WEBSITE_ANALYSIS,
            aboutPresence: { state: "couldnt_check", url: "https://example.com/about", locatedOnHomepage: false, reason, note: null },
          },
        };
        const breakdown = scoreBusiness(input);
        const aboutCheck = breakdown.checks.find((c) => c.id === "website.about_presence")!;
        expect(aboutCheck.confidence).toBe("NOT_FOUND");
        expect(aboutCheck.earnedPoints).toBeNull();
        // Same shared key WebsiteScoreBreakdown.tsx uses for
        // content_depth/contact_conversion/https — proving about_presence
        // reuses it directly rather than re-implementing its own wording.
        expect(aboutCheck.explanation).toBe(t(DEFAULT_LOCALE, reachabilityReasonMessageKey(reason)));
      }
    });

    test("a row saved before this detection existed (aboutPresence/servicesPresence null): excluded, 'not yet analyzed', never a guessed not_found", () => {
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, aboutPresence: null, servicesPresence: null },
      };
      const breakdown = scoreBusiness(input);
      const about = breakdown.checks.find((c) => c.id === "website.about_presence")!;
      const services = breakdown.checks.find((c) => c.id === "website.services_presence")!;
      expect(about.confidence).toBe("NOT_FOUND");
      expect(about.earnedPoints).toBeNull();
      expect(services.confidence).toBe("NOT_FOUND");
      expect(services.earnedPoints).toBeNull();
    });

    test("simulateFix reaches full points for both checks via a real found result", () => {
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, aboutPresence: null, servicesPresence: null },
      };
      const fixedAbout = applyCheckFix(input, "website.about_presence");
      const fixedServices = applyCheckFix(fixedAbout, "website.services_presence");
      const breakdown = scoreBusiness(fixedServices);
      expect(breakdown.checks.find((c) => c.id === "website.about_presence")!.earnedPoints).toBe(1);
      expect(breakdown.checks.find((c) => c.id === "website.services_presence")!.earnedPoints).toBe(1);
    });

    test("couldnt_check/js_rendered: excluded (NOT_FOUND, null points), its own honest wording — never counted against the score as a guessed zero", () => {
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        websiteAnalysis: {
          ...GOOD_WEBSITE_ANALYSIS,
          aboutPresence: { state: "couldnt_check", url: null, locatedOnHomepage: false, reason: "js_rendered", note: null },
          servicesPresence: { state: "couldnt_check", url: null, locatedOnHomepage: false, reason: "js_rendered", note: null },
        },
      };
      const breakdown = scoreBusiness(input);
      const about = breakdown.checks.find((c) => c.id === "website.about_presence")!;
      const services = breakdown.checks.find((c) => c.id === "website.services_presence")!;
      expect(about.confidence).toBe("NOT_FOUND");
      expect(about.earnedPoints).toBeNull();
      expect(about.explanation.toLowerCase()).toContain("javascript");
      expect(services.confidence).toBe("NOT_FOUND");
      expect(services.earnedPoints).toBeNull();
      expect(services.explanation.toLowerCase()).toContain("javascript");
      // Never the generic reachability wording — js_rendered is a real,
      // different fact (the page loaded fine) from down/timed_out/etc.
      expect(about.explanation.toLowerCase()).not.toContain("blocked");
    });

    test("Services found with note 'online_ordering': VERIFIED, full point, names the real ordering URL, honest about not reading the items", () => {
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        websiteAnalysis: {
          ...GOOD_WEBSITE_ANALYSIS,
          servicesPresence: {
            state: "found",
            url: "https://www.toasttab.com/some-business",
            locatedOnHomepage: false,
            reason: null,
            note: "online_ordering",
          },
        },
      };
      const breakdown = scoreBusiness(input);
      const check = breakdown.checks.find((c) => c.id === "website.services_presence")!;
      expect(check.confidence).toBe("VERIFIED");
      expect(check.earnedPoints).toBe(1);
      expect(check.explanation).toContain("https://www.toasttab.com/some-business");
      expect(check.explanation.toLowerCase()).toContain("can't read");
    });

    test("Services found with note 'image_only': VERIFIED, full point, names the real menu URL, honest about it being an image", () => {
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        websiteAnalysis: {
          ...GOOD_WEBSITE_ANALYSIS,
          servicesPresence: {
            state: "found",
            url: "https://example.com/newark-menus",
            locatedOnHomepage: false,
            reason: null,
            note: "image_only",
          },
        },
      };
      const breakdown = scoreBusiness(input);
      const check = breakdown.checks.find((c) => c.id === "website.services_presence")!;
      expect(check.confidence).toBe("VERIFIED");
      expect(check.earnedPoints).toBe(1);
      expect(check.explanation.toLowerCase()).toContain("image");
    });
  });
});

describe("curve sanity checks", () => {
  test("review count saturates at 150 for full credit", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, reviewCount: 150 });
    const check = breakdown.checks.find((c) => c.id === "visibility.review_count")!;
    expect(check.earnedPoints).toBe(18);
  });

  test("zero reviews earns zero review-count points (but is still VERIFIED, not NOT_FOUND)", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, reviewCount: 0 });
    const check = breakdown.checks.find((c) => c.id === "visibility.review_count")!;
    expect(check.confidence).toBe("VERIFIED");
    expect(check.earnedPoints).toBe(0);
  });

  test("a 0.0 rating earns zero rating points", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, rating: 0 });
    const check = breakdown.checks.find((c) => c.id === "visibility.rating")!;
    expect(check.earnedPoints).toBe(0);
  });
});

describe("suggestion -> projected score guarantee", () => {
  test("generateSuggestions returns suggestions sorted by promisedPoints, highest first", () => {
    const breakdown = scoreBusiness(STRUGGLING_INPUT);
    const suggestions = generateSuggestions(breakdown);
    expect(suggestions.length).toBeGreaterThan(0);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].promisedPoints).toBeGreaterThanOrEqual(suggestions[i].promisedPoints);
    }
  });

  test("every suggestion's promisedPoints equals exactly (check.maxPoints - check.earnedPoints)", () => {
    const { breakdown, suggestions } = getScoreWithSuggestions(STRUGGLING_INPUT);
    for (const suggestion of suggestions) {
      const check = breakdown.checks.find((c) => c.id === suggestion.checkId)!;
      expect(suggestion.promisedPoints).toBe(check.maxPoints - (check.earnedPoints ?? 0));
    }
  });

  test("no suggestions are generated from NOT_FOUND/UNCERTAIN checks", () => {
    const { suggestions } = getScoreWithSuggestions(STRUGGLING_INPUT);
    const recency = suggestions.find((s) => s.checkId === "visibility.review_recency");
    // STRUGGLING_INPUT has no website at all, so the three real website
    // quality checks are honestly excluded (nothing to analyze) rather
    // than suggested — same NOT_FOUND semantics as every other check.
    const performance = suggestions.find((s) => s.checkId === "website.performance_mobile");
    const content = suggestions.find((s) => s.checkId === "website.content_depth");
    const contact = suggestions.find((s) => s.checkId === "website.contact_conversion");
    expect(recency).toBeUndefined();
    expect(performance).toBeUndefined();
    expect(content).toBeUndefined();
    expect(contact).toBeUndefined();
  });

  test("applying every suggestion's fix and re-scoring reproduces projectedBreakdown exactly", () => {
    const { breakdown, suggestions, projectedInput, projectedBreakdown } =
      getScoreWithSuggestions(STRUGGLING_INPUT);
    expect(suggestions.length).toBeGreaterThan(0);

    // Re-derive the "fixed" input independently of getScoreWithSuggestions'
    // own reduce(), by applying applyCheckFix by hand in a different order,
    // and confirm re-scoring it lands on the exact same breakdown. This
    // guards against the projection being a hand-tuned estimate rather
    // than a genuine re-run of the scoring function.
    const manuallyFixedInput = [...suggestions]
      .reverse()
      .reduce((acc, s) => applyCheckFix(acc, s.checkId), STRUGGLING_INPUT);
    const manuallyRescored = scoreBusiness(manuallyFixedInput);

    expect(manuallyRescored).toEqual(projectedBreakdown);
    expect(scoreBusiness(projectedInput)).toEqual(projectedBreakdown);

    // Every check that was flagged as losing points now scores full marks.
    for (const suggestion of suggestions) {
      const fixedCheck = projectedBreakdown.checks.find((c) => c.id === suggestion.checkId)!;
      expect(fixedCheck.earnedPoints).toBe(fixedCheck.maxPoints);
    }

    // The projected score is never worse, and (since this fixture had
    // real deficits) strictly better than the current score.
    expect(projectedBreakdown.total).toBeGreaterThan(breakdown.total);
  });

  test("fixing only Completeness-category suggestions moves the total by exactly the sum of their promised points", () => {
    // Completeness is the one category where none of its checks are
    // permanently NOT_FOUND, so its determinable weight always equals
    // its full 30-point category weight — nothing to renormalize WITHIN
    // the category. A raw completeness point is therefore worth exactly
    // 100/(sum of all CATEGORY_WEIGHTS) of the overall total — a clean
    // 1:1 relationship now that the three category weights sum to 100.
    const input: BusinessScoringInput = {
      ...STRUGGLING_INPUT,
      website: "https://example.com", // hold Website category constant and fully determinable
    };
    const { breakdown, suggestions } = getScoreWithSuggestions(input);
    const completenessSuggestions = suggestions.filter((s) => s.category === "completeness");
    expect(completenessSuggestions.length).toBeGreaterThan(0);

    const fixedInput = completenessSuggestions.reduce(
      (acc, s) => applyCheckFix(acc, s.checkId),
      input
    );
    const fixedBreakdown = scoreBusiness(fixedInput);

    const promisedTotal = completenessSuggestions.reduce((sum, s) => sum + s.promisedPoints, 0);
    expect(promisedTotal).toBeGreaterThan(0);
    expect(fixedBreakdown.total - breakdown.total).toBe(promisedTotal);
  });

  test("honesty check (the v1.5.0 fix): fixing 'has a website' does NOT retroactively verify HTTPS as a side effect", () => {
    // Before v1.5.0, website.https read the `website` string itself, so
    // simulateFix'ing "has a website" to "https://example.com" also
    // silently made HTTPS score VERIFIED and full — a fake, unearned
    // claim, since nothing had actually confirmed the real site
    // (whatever it turns out to be) serves HTTPS. Now that
    // website.https reads only the real probe result (httpsStatus),
    // adding a website string alone must NOT change it: it stays
    // exactly what it was — here, NOT_FOUND, since STRUGGLING_INPUT's
    // httpsStatus is null (never checked) — until an actual network
    // check runs and confirms it. (The total can still move by more
    // than this one check's own promised points, same as before — that
    // renormalization-within-a-category effect is unrelated to this
    // bug and isn't what this test is guarding.)
    const { breakdown, suggestions } = getScoreWithSuggestions(STRUGGLING_INPUT);
    const hasWebsiteSuggestion = suggestions.find((s) => s.checkId === "website.has_website")!;
    expect(hasWebsiteSuggestion).toBeDefined();

    const httpsBefore = breakdown.checks.find((c) => c.id === "website.https")!;
    expect(httpsBefore.confidence).toBe("NOT_FOUND");

    const fixedInput = applyCheckFix(STRUGGLING_INPUT, "website.has_website");
    expect(fixedInput.httpsStatus).toBeNull(); // untouched by this fix — the real bug this closes
    const fixedBreakdown = scoreBusiness(fixedInput);
    const httpsAfter = fixedBreakdown.checks.find((c) => c.id === "website.https")!;
    expect(httpsAfter.confidence).toBe("NOT_FOUND");
    expect(httpsAfter.earnedPoints).toBeNull();

    const actualDelta = fixedBreakdown.total - breakdown.total;
    expect(actualDelta).toBeGreaterThanOrEqual(hasWebsiteSuggestion.promisedPoints);
  });

  test("honesty check (the v1.6.0 fix): fixing 'has a website' does NOT retroactively verify the real website quality checks", () => {
    // Same class of bug as the v1.5.0 fix above, for the three new real
    // checks: simply adding a website string must not make
    // performance_mobile/content_depth/contact_conversion score as if a
    // real analysis had run and found a great site. They must stay
    // NOT_FOUND until a real WebsiteAnalysis is actually present.
    const { suggestions } = getScoreWithSuggestions(STRUGGLING_INPUT);
    const hasWebsiteSuggestion = suggestions.find((s) => s.checkId === "website.has_website")!;
    expect(hasWebsiteSuggestion).toBeDefined();

    const fixedInput = applyCheckFix(STRUGGLING_INPUT, "website.has_website");
    expect(fixedInput.websiteAnalysis).toBeNull(); // untouched by this fix
    const fixedBreakdown = scoreBusiness(fixedInput);
    for (const id of ["website.performance_mobile", "website.content_depth", "website.contact_conversion"]) {
      const check = fixedBreakdown.checks.find((c) => c.id === id)!;
      expect(check.confidence).toBe("NOT_FOUND");
      expect(check.earnedPoints).toBeNull();
    }
  });
});

describe("client-side-rendered shell honesty (the Goldberg Hardware fix)", () => {
  // A real static fetch of a JS-rendered site (e.g. a Nuxt
  // serverRendered:false app) gets back an essentially empty page —
  // every content signal reads exactly like a genuinely bare site would.
  // isLikelyClientRenderedShell is what tells the two apart; these tests
  // pin down that content_depth/contact_conversion treat it as an honest
  // exclusion, never as a scored failure.
  const CSR_SHELL_CONTENT: WebsiteAnalysis = {
    ...GOOD_WEBSITE_ANALYSIS,
    content: {
      hasTitle: true,
      hasMetaDescription: false,
      hasViewportTag: false,
      headingCount: 0,
      visibleTextLength: 0,
      hasPhoneLink: false,
      hasEmailLink: false,
      hasCtaText: false,
      isLikelyClientRenderedShell: true,
      // No PageSpeed recovery for this fixture — see the CSR_RECOVERED_*
      // tests further below for the case where it succeeded.
      renderedContentSignals: null,
    },
  };
  const CSR_SHELL_INPUT: BusinessScoringInput = { ...PERFECT_INPUT, websiteAnalysis: CSR_SHELL_CONTENT };

  test("content_depth excludes itself (NOT_FOUND) rather than scoring an empty shell as a bare page", () => {
    const breakdown = scoreBusiness(CSR_SHELL_INPUT);
    const check = breakdown.checks.find((c) => c.id === "website.content_depth")!;
    expect(check.confidence).toBe("NOT_FOUND");
    expect(check.earnedPoints).toBeNull();
    expect(check.explanation).toContain("renders its content with JavaScript");
    expect(check.explanation).not.toContain("bare landing page");
  });

  test("contact_conversion excludes itself (NOT_FOUND) rather than reporting no contact info found", () => {
    const breakdown = scoreBusiness(CSR_SHELL_INPUT);
    const check = breakdown.checks.find((c) => c.id === "website.contact_conversion")!;
    expect(check.confidence).toBe("NOT_FOUND");
    expect(check.earnedPoints).toBeNull();
    expect(check.explanation).toContain("renders its content with JavaScript");
    expect(check.explanation).not.toContain("no click-to-call");
  });

  test("a CSR-shell exclusion never generates a suggestion (it's excluded, not a fixable failure)", () => {
    const { suggestions } = getScoreWithSuggestions(CSR_SHELL_INPUT);
    expect(suggestions.find((s) => s.checkId === "website.content_depth")).toBeUndefined();
    expect(suggestions.find((s) => s.checkId === "website.contact_conversion")).toBeUndefined();
  });

  test("checks unrelated to content (HTTPS, has-website, performance) still score normally for a CSR-shell site", () => {
    const breakdown = scoreBusiness(CSR_SHELL_INPUT);
    expect(breakdown.checks.find((c) => c.id === "website.has_website")!.confidence).toBe("VERIFIED");
    expect(breakdown.checks.find((c) => c.id === "website.https")!.confidence).toBe("VERIFIED");
    expect(breakdown.checks.find((c) => c.id === "website.performance_mobile")!.confidence).toBe("VERIFIED");
  });

  test("a genuinely bare site (no CSR marker) still scores content_depth/contact_conversion as real failures, not excluded", () => {
    const bareButRealInput: BusinessScoringInput = {
      ...PERFECT_INPUT,
      websiteAnalysis: {
        ...GOOD_WEBSITE_ANALYSIS,
        content: { ...CSR_SHELL_CONTENT.content!, isLikelyClientRenderedShell: false },
      },
    };
    const breakdown = scoreBusiness(bareButRealInput);
    const content = breakdown.checks.find((c) => c.id === "website.content_depth")!;
    const contact = breakdown.checks.find((c) => c.id === "website.contact_conversion")!;
    expect(content.confidence).toBe("VERIFIED");
    expect(content.earnedPoints).toBe(1); // hasTitle: true is the only signal earning points here
    expect(contact.confidence).toBe("VERIFIED");
    expect(contact.earnedPoints).toBe(0);
  });

  test("content_depth scores a CSR site for real once PageSpeed recovers title/meta/viewport/headings, capped at 4.5/6 — never the length points", () => {
    const recoveredInput: BusinessScoringInput = {
      ...PERFECT_INPUT,
      websiteAnalysis: {
        ...GOOD_WEBSITE_ANALYSIS,
        content: {
          ...CSR_SHELL_CONTENT.content!,
          renderedContentSignals: { hasTitle: true, hasMetaDescription: true, hasViewportTag: true, hasHeadings: true },
        },
      },
    };
    const breakdown = scoreBusiness(recoveredInput);
    const content = breakdown.checks.find((c) => c.id === "website.content_depth")!;
    expect(content.confidence).toBe("VERIFIED");
    expect(content.earnedPoints).toBe(4.5); // title 1 + meta 1 + viewport 1.5 + headings 1 — length never credited
    expect(content.explanation).toContain("verified using Google's real rendered-page audit");
    expect(content.explanation).not.toContain("bare landing page");
  });

  test("content_depth reports a PageSpeed-confirmed absence honestly, distinct from an unconfirmed signal", () => {
    const partialInput: BusinessScoringInput = {
      ...PERFECT_INPUT,
      websiteAnalysis: {
        ...GOOD_WEBSITE_ANALYSIS,
        content: {
          ...CSR_SHELL_CONTENT.content!,
          // Lighthouse genuinely found no title, confirmed no meta
          // description, and the viewport audit was missing from the
          // response entirely (e.g. a partial API response) — these two
          // failure modes must read differently.
          renderedContentSignals: { hasTitle: false, hasMetaDescription: false, hasViewportTag: null, hasHeadings: true },
        },
      },
    };
    const breakdown = scoreBusiness(partialInput);
    const content = breakdown.checks.find((c) => c.id === "website.content_depth")!;
    expect(content.earnedPoints).toBe(1); // headings only: 0 + 0 + 0 (unconfirmed viewport) + 1
    expect(content.explanation).toContain("no page title found");
    expect(content.explanation).toContain("no meta description found");
    expect(content.explanation).not.toContain("viewport"); // unconfirmed, not reported as a failure
  });

  test("contact_conversion still fully excludes itself for a CSR site even when content_depth recovered real signals", () => {
    const recoveredInput: BusinessScoringInput = {
      ...PERFECT_INPUT,
      websiteAnalysis: {
        ...GOOD_WEBSITE_ANALYSIS,
        content: {
          ...CSR_SHELL_CONTENT.content!,
          renderedContentSignals: { hasTitle: true, hasMetaDescription: true, hasViewportTag: true, hasHeadings: true },
        },
      },
    };
    const breakdown = scoreBusiness(recoveredInput);
    const contact = breakdown.checks.find((c) => c.id === "website.contact_conversion")!;
    expect(contact.confidence).toBe("NOT_FOUND");
    expect(contact.earnedPoints).toBeNull();
  });
});

describe("businessRowToScoringInput adapter", () => {
  test("maps a saved businesses row into scoring input without inventing data", () => {
    const input = businessRowToScoringInput({
      rating: 4.2,
      review_count: 30,
      phone: "+1-555-000-1111",
      address: "1 First St",
      opening_hours: null,
      website: "https://mybiz.example",
      https_status: "https",
      categories: ["bakery"],
      category: "Bakery",
      photo_count: 4,
      business_status: "OPERATIONAL",
      website_analysis_json: null,
    });
    expect(input.rating).toBe(4.2);
    expect(input.mostRecentReviewDaysAgo).toBeNull();
    expect(input.httpsStatus).toBe("https");
    const breakdown = scoreBusiness(input);
    expect(breakdown.scoringVersion).toBe("1.8.0");
  });

  test("degrades an unexpected https_status value to null (excluded) rather than trusting a bad cast", () => {
    const input = businessRowToScoringInput({
      rating: 4.2,
      review_count: 30,
      phone: null,
      address: null,
      opening_hours: null,
      website: "https://mybiz.example",
      https_status: "totally-not-a-real-value",
      categories: null,
      category: null,
      photo_count: null,
      business_status: null,
      website_analysis_json: null,
    });
    expect(input.httpsStatus).toBeNull();
  });

  test("round-trips a real website_analysis_json value, and degrades a malformed one to null rather than trusting a bad cast", () => {
    const good = businessRowToScoringInput({
      rating: 4.2,
      review_count: 30,
      phone: null,
      address: null,
      opening_hours: null,
      website: "https://mybiz.example",
      https_status: "https",
      categories: null,
      category: null,
      photo_count: null,
      business_status: null,
      website_analysis_json: GOOD_WEBSITE_ANALYSIS,
    });
    expect(good.websiteAnalysis).toEqual(GOOD_WEBSITE_ANALYSIS);

    const malformed = businessRowToScoringInput({
      rating: 4.2,
      review_count: 30,
      phone: null,
      address: null,
      opening_hours: null,
      website: "https://mybiz.example",
      https_status: "https",
      categories: null,
      category: null,
      photo_count: null,
      business_status: null,
      website_analysis_json: { content: "not a real signals object", checkedAt: "2024-01-01T00:00:00.000Z" },
    });
    expect(malformed.websiteAnalysis).toEqual({
      content: null,
      mobilePerformance: null,
      mobilePerformanceFailureReason: null,
      contentFetchFailureReason: null,
      httpsUnreachableReason: null,
      screenshotUrl: null,
      additionalPages: [],
      lastScreenshotRefreshAt: null,
      aboutPresence: null,
      servicesPresence: null,
      websiteTrust: null,
      checkedAt: "2024-01-01T00:00:00.000Z",
    });

    const withTimedOut = businessRowToScoringInput({
      rating: 4.2,
      review_count: 30,
      phone: null,
      address: null,
      opening_hours: null,
      website: "https://mybiz.example",
      https_status: "unreachable",
      categories: null,
      category: null,
      photo_count: null,
      business_status: null,
      website_analysis_json: { ...GOOD_WEBSITE_ANALYSIS, httpsUnreachableReason: "timed_out" },
    });
    // Regression guard: isReachabilityFailureReason used to be missing
    // "timed_out" entirely, silently collapsing a stored timed_out
    // reason back to null on every read — exactly undoing the Day 4
    // Task "timed_out vs down" fix for any row that round-tripped
    // through the database.
    expect(withTimedOut.websiteAnalysis?.httpsUnreachableReason).toBe("timed_out");

    const withMalformedPresence = businessRowToScoringInput({
      rating: 4.2,
      review_count: 30,
      phone: null,
      address: null,
      opening_hours: null,
      website: "https://mybiz.example",
      https_status: "https",
      categories: null,
      category: null,
      photo_count: null,
      business_status: null,
      website_analysis_json: { ...GOOD_WEBSITE_ANALYSIS, aboutPresence: { state: "not_a_real_state" }, servicesPresence: "garbage" },
    });
    expect(withMalformedPresence.websiteAnalysis?.aboutPresence).toBeNull();
    expect(withMalformedPresence.websiteAnalysis?.servicesPresence).toBeNull();

    const missing = businessRowToScoringInput({
      rating: 4.2,
      review_count: 30,
      phone: null,
      address: null,
      opening_hours: null,
      website: "https://mybiz.example",
      https_status: "https",
      categories: null,
      category: null,
      photo_count: null,
      business_status: null,
    });
    expect(missing.websiteAnalysis).toBeNull();
  });
});

// v1.1.0 re-tuned the rating and review-count curves to be more demanding
// (see RATING_CURVE / reviewCountFraction) so that scores actually spread
// out instead of clustering in the high 80s-100s. v1.2.0 went further and
// shifted point ceiling *within* Visibility from the rating check (20->16)
// to the review-count check (14->18) — see RATING_MAX_POINTS /
// REVIEW_COUNT_CHECK_MAX_POINTS — so that two businesses with the same
// rating are meaningfully separated by how many reviews back it up, not
// just marginally. These tests pin down the resulting shape: a 4.0 rating
// should clearly lose points rather than scoring near-full, a handful of
// reviews should earn only a small fraction of that check's points, more
// reviews at an identical rating should move a business by a real margin,
// a realistic "good but not perfect" business should land in the B range,
// and only a business that's strong across rating, review volume, and
// listing/website completeness should reach the 90s.
describe("v1.2.0 curve & weight re-tuning", () => {
  test("a 4.0 rating earns roughly half of the rating check's points, not near-full", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, rating: 4.0 });
    const check = breakdown.checks.find((c) => c.id === "visibility.rating")!;
    expect(check.earnedPoints).toBe(8.8); // 55% of 16 — see RATING_CURVE
  });

  test("a 4.5 rating no longer scores near-full on the rating check", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, rating: 4.5 });
    const check = breakdown.checks.find((c) => c.id === "visibility.rating")!;
    expect(check.earnedPoints).toBe(12.8); // 80% of 16 — see RATING_CURVE
  });

  test("a handful of reviews earns a small fraction of the review-count check", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, reviewCount: 6 });
    const check = breakdown.checks.find((c) => c.id === "visibility.review_count")!;
    // sqrt(6/150) * 18 = 3.6 — well under a quarter credit for a handful
    // of reviews.
    expect(check.earnedPoints).toBe(3.6);
  });

  test("at the same rating, meaningfully more reviews earns a meaningfully higher total", () => {
    const moreReviews = scoreBusiness({ ...PERFECT_INPUT, rating: 5.0, reviewCount: 87 });
    const fewerReviews = scoreBusiness({ ...PERFECT_INPUT, rating: 5.0, reviewCount: 29 });
    expect(moreReviews.total).toBeGreaterThan(fewerReviews.total);
    // The gap should be large enough to matter for ranking — not a
    // rounding-error-sized difference — and in this case actually crosses
    // a letter grade.
    expect(moreReviews.total - fewerReviews.total).toBeGreaterThanOrEqual(5);
    expect(moreReviews.grade).not.toBe(fewerReviews.grade);
  });

  test("a realistically 'average' business (good rating backed by enough reviews to trust it, missing a couple listing items) lands in the B range", () => {
    const input: BusinessScoringInput = {
      ...PERFECT_INPUT,
      rating: 4.5,
      // 45 reviews clears RATING_CONFIDENCE_FULL_AT_REVIEWS (40), so this
      // business's rating isn't also getting confidence-discounted on top
      // of the curve's own demandingness — it's a realistic, established
      // small business, not a thin-sample one.
      reviewCount: 45,
      openingHours: null, // one missing completeness item
    };
    const breakdown = scoreBusiness(input);
    expect(breakdown.total).toBeGreaterThanOrEqual(80);
    expect(breakdown.total).toBeLessThanOrEqual(85);
    expect(breakdown.grade).toBe("B");
  });

  test("a weak business (low rating, very few reviews, incomplete listing) falls to C or below", () => {
    const input: BusinessScoringInput = {
      ...PERFECT_INPUT,
      rating: 3.5,
      reviewCount: 5,
      openingHours: null,
      photoCount: 0,
    };
    const breakdown = scoreBusiness(input);
    expect(breakdown.total).toBeLessThanOrEqual(79);
  });

  test("only a business strong across rating, review volume, and completeness reaches the 90s", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, rating: 4.8, reviewCount: 180 });
    expect(breakdown.total).toBeGreaterThanOrEqual(90);
    expect(breakdown.grade).toBe("A");
  });
});

// v1.3.0 added review-confidence weighting to the rating check: a
// business's star value alone no longer earns full rating points — it
// also needs enough reviews backing it up to be trusted (full confidence
// at RATING_CONFIDENCE_FULL_AT_REVIEWS). This is deliberately a
// different axis from the review-count check (which measures social
// proof volume, saturating much later at 150) — a thin-sample business
// can lose points on both, honestly, for the same real weakness.
describe("v1.3.0 rating confidence weighting", () => {
  const RATING_MAX_POINTS = CHECKS.find((c) => c.id === "visibility.rating")!.maxPoints;
  // Mirrors RATING_CONFIDENCE_FULL_AT_REVIEWS in lib/scoring.ts — not
  // exported (it's an internal curve constant), so pinned here the same
  // way other tests in this file pin internal curve values directly.
  const RATING_CONFIDENCE_FULL_AT_REVIEWS = 40;

  test("a perfect 5.0 rating from only 7 reviews earns well under full rating points", () => {
    const breakdown = scoreBusiness({ ...PERFECT_INPUT, rating: 5.0, reviewCount: 7 });
    const check = breakdown.checks.find((c) => c.id === "visibility.rating")!;
    expect(check.confidence).toBe("VERIFIED");
    // The star value itself is maxed (ratingFraction(5.0) = 1.0), so any
    // shortfall below the 16-point ceiling is purely the confidence
    // discount — not a curve/rounding artifact.
    expect(check.earnedPoints).toBeLessThan(RATING_MAX_POINTS * 0.6);
    expect(check.earnedPoints).toBeGreaterThan(0);
  });

  test("the same 5.0 rating earns full rating points once review count clears the confidence threshold", () => {
    const breakdown = scoreBusiness({
      ...PERFECT_INPUT,
      rating: 5.0,
      reviewCount: RATING_CONFIDENCE_FULL_AT_REVIEWS,
    });
    const check = breakdown.checks.find((c) => c.id === "visibility.rating")!;
    expect(check.earnedPoints).toBe(RATING_MAX_POINTS);
  });

  test("confidence ramps smoothly: more reviews never earns fewer rating points at a fixed star value", () => {
    const counts = [0, 3, 7, 10, 15, 20, 25, 30, 35, 40, 60, 150];
    const points = counts.map(
      (reviewCount) =>
        scoreBusiness({ ...PERFECT_INPUT, rating: 4.7, reviewCount }).checks.find(
          (c) => c.id === "visibility.rating"
        )!.earnedPoints!
    );
    for (let i = 1; i < points.length; i++) {
      expect(points[i]).toBeGreaterThanOrEqual(points[i - 1]);
    }
    // And it's a ramp, not a single jump — points strictly increase
    // somewhere in the middle of the range, not just at the endpoints.
    expect(points[points.length - 1]).toBeGreaterThan(points[0]);
  });

  test("a null review count discounts confidence the same as zero, not the same as full trust", () => {
    const withZero = scoreBusiness({ ...PERFECT_INPUT, rating: 4.9, reviewCount: 0 });
    const withNull = scoreBusiness({ ...PERFECT_INPUT, rating: 4.9, reviewCount: null });
    const zeroCheck = withZero.checks.find((c) => c.id === "visibility.rating")!;
    const nullCheck = withNull.checks.find((c) => c.id === "visibility.rating")!;
    expect(nullCheck.confidence).toBe("VERIFIED");
    expect(nullCheck.earnedPoints).toBe(zeroCheck.earnedPoints);
    expect(nullCheck.earnedPoints).toBeLessThan(RATING_MAX_POINTS);
  });

  test("explanation honestly names the review count while confidence is discounted, and drops the caveat once full", () => {
    const thin = scoreBusiness({ ...PERFECT_INPUT, rating: 5.0, reviewCount: 7 });
    const thinCheck = thin.checks.find((c) => c.id === "visibility.rating")!;
    expect(thinCheck.explanation).toContain("7 review");
    expect(thinCheck.explanation.toLowerCase()).toContain("more reviews");

    const established = scoreBusiness({ ...PERFECT_INPUT, rating: 5.0, reviewCount: 200 });
    const establishedCheck = established.checks.find((c) => c.id === "visibility.rating")!;
    expect(establishedCheck.explanation).toBe("Rated 5.0★ on Google.");
  });

  test("simulateFix for the rating check reaches full points on its own, even starting from zero or null reviews", () => {
    const zeroReviews: BusinessScoringInput = { ...PERFECT_INPUT, rating: 2.0, reviewCount: 0 };
    const fixedFromZero = scoreBusiness(applyCheckFix(zeroReviews, "visibility.rating"));
    expect(fixedFromZero.checks.find((c) => c.id === "visibility.rating")!.earnedPoints).toBe(
      RATING_MAX_POINTS
    );

    const nullReviews: BusinessScoringInput = { ...PERFECT_INPUT, rating: 2.0, reviewCount: null };
    const fixedFromNull = scoreBusiness(applyCheckFix(nullReviews, "visibility.rating"));
    expect(fixedFromNull.checks.find((c) => c.id === "visibility.rating")!.earnedPoints).toBe(
      RATING_MAX_POINTS
    );
  });

  test("simulateFix never lowers an already-sufficient review count", () => {
    const input: BusinessScoringInput = { ...PERFECT_INPUT, rating: 2.0, reviewCount: 500 };
    const fixed = applyCheckFix(input, "visibility.rating");
    expect(fixed.reviewCount).toBe(500);
  });
});

describe("website.performance_mobile: field-vs-lab measurement (Day 3b)", () => {
  function withMeasurement(measurement: WebsiteAnalysis["mobilePerformance"]): BusinessScoringInput {
    return { ...PERFECT_INPUT, websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, mobilePerformance: measurement } };
  }

  test("real-user field data FAST earns the full 5/5, VERIFIED, tagged meta.method 'field'", () => {
    const breakdown = scoreBusiness(withMeasurement({ method: "field", fieldCategory: "FAST", labScore: null }));
    const check = breakdown.checks.find((c) => c.id === "website.performance_mobile")!;
    expect(check.earnedPoints).toBe(5);
    expect(check.confidence).toBe("VERIFIED");
    expect(check.meta).toEqual({ method: "field" });
    expect(check.explanation).toContain("fast");
    expect(check.explanation).toContain("28 days");
  });

  test("real-user field data AVERAGE earns 3/5", () => {
    const breakdown = scoreBusiness(withMeasurement({ method: "field", fieldCategory: "AVERAGE", labScore: null }));
    const check = breakdown.checks.find((c) => c.id === "website.performance_mobile")!;
    expect(check.earnedPoints).toBe(3);
    expect(check.meta).toEqual({ method: "field" });
  });

  test("real-user field data SLOW earns 1/5", () => {
    const breakdown = scoreBusiness(withMeasurement({ method: "field", fieldCategory: "SLOW", labScore: null }));
    const check = breakdown.checks.find((c) => c.id === "website.performance_mobile")!;
    expect(check.earnedPoints).toBe(1);
    expect(check.meta).toEqual({ method: "field" });
  });

  test("a lab measurement (median of 3 runs) keeps the linear score/5 mapping (Step 2d: 6 -> 5), tagged meta.method 'lab'", () => {
    const breakdown = scoreBusiness(withMeasurement({ method: "lab", fieldCategory: null, labScore: 65 }));
    const check = breakdown.checks.find((c) => c.id === "website.performance_mobile")!;
    expect(check.earnedPoints).toBe(3.3);
    expect(check.confidence).toBe("VERIFIED");
    expect(check.meta).toEqual({ method: "lab" });
    expect(check.explanation).toContain("65/100");
    expect(check.explanation).toContain("middle of 3 runs");
  });

  test("no measurement at all (every attempt failed) is NOT_FOUND, excluded, meta null — never a fabricated value", () => {
    const breakdown = scoreBusiness(withMeasurement(null));
    const check = breakdown.checks.find((c) => c.id === "website.performance_mobile")!;
    expect(check.earnedPoints).toBeNull();
    expect(check.confidence).toBe("NOT_FOUND");
    expect(check.meta).toBeNull();
  });

  test("simulateFix reaches the full 5/5 (via a lab measurement — a field FAST now also reaches 5, so either honestly proves the guarantee)", () => {
    const fixed = scoreBusiness(applyCheckFix(withMeasurement(null), "website.performance_mobile"));
    const check = fixed.checks.find((c) => c.id === "website.performance_mobile")!;
    expect(check.earnedPoints).toBe(5);
  });

  // Oct 10 audit fix: PageSpeed carry-forward on a timeout — see
  // carryForwardMobilePerformance's own doc for the real Blue Bottle
  // Coffee case this fixes.
  test("a carried-forward lab measurement still scores normally, but with the honest 'last measured {date}' wording", () => {
    const breakdown = scoreBusiness(
      withMeasurement({ method: "lab", fieldCategory: null, labScore: 27, measuredAt: "2026-10-06T20:40:00.000Z", carriedForward: true })
    );
    const check = breakdown.checks.find((c) => c.id === "website.performance_mobile")!;
    expect(check.earnedPoints).toBe(1.4);
    expect(check.confidence).toBe("VERIFIED");
    expect(check.explanation).toContain("27/100");
    expect(check.explanation.toLowerCase()).toContain("last measured");
    expect(check.explanation).not.toContain("middle of 3 runs"); // the normal wording, replaced
  });

  test("a carried-forward field measurement also gets the 'last measured {date}' wording", () => {
    const breakdown = scoreBusiness(
      withMeasurement({ method: "field", fieldCategory: "SLOW", labScore: null, measuredAt: "2026-09-15T00:00:00.000Z", carriedForward: true })
    );
    const check = breakdown.checks.find((c) => c.id === "website.performance_mobile")!;
    expect(check.earnedPoints).toBe(1);
    expect(check.explanation.toLowerCase()).toContain("last measured");
    expect(check.explanation).not.toContain("28 days"); // the normal field wording, replaced
  });

  test("a FRESH measurement (carriedForward false/absent) never gets the carried-forward wording, even with a real measuredAt", () => {
    const breakdown = scoreBusiness(
      withMeasurement({ method: "lab", fieldCategory: null, labScore: 50, measuredAt: new Date().toISOString() })
    );
    const check = breakdown.checks.find((c) => c.id === "website.performance_mobile")!;
    expect(check.explanation.toLowerCase()).not.toContain("last measured");
    expect(check.explanation).toContain("middle of 3 runs");
  });
});

describe("carryForwardMobilePerformance (Oct 10 audit fix): the real Blue Bottle Coffee case", () => {
  const NOW = new Date("2026-10-09T23:36:35.000Z");
  const RECENT: MobilePerformanceMeasurement = {
    method: "lab",
    fieldCategory: null,
    labScore: 27,
    measuredAt: "2026-10-06T20:40:28.954Z", // ~3 days before NOW
  };

  test("a fresh successful measurement is always used as-is — no carry-forward needed", () => {
    const fresh: MobilePerformanceMeasurement = { method: "lab", fieldCategory: null, labScore: 80, measuredAt: NOW.toISOString() };
    const result = carryForwardMobilePerformance(fresh, null, RECENT, NOW);
    expect(result.mobilePerformance).toEqual(fresh);
    expect(result.mobilePerformanceFailureReason).toBeNull();
  });

  test("the real Blue Bottle case: this scan timed out, a real measurement from 3 days ago exists — reused, marked carriedForward, failure reason cleared", () => {
    const result = carryForwardMobilePerformance(null, { kind: "timed_out", status: null }, RECENT, NOW);
    expect(result.mobilePerformance).toEqual({ ...RECENT, carriedForward: true });
    expect(result.mobilePerformanceFailureReason).toBeNull();
  });

  test("never reuses a measurement older than 30 days — excluded instead, failure reason preserved", () => {
    const stale: MobilePerformanceMeasurement = { ...RECENT, measuredAt: "2026-08-01T00:00:00.000Z" };
    const result = carryForwardMobilePerformance(null, { kind: "timed_out", status: null }, stale, NOW);
    expect(result.mobilePerformance).toBeNull();
    expect(result.mobilePerformanceFailureReason).toEqual({ kind: "timed_out", status: null });
  });

  test("exactly at the 30-day boundary still counts (inclusive)", () => {
    const boundary: MobilePerformanceMeasurement = { ...RECENT, measuredAt: new Date(NOW.getTime() - MAX_PERFORMANCE_CARRY_FORWARD_MS).toISOString() };
    const result = carryForwardMobilePerformance(null, { kind: "timed_out", status: null }, boundary, NOW);
    expect(result.mobilePerformance).not.toBeNull();
  });

  test("never reuses on any OTHER failure kind — only a genuine timeout, never http_error/no_api_key/error", () => {
    for (const failure of [
      { kind: "http_error" as const, status: 500 },
      { kind: "no_api_key" as const, status: null },
      { kind: "error" as const, status: null },
    ]) {
      const result = carryForwardMobilePerformance(null, failure, RECENT, NOW);
      expect(result.mobilePerformance).toBeNull();
      expect(result.mobilePerformanceFailureReason).toEqual(failure);
    }
  });

  test("the real Qamaria Yemeni Coffee Co. case: no failure at all (a genuinely fresh success) — carry-forward never even considered", () => {
    const fresh: MobilePerformanceMeasurement = { method: "lab", fieldCategory: null, labScore: 26, measuredAt: NOW.toISOString() };
    const result = carryForwardMobilePerformance(fresh, null, null, NOW);
    expect(result.mobilePerformance).toEqual(fresh);
  });

  test("no prior measurement at all to reuse: honestly excluded, never fabricated", () => {
    const result = carryForwardMobilePerformance(null, { kind: "timed_out", status: null }, null, NOW);
    expect(result.mobilePerformance).toBeNull();
    expect(result.mobilePerformanceFailureReason).toEqual({ kind: "timed_out", status: null });
  });

  test("a prior measurement with no measuredAt at all (a legacy row) is never reused", () => {
    const legacy: MobilePerformanceMeasurement = { method: "lab", fieldCategory: null, labScore: 50 };
    const result = carryForwardMobilePerformance(null, { kind: "timed_out", status: null }, legacy, NOW);
    expect(result.mobilePerformance).toBeNull();
  });
});

// Oct 10 site-trust detection (PROPOSED weights: website.security=8,
// website.info_consistency=4, website.notice_freshness=3,
// website.site_freshness=3) — see lib/websiteTrust.ts for the pure
// detectors and WebsiteTrustAnalysis's own doc (above) for the frozen
// shape these checks read. Every case here is built from
// PERFECT_INPUT + CLEAN_TRUST with exactly one field perturbed, so each
// test isolates a single real finding.
describe("website trust checks (Oct 10, PROPOSED)", () => {
  function withTrust(trust: WebsiteTrustAnalysis | null, overrides?: BusinessScoringInput["websiteTrustOverrides"]): BusinessScoringInput {
    return {
      ...PERFECT_INPUT,
      websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, websiteTrust: trust },
      websiteTrustOverrides: overrides,
    };
  }

  describe("website.has_website", () => {
    test("no listing website, no verified-elsewhere site -> 0", () => {
      const input: BusinessScoringInput = { ...PERFECT_INPUT, website: null, websiteAnalysis: null };
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.has_website")!;
      expect(check.earnedPoints).toBe(0);
    });

    test("no listing website, but verifiedElsewhereUrl (the real Bánh Mì Boy case) -> full credit", () => {
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        website: null,
        websiteAnalysis: null,
        verifiedElsewhereUrl: "https://banhmiboy.com",
      };
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.has_website")!;
      expect(check.earnedPoints).toBe(4);
      expect(check.explanation).toContain("banhmiboy.com");
    });

    test("a listing website with NO trust data yet falls back to the original simple behavior -> full credit (never regress)", () => {
      const input = withTrust(null);
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.has_website")!;
      expect(check.earnedPoints).toBe(4);
    });

    test("a real 'Page Not Found' listing link, no verified-elsewhere site -> 0", () => {
      const input = withTrust({ ...CLEAN_TRUST, listingLinkBroken: true });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.has_website")!;
      expect(check.earnedPoints).toBe(0);
    });

    test("a real 'Page Not Found' listing link, but verified-elsewhere site exists -> still full credit", () => {
      const input = { ...withTrust({ ...CLEAN_TRUST, listingLinkBroken: true }), verifiedElsewhereUrl: "https://realsite.example" };
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.has_website")!;
      expect(check.earnedPoints).toBe(4);
    });

    test("a multi-business directory (e.g. a Facebook page) never counts as a real site -> 0", () => {
      const input = withTrust({ ...CLEAN_TRUST, websiteKind: "directory" });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.has_website")!;
      expect(check.earnedPoints).toBe(0);
    });

    test("a free website-builder address (e.g. Google Sites) DOES count as the owner's own site -> full credit", () => {
      const input = withTrust({ ...CLEAN_TRUST, websiteKind: "free_builder" });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.has_website")!;
      expect(check.earnedPoints).toBe(4);
      expect(check.explanation.toLowerCase()).toMatch(/free|builder/);
    });

    test("an independent domain, clean trust -> full credit", () => {
      const input = withTrust(CLEAN_TRUST);
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.has_website")!;
      expect(check.earnedPoints).toBe(4);
    });
  });

  describe("completeness.website_link (the real 'does the listing show a URL' fact)", () => {
    test("no website on the listing -> 0", () => {
      const input: BusinessScoringInput = { ...PERFECT_INPUT, website: null, websiteAnalysis: null };
      const check = scoreBusiness(input).checks.find((c) => c.id === "completeness.website_link")!;
      expect(check.earnedPoints).toBe(0);
    });

    test("a website link with no trust data yet -> full credit (never regress)", () => {
      const input = withTrust(null);
      const check = scoreBusiness(input).checks.find((c) => c.id === "completeness.website_link")!;
      expect(check.earnedPoints).toBe(4);
    });

    test("a real 'Page Not Found' listing link -> 0, even though has_website may still score via verifiedElsewhereUrl", () => {
      const input = { ...withTrust({ ...CLEAN_TRUST, listingLinkBroken: true }), verifiedElsewhereUrl: "https://realsite.example" };
      const breakdown = scoreBusiness(input);
      expect(breakdown.checks.find((c) => c.id === "completeness.website_link")!.earnedPoints).toBe(0);
      expect(breakdown.checks.find((c) => c.id === "website.has_website")!.earnedPoints).toBe(4);
    });

    test("a working listing link -> full credit", () => {
      const input = withTrust(CLEAN_TRUST);
      const check = scoreBusiness(input).checks.find((c) => c.id === "completeness.website_link")!;
      expect(check.earnedPoints).toBe(4);
    });
  });

  describe("website.security — PROPOSED heaviest check (hacked/spam + Safe Browsing)", () => {
    test("no website at all -> NOT_FOUND, never penalized", () => {
      const input: BusinessScoringInput = { ...PERFECT_INPUT, website: null, websiteAnalysis: null };
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.security")!;
      expect(check.confidence).toBe("NOT_FOUND");
      expect(check.earnedPoints).toBeNull();
    });

    test("couldn't read/analyze the site -> NOT_FOUND, never penalized", () => {
      const input = withTrust(null);
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.security")!;
      expect(check.confidence).toBe("NOT_FOUND");
      expect(check.earnedPoints).toBeNull();
    });

    test("clean + Safe Browsing actually checked -> full credit, explanation says so", () => {
      const input = withTrust({ ...CLEAN_TRUST, safeBrowsingChecked: true });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.security")!;
      expect(check.earnedPoints).toBe(2);
    });

    test("clean but Safe Browsing was never actually checked (no API key) -> still full credit, different honest explanation", () => {
      const checkedTrue = withTrust({ ...CLEAN_TRUST, safeBrowsingChecked: true });
      const checkedFalse = withTrust({ ...CLEAN_TRUST, safeBrowsingChecked: false });
      const a = scoreBusiness(checkedTrue).checks.find((c) => c.id === "website.security")!;
      const b = scoreBusiness(checkedFalse).checks.find((c) => c.id === "website.security")!;
      expect(a.earnedPoints).toBe(2);
      expect(b.earnedPoints).toBe(2);
      expect(a.explanation).not.toBe(b.explanation);
    });

    test("the real Bánh Mì Boy case: hidden replica-watch spam -> 0, a one-line summary naming the real topic (full evidence lives on the Website page)", () => {
      const input = withTrust({
        ...CLEAN_TRUST,
        spamSignals: [{ category: "replica", matchedPhrase: "replica richard mille", snippet: "...replica richard mille...", suspiciousLinks: ["https://fakewatchz.ru/x"], hidden: true }],
      });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.security")!;
      expect(check.earnedPoints).toBe(0);
      expect(check.explanation).toBe("Spam content found on your site (replica watches) — signs it may be hacked.");
      expect(check.explanation).not.toContain("...replica richard mille...");
      expect(scoreBusiness(input, "es").checks.find((c) => c.id === "website.security")!.explanation).toBe(
        "Se encontró contenido spam en su sitio (relojes de imitación) — señales de que podría estar hackeado."
      );
    });

    test("a real Google Safe Browsing threat -> 0, outranks a plain spam finding in explanation priority", () => {
      const input = withTrust({ ...CLEAN_TRUST, safeBrowsingThreat: { threatFound: true, threatTypes: ["MALWARE"] } });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.security")!;
      expect(check.earnedPoints).toBe(0);
      expect(check.explanation).toContain("MALWARE");
    });

    test("applying this check's simulated fix reaches full credit", () => {
      const input = withTrust({
        ...CLEAN_TRUST,
        spamSignals: [{ category: "replica", matchedPhrase: "replica richard mille", snippet: "x", suspiciousLinks: [], hidden: true }],
      });
      const fixed = applyCheckFix(input, "website.security");
      const check = scoreBusiness(fixed).checks.find((c) => c.id === "website.security")!;
      expect(check.earnedPoints).toBe(2);
    });
  });

  describe("website.info_consistency", () => {
    test("no website -> NOT_FOUND", () => {
      const input: BusinessScoringInput = { ...PERFECT_INPUT, website: null, websiteAnalysis: null };
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.info_consistency")!;
      expect(check.confidence).toBe("NOT_FOUND");
    });

    test("no trust data yet -> NOT_FOUND", () => {
      const input = withTrust(null);
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.info_consistency")!;
      expect(check.confidence).toBe("NOT_FOUND");
    });

    test("nothing comparable at all on the site (every field not_found_on_site) -> NOT_FOUND, never penalized", () => {
      const input = withTrust({
        ...CLEAN_TRUST,
        infoConflicts: [
          { field: "phone", comparison: "not_found_on_site", siteValue: null, googleValue: "555-5555" },
          { field: "address", comparison: "not_found_on_site", siteValue: null, googleValue: "123 Main St" },
          { field: "hours", comparison: "not_found_on_site", siteValue: null, googleValue: null },
        ],
      });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.info_consistency")!;
      expect(check.confidence).toBe("NOT_FOUND");
      expect(check.earnedPoints).toBeNull();
    });

    test("every determinable field matches -> full credit", () => {
      const input = withTrust(CLEAN_TRUST);
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.info_consistency")!;
      expect(check.earnedPoints).toBe(1);
    });

    test("a real phone conflict against the listing -> partial credit naming both values", () => {
      const input = withTrust({
        ...CLEAN_TRUST,
        infoConflicts: [
          { field: "phone", comparison: "conflicts", siteValue: "555-0000", googleValue: "555-5555" },
          { field: "address", comparison: "matches", siteValue: "123 Main St", googleValue: "123 Main St" },
          { field: "hours", comparison: "matches", siteValue: "see site", googleValue: "see listing" },
        ],
      });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.info_consistency")!;
      expect(check.earnedPoints).toBeCloseTo(1 * (2 / 3), 1);
      expect(check.explanation).toContain("555-0000");
      expect(check.explanation).toContain("555-5555");
    });

    test("owner override on a conflict removes its penalty, labeled as overridden", () => {
      const conflict: WebsiteTrustAnalysis["infoConflicts"][number] = { field: "phone", comparison: "conflicts", siteValue: "555-0000", googleValue: "555-5555" };
      const input = withTrust(
        { ...CLEAN_TRUST, infoConflicts: [conflict, ...CLEAN_TRUST.infoConflicts.slice(1)] },
        [{ key: keyForInfoConflict(conflict), note: "Still accurate — new second line.", overriddenAt: "2026-01-01T00:00:00.000Z" } satisfies WebsiteTrustOverride]
      );
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.info_consistency")!;
      expect(check.earnedPoints).toBe(1);
    });
  });

  describe("website.notice_freshness", () => {
    test("no website -> NOT_FOUND", () => {
      const input: BusinessScoringInput = { ...PERFECT_INPUT, website: null, websiteAnalysis: null };
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.notice_freshness")!;
      expect(check.confidence).toBe("NOT_FOUND");
    });

    test("no trust data yet -> NOT_FOUND", () => {
      const input = withTrust(null);
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.notice_freshness")!;
      expect(check.confidence).toBe("NOT_FOUND");
    });

    test("no stale notices -> full credit", () => {
      const input = withTrust(CLEAN_TRUST);
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.notice_freshness")!;
      expect(check.earnedPoints).toBe(0.5);
    });

    test("the real Bánh Mì Boy case: a past-dated 'CLOSED July 4th to 8th!!!' notice -> 0, exact text shown", () => {
      const input = withTrust({ ...CLEAN_TRUST, staleNotices: [{ text: "CLOSED July 4th to 8th!!!", resolvedDate: "2026-07-04" }] });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.notice_freshness")!;
      expect(check.earnedPoints).toBe(0);
      expect(check.explanation).toContain("CLOSED July 4th to 8th!!!");
    });

    test("owner override on the exact notice removes its penalty", () => {
      const notice = { text: "CLOSED July 4th to 8th!!!", resolvedDate: "2026-07-04" };
      const input = withTrust(
        { ...CLEAN_TRUST, staleNotices: [notice] },
        [{ key: keyForStaleNotice(notice), note: "Still accurate.", overriddenAt: "2026-01-01T00:00:00.000Z" }]
      );
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.notice_freshness")!;
      expect(check.earnedPoints).toBe(0.5);
    });

    test("the real stored raw window is shown trimmed to whole sentences — starts at 'CLOSED', never mid-word", () => {
      const raw = "ion. Finding great. CLOSED July 4th to 8th!!! Open Daily: Monday - Sunday: 11am - 7pm / (302) 525-2018 Facebook Twitter";
      const input = withTrust({ ...CLEAN_TRUST, staleNotices: [{ text: raw, resolvedDate: "2026-07-04" }] });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.notice_freshness")!;
      expect(check.explanation).toContain('"CLOSED July 4th to 8th!!!"');
      expect(check.explanation).not.toContain("ion. Finding great");
      expect(check.explanation).not.toContain("Facebook Twitter");
    });

    test("trimming is display-only: an override keyed by the stored raw text still matches", () => {
      const notice = { text: "ion. Finding great. CLOSED July 4th to 8th!!! Open Daily", resolvedDate: "2026-07-04" };
      const input = withTrust(
        { ...CLEAN_TRUST, staleNotices: [notice] },
        [{ key: keyForStaleNotice(notice), note: "Still accurate.", overriddenAt: "2026-01-01T00:00:00.000Z" }]
      );
      expect(scoreBusiness(input).checks.find((c) => c.id === "website.notice_freshness")!.earnedPoints).toBe(0.5);
    });
  });

  describe("website.site_freshness", () => {
    test("no website -> NOT_FOUND", () => {
      const input: BusinessScoringInput = { ...PERFECT_INPUT, website: null, websiteAnalysis: null };
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.site_freshness")!;
      expect(check.confidence).toBe("NOT_FOUND");
    });

    test("no trust data yet -> NOT_FOUND", () => {
      const input = withTrust(null);
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.site_freshness")!;
      expect(check.confidence).toBe("NOT_FOUND");
    });

    test("not abandoned -> full credit", () => {
      const input = withTrust(CLEAN_TRUST);
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.site_freshness")!;
      expect(check.earnedPoints).toBe(0.5);
    });

    test("the real Bánh Mì Boy case: a 'Please put widget here' template leftover -> 0, named in the explanation", () => {
      const input = withTrust({
        ...CLEAN_TRUST,
        abandonedSignals: { newestDateFound: "2012-07-11", templateLeftovers: ["please put widget here"], looksAbandoned: true },
      });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.site_freshness")!;
      expect(check.earnedPoints).toBe(0);
      expect(check.explanation).toContain("please put widget here");
    });

    test("abandoned via an old date alone (no template leftovers) -> 0, the date itself is named", () => {
      const input = withTrust({
        ...CLEAN_TRUST,
        abandonedSignals: { newestDateFound: "2015-03-01", templateLeftovers: [], looksAbandoned: true },
      });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.site_freshness")!;
      expect(check.earnedPoints).toBe(0);
      expect(check.explanation).toContain("2015-03-01");
    });
  });

  // The real Bánh Mì Boy case: no website on the Google listing at all,
  // but a real site exists and was analyzed via verifiedElsewhereUrl —
  // these 4 checks must still run against it, not go NOT_FOUND just
  // because input.website itself is empty (the same fallback
  // website.has_website already had).
  describe("the 4 new trust checks also run when verifiedElsewhereUrl is set, even with no listing website", () => {
    function withVerifiedElsewhere(trust: WebsiteTrustAnalysis): BusinessScoringInput {
      return {
        ...PERFECT_INPUT,
        website: null,
        verifiedElsewhereUrl: "https://banhmiboy.com",
        websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, websiteTrust: trust },
      };
    }

    test("website.security finds real spam even with no listing website", () => {
      const input = withVerifiedElsewhere({
        ...CLEAN_TRUST,
        spamSignals: [{ category: "replica", matchedPhrase: "replica richard mille", snippet: "x", suspiciousLinks: [], hidden: true }],
      });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.security")!;
      expect(check.confidence).toBe("VERIFIED");
      expect(check.earnedPoints).toBe(0);
    });

    test("website.info_consistency still compares real fields with no listing website", () => {
      const input = withVerifiedElsewhere(CLEAN_TRUST);
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.info_consistency")!;
      expect(check.confidence).toBe("VERIFIED");
      expect(check.earnedPoints).toBe(1);
    });

    test("website.notice_freshness still finds a real stale notice with no listing website", () => {
      const input = withVerifiedElsewhere({ ...CLEAN_TRUST, staleNotices: [{ text: "CLOSED July 4th to 8th!!!", resolvedDate: "2026-07-04" }] });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.notice_freshness")!;
      expect(check.confidence).toBe("VERIFIED");
      expect(check.earnedPoints).toBe(0);
    });

    test("website.site_freshness still finds real abandoned signals with no listing website", () => {
      const input = withVerifiedElsewhere({
        ...CLEAN_TRUST,
        abandonedSignals: { newestDateFound: "2012-07-11", templateLeftovers: ["please put widget here"], looksAbandoned: true },
      });
      const check = scoreBusiness(input).checks.find((c) => c.id === "website.site_freshness")!;
      expect(check.confidence).toBe("VERIFIED");
      expect(check.earnedPoints).toBe(0);
    });

    test("without verifiedElsewhereUrl AND no listing website, all 4 stay honestly NOT_FOUND", () => {
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        website: null,
        verifiedElsewhereUrl: null,
        websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, websiteTrust: CLEAN_TRUST },
      };
      const breakdown = scoreBusiness(input);
      for (const id of ["website.security", "website.info_consistency", "website.notice_freshness", "website.site_freshness"]) {
        expect(breakdown.checks.find((c) => c.id === id)!.confidence).toBe("NOT_FOUND");
      }
    });
  });

  // Decision (Oct 11): a verified-elsewhere site is scored EXACTLY like a
  // listing website by every website.* check — the real Bánh Mì Boy case,
  // whose https/speed/content/contact/About/Services were all measured
  // but previously excluded. completeness.website_link still reflects
  // only the LISTING's own URL, so it stays 0.
  describe("a verified-elsewhere site gets every website check, scored like a listing website", () => {
    const QUALITY_CHECKS = [
      "website.https",
      "website.performance_mobile",
      "website.content_depth",
      "website.contact_conversion",
      "website.about_presence",
      "website.services_presence",
    ];
    const listingInput: BusinessScoringInput = {
      ...PERFECT_INPUT,
      websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, websiteTrust: CLEAN_TRUST },
    };
    const verifiedInput: BusinessScoringInput = {
      ...listingInput,
      website: null,
      verifiedElsewhereUrl: "https://banhmiboy.com",
    };

    test("all 6 quality checks are scored (never NOT_FOUND) for a verified-elsewhere site", () => {
      const breakdown = scoreBusiness(verifiedInput);
      for (const id of QUALITY_CHECKS) {
        expect(breakdown.checks.find((c) => c.id === id)!.confidence, id).not.toBe("NOT_FOUND");
      }
    });

    test("every website.* check scores identically to the same site on the listing", () => {
      const listing = scoreBusiness(listingInput);
      const verified = scoreBusiness(verifiedInput);
      for (const check of listing.checks.filter((c) => c.id.startsWith("website."))) {
        const other = verified.checks.find((c) => c.id === check.id)!;
        expect(other.earnedPoints, check.id).toBe(check.earnedPoints);
        expect(other.confidence, check.id).toBe(check.confidence);
      }
    });

    test("completeness.website_link stays 0 — the listing itself still has no URL", () => {
      expect(scoreBusiness(listingInput).checks.find((c) => c.id === "completeness.website_link")!.earnedPoints).toBe(4);
      expect(scoreBusiness(verifiedInput).checks.find((c) => c.id === "completeness.website_link")!.earnedPoints).toBe(0);
    });

    test("no listing website AND no verified site: all 6 quality checks stay honestly NOT_FOUND", () => {
      const breakdown = scoreBusiness({ ...verifiedInput, verifiedElsewhereUrl: null });
      for (const id of QUALITY_CHECKS) {
        expect(breakdown.checks.find((c) => c.id === id)!.confidence, id).toBe("NOT_FOUND");
      }
    });

    test("listing-only business is unaffected by verifiedElsewhereUrl being absent vs null", () => {
      const withoutField: BusinessScoringInput = { ...listingInput };
      delete withoutField.verifiedElsewhereUrl;
      expect(scoreBusiness(withoutField)).toEqual(scoreBusiness({ ...listingInput, verifiedElsewhereUrl: null }));
    });
  });
});

// Step 2d: a blocked/failed page fetch means the page-content checks
// have nothing real to judge — "couldn't check", never a pass.
describe("blocked page = couldn't check (the real Wonder case)", () => {
  const BLOCKED_TRUST: WebsiteTrustAnalysis = {
    spamSignals: [],
    safeBrowsingThreat: null,
    safeBrowsingChecked: false,
    infoConflicts: [],
    staleNotices: [],
    abandonedSignals: { newestDateFound: null, templateLeftovers: [], looksAbandoned: false },
    websiteKind: "independent",
    listingLinkBroken: false,
    checkedAt: "2026-10-11T00:00:00.000Z",
  };
  const PAGE_CHECKS = ["website.security", "website.info_consistency", "website.notice_freshness", "website.site_freshness"];

  for (const reason of ["blocked_automated_check", "timed_out", "down", "http_error"] as const) {
    test(`${reason}: all 4 page-content trust checks are excluded with the stored reason`, () => {
      const input: BusinessScoringInput = {
        ...PERFECT_INPUT,
        websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, content: null, contentFetchFailureReason: reason, websiteTrust: BLOCKED_TRUST },
      };
      const breakdown = scoreBusiness(input);
      for (const id of PAGE_CHECKS) {
        const check = breakdown.checks.find((c) => c.id === id)!;
        expect(check.earnedPoints, id).toBeNull();
        expect(check.confidence, id).toBe("NOT_FOUND");
      }
      const expected = {
        blocked_automated_check: "Your site blocked our automated check",
        timed_out: "our check timed out",
        down: "Your site didn't respond",
        http_error: "Your site returned an error",
      }[reason];
      expect(breakdown.checks.find((c) => c.id === "website.security")!.explanation).toContain(expected);
    });
  }

  test("ES uses the same usted reason sentence", () => {
    const input: BusinessScoringInput = {
      ...PERFECT_INPUT,
      websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, content: null, contentFetchFailureReason: "blocked_automated_check", websiteTrust: BLOCKED_TRUST },
    };
    expect(scoreBusiness(input, "es").checks.find((c) => c.id === "website.site_freshness")!.explanation).toContain(
      "Su sitio bloqueó nuestra verificación automática"
    );
  });

  test("a real Google Safe Browsing threat still counts even when the page was blocked", () => {
    const input: BusinessScoringInput = {
      ...PERFECT_INPUT,
      websiteAnalysis: {
        ...GOOD_WEBSITE_ANALYSIS,
        content: null,
        contentFetchFailureReason: "blocked_automated_check",
        websiteTrust: { ...BLOCKED_TRUST, safeBrowsingChecked: true, safeBrowsingThreat: { threatFound: true, threatTypes: ["MALWARE"] } },
      },
    };
    const check = scoreBusiness(input).checks.find((c) => c.id === "website.security")!;
    expect(check.earnedPoints).toBe(0);
    expect(check.confidence).toBe("VERIFIED");
  });

  test("a page that loaded still scores normally", () => {
    const input: BusinessScoringInput = { ...PERFECT_INPUT, websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, websiteTrust: { ...BLOCKED_TRUST, infoConflicts: [{ field: "phone", comparison: "matches", siteValue: "1", googleValue: "1" }] } } };
    const breakdown = scoreBusiness(input);
    expect(breakdown.checks.find((c) => c.id === "website.security")!.earnedPoints).toBe(2);
    expect(breakdown.checks.find((c) => c.id === "website.site_freshness")!.earnedPoints).toBe(0.5);
  });
});

describe("Step 2d additions: Website weights, social links, map evidence, contact page link", () => {
  test("Website still totals 30: mobile speed 5 + social links 1", () => {
    const website = scoreBusiness(PERFECT_INPUT).categories.find((c) => c.id === "website")!;
    expect(website.checks.reduce((sum, c) => sum + c.maxPoints, 0)).toBe(30);
    expect(website.checks.find((c) => c.id === "website.performance_mobile")!.maxPoints).toBe(5);
    expect(website.checks.find((c) => c.id === "website.social_links")!.maxPoints).toBe(1);
  });

  function withContent(extra: Partial<NonNullable<WebsiteAnalysis["content"]>>, analysis: Partial<WebsiteAnalysis> = {}): BusinessScoringInput {
    return { ...PERFECT_INPUT, websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, ...analysis, content: { ...GOOD_WEBSITE_ANALYSIS.content!, ...extra } } };
  }
  const social = (input: BusinessScoringInput, locale: "en" | "es" = "en") => scoreBusiness(input, locale).checks.find((c) => c.id === "website.social_links")!;

  test("profiles found -> 1 pt, evidence lists them (EN + ES)", () => {
    const input = withContent({ socialProfiles: [{ platform: "Instagram", url: "instagram.com/mainstreetsweets" }] });
    expect(social(input).earnedPoints).toBe(1);
    expect(social(input).explanation).toBe("Social profiles linked from your site: Instagram: instagram.com/mainstreetsweets.");
    expect(social(input, "es").explanation).toContain("Perfiles sociales enlazados desde su sitio: Instagram: instagram.com/mainstreetsweets");
  });
  test("none found -> 0 with a short fix line", () => {
    const check = social(withContent({ socialProfiles: [] }));
    expect(check.earnedPoints).toBe(0);
    expect(check.explanation).toContain("add them to your header or footer");
  });
  test("page blocked -> couldn't check, excluded", () => {
    const check = social(withContent({}, { content: null, contentFetchFailureReason: "blocked_automated_check" }));
    expect(check.earnedPoints).toBeNull();
    expect(check.confidence).toBe("NOT_FOUND");
  });
  test("a row saved before detection existed is 'not checked yet', never 'none found'", () => {
    const check = social(withContent({ socialProfiles: undefined }));
    expect(check.earnedPoints).toBeNull();
    expect(check.explanation).toContain("Not checked yet");
  });
  test("a JavaScript-rendered shell with no readable links is excluded", () => {
    expect(social(withContent({ socialProfiles: [], isLikelyClientRenderedShell: true })).earnedPoints).toBeNull();
  });

  test("a link to the site's own contact page counts for contact_conversion", () => {
    const check = scoreBusiness(withContent({ hasPhoneLink: false, hasEmailLink: false, hasContactPageLink: true, hasCtaText: true })).checks.find(
      (c) => c.id === "website.contact_conversion"
    )!;
    expect(check.earnedPoints).toBe(3);
  });

  test("an address from the map on the website says so in the evidence", () => {
    const trust = (address: WebsiteTrustAnalysis["infoConflicts"][number]): WebsiteTrustAnalysis => ({
      spamSignals: [],
      safeBrowsingThreat: null,
      safeBrowsingChecked: false,
      infoConflicts: [{ field: "phone", comparison: "matches", siteValue: "1", googleValue: "1" }, address],
      staleNotices: [],
      abandonedSignals: { newestDateFound: null, templateLeftovers: [], looksAbandoned: false },
      websiteKind: "independent",
      listingLinkBroken: false,
      checkedAt: "2026-10-11T00:00:00Z",
    });
    const conflict = scoreBusiness(
      withContent({}, { websiteTrust: trust({ field: "address", comparison: "conflicts", siteValue: "45 market st", googleValue: "209 E Main St", source: "map" }) })
    ).checks.find((c) => c.id === "website.info_consistency")!;
    expect(conflict.explanation).toBe("The map on your website shows 45 market st; Google says 209 E Main St.");
    const match = scoreBusiness(
      withContent({}, { websiteTrust: trust({ field: "address", comparison: "matches", siteValue: "209 e main", googleValue: "209 E Main St", source: "map" }) })
    ).checks.find((c) => c.id === "website.info_consistency")!;
    expect(match.explanation).toContain("(address from the map on your website)");
  });
});

describe("Step 2d: sites that block automated checks — mobile speed couldn't check", () => {
  const field = { method: "field" as const, fieldCategory: "SLOW" as const, labScore: null };
  for (const [name, analysis] of [
    ["bot-blocked fetch", { contentFetchFailureReason: "blocked_automated_check" as const, content: null }],
    ["automated-only error page", { websiteTrust: { ...CLEAN_TRUST, automatedErrorPageUrl: "https://x.com/404" } }],
  ] as const) {
    test(`${name}: no rating of any kind is used — excluded, with the honest text (EN + ES)`, () => {
      for (const mobilePerformance of [field, { ...field, carriedForward: true, measuredAt: "2026-10-01T00:00:00Z" }, { method: "lab" as const, fieldCategory: null, labScore: 80 }]) {
        const input: BusinessScoringInput = { ...PERFECT_INPUT, websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, ...analysis, mobilePerformance } };
        const check = scoreBusiness(input).checks.find((c) => c.id === "website.performance_mobile")!;
        expect(check.earnedPoints).toBeNull();
        expect(check.confidence).toBe("NOT_FOUND");
        expect(check.explanation).toBe("Couldn't check — this site blocks automated checks, so we can't measure its speed. Excluded from your score, not counted against you.");
        expect(scoreBusiness(input, "es").checks.find((c) => c.id === "website.performance_mobile")!.explanation).toContain("bloquea las verificaciones automáticas");
      }
    });
  }
  test("a site our fetch can read still scores speed normally", () => {
    const input: BusinessScoringInput = { ...PERFECT_INPUT, websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, mobilePerformance: field } };
    expect(scoreBusiness(input).checks.find((c) => c.id === "website.performance_mobile")!.earnedPoints).toBe(1);
  });
});

describe("Step 2d: excludedReason 'unreachable' only for couldn't-reach exclusions", () => {
  const reasonOf = (input: BusinessScoringInput, id: string) => scoreBusiness(input).checks.find((c) => c.id === id)!.excludedReason;
  test("bot-blocked page: page-content checks are 'unreachable'", () => {
    const input: BusinessScoringInput = {
      ...PERFECT_INPUT,
      httpsStatus: "unreachable",
      websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, content: null, contentFetchFailureReason: "blocked_automated_check", websiteTrust: CLEAN_TRUST },
    };
    for (const id of ["website.https", "website.performance_mobile", "website.content_depth", "website.security", "website.social_links"]) {
      expect(reasonOf(input, id), id).toBe("unreachable");
    }
    expect(reasonOf(input, "website.has_website")).toBeUndefined();
  });
  test("'not checked yet' (social) and 'nothing to compare' (listing match) are not", () => {
    const input: BusinessScoringInput = {
      ...PERFECT_INPUT,
      websiteAnalysis: {
        ...GOOD_WEBSITE_ANALYSIS,
        content: { ...GOOD_WEBSITE_ANALYSIS.content!, socialProfiles: undefined },
        websiteTrust: { ...CLEAN_TRUST, infoConflicts: [] },
      },
    };
    expect(scoreBusiness(input).checks.find((c) => c.id === "website.social_links")!.earnedPoints).toBeNull();
    expect(reasonOf(input, "website.social_links")).toBe("not_checked_yet");
    expect(reasonOf(input, "website.info_consistency")).toBeUndefined();
  });
  test("JavaScript-only site: content checks are 'unreachable'", () => {
    const input: BusinessScoringInput = {
      ...PERFECT_INPUT,
      websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, content: { ...GOOD_WEBSITE_ANALYSIS.content!, isLikelyClientRenderedShell: true, socialProfiles: [] } },
    };
    expect(reasonOf(input, "website.content_depth")).toBe("unreachable");
  });
});

describe("Step 2d: JavaScript-only sites — trust checks couldn't check (the Goldberg Hardware case)", () => {
  const jsOnly = (trust: WebsiteTrustAnalysis): BusinessScoringInput => ({
    ...PERFECT_INPUT,
    websiteAnalysis: { ...GOOD_WEBSITE_ANALYSIS, content: { ...GOOD_WEBSITE_ANALYSIS.content!, isLikelyClientRenderedShell: true, socialProfiles: [] }, websiteTrust: trust },
  });
  test("security, listing match, notices and freshness are excluded, never a pass (EN + ES), and count as unreachable", () => {
    const input = jsOnly(CLEAN_TRUST);
    for (const id of ["website.security", "website.info_consistency", "website.notice_freshness", "website.site_freshness"]) {
      const check = scoreBusiness(input).checks.find((c) => c.id === id)!;
      expect(check.earnedPoints, id).toBeNull();
      expect(check.explanation, id).toBe("Couldn't check — this site builds its content with JavaScript, so our check couldn't read it. Excluded from your score, not counted against you.");
      expect(check.excludedReason, id).toBe("unreachable");
    }
    expect(scoreBusiness(input, "es").checks.find((c) => c.id === "website.site_freshness")!.explanation).toContain("construye su contenido con JavaScript");
  });
  test("a real Google Safe Browsing threat still counts", () => {
    const check = scoreBusiness(jsOnly({ ...CLEAN_TRUST, safeBrowsingChecked: true, safeBrowsingThreat: { threatFound: true, threatTypes: ["MALWARE"] } })).checks.find(
      (c) => c.id === "website.security"
    )!;
    expect(check.earnedPoints).toBe(0);
  });
});
