import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  DEFAULT_PLACES_ONBOARDING_MONTHLY_CAP,
  ONBOARDING_CALL_KINDS,
  ONBOARDING_LOOKUPS_PER_DAY,
  onboardingCallRows,
  onboardingDecision,
  placesOnboardingMonthlyCap,
  WORST_CASE_PICK_CALLS,
  WORST_CASE_SEARCH_CALLS,
  lookupBlockedMessage,
} from "./onboardingLookupBudget";
import { BILLED_DETAILS_KINDS } from "./placesDetailsBudget";
import { MAX_FALLBACK_SEARCHES } from "./google/businessSearch";

describe("onboarding lookup: counting every Google call", () => {
  test("Text Search, Geocode and Details each get their own row; nothing for 0 calls", () => {
    expect(onboardingCallRows({ textSearch: 3, details: 2, geocode: 1 })).toEqual([
      { kind: "onboarding_search", calls: 3 },
      { kind: "onboarding_geocode", calls: 1 },
      { kind: "onboarding", calls: 2 },
    ]);
    expect(onboardingCallRows({ textSearch: 1, details: 0, geocode: 0 })).toEqual([{ kind: "onboarding_search", calls: 1 }]);
    expect(onboardingCallRows({ textSearch: 0, details: 0, geocode: 0 })).toEqual([]);
  });

  test("all three kinds count against the onboarding ceiling, and none against the re-scan Details cap", () => {
    expect([...ONBOARDING_CALL_KINDS].sort()).toEqual(["onboarding", "onboarding_geocode", "onboarding_search"]);
    for (const kind of ONBOARDING_CALL_KINDS) expect(BILLED_DETAILS_KINDS as readonly string[]).not.toContain(kind);
  });

  test("the worst case matches findBusiness: 1 + fallbacks Text Searches, 1 Geocode, 3 Details", () => {
    expect(WORST_CASE_SEARCH_CALLS).toBe(1 + MAX_FALLBACK_SEARCHES + 1 + 3);
    expect(WORST_CASE_PICK_CALLS).toBe(1);
  });

  test("the route logs every call kind, even when Google failed, and checks before calling Google", () => {
    const src = readFileSync("app/api/places/lookup/route.ts", "utf8");
    expect(src).toContain("logOnboardingCalls(result.paidCalls");
    expect(src).toMatch(/finally \{[\s\S]*logOnboardingCalls\(\{ textSearch: 0, details: 1, geocode: 0 \}\)/);
    expect(src).not.toContain("logPlacesDetailsCall");
    // The gate runs before each Google call.
    expect(src.indexOf("gate(user.id, WORST_CASE_PICK_CALLS)")).toBeLessThan(src.indexOf("lookupBusinessByPlaceId(placeId"));
    expect(src.indexOf("gate(user.id, WORST_CASE_SEARCH_CALLS)")).toBeLessThan(src.indexOf("await findBusiness("));
    // The lookup is marked before Google is called (so parallel requests count).
    expect(src.indexOf("await recordOnboardingLookup(userId)")).toBeLessThan(src.indexOf("lookupBusinessByPlaceId(placeId"));
  });
});

describe("onboarding lookup: its own monthly ceiling", () => {
  const cap = 300;
  test("PLACES_ONBOARDING_MONTHLY_CAP, default 300", () => {
    expect(placesOnboardingMonthlyCap({})).toBe(DEFAULT_PLACES_ONBOARDING_MONTHLY_CAP);
    expect(DEFAULT_PLACES_ONBOARDING_MONTHLY_CAP).toBe(300);
    expect(placesOnboardingMonthlyCap({ PLACES_ONBOARDING_MONTHLY_CAP: "50" })).toBe(50);
    expect(placesOnboardingMonthlyCap({ PLACES_ONBOARDING_MONTHLY_CAP: "nope" })).toBe(300);
    expect(placesOnboardingMonthlyCap({ PLACES_ONBOARDING_MONTHLY_CAP: "-1" })).toBe(300);
  });

  test("a lookup runs only when its worst case still fits", () => {
    expect(onboardingDecision({ usedThisMonth: 293, cap, worstCase: WORST_CASE_SEARCH_CALLS, lookupsToday: 0 })).toBe("ok");
    expect(onboardingDecision({ usedThisMonth: 294, cap, worstCase: WORST_CASE_SEARCH_CALLS, lookupsToday: 0 })).toBe("busy");
    // Picking from the list needs room for just 1.
    expect(onboardingDecision({ usedThisMonth: 299, cap, worstCase: WORST_CASE_PICK_CALLS, lookupsToday: 0 })).toBe("ok");
    expect(onboardingDecision({ usedThisMonth: 300, cap, worstCase: WORST_CASE_PICK_CALLS, lookupsToday: 0 })).toBe("busy");
    expect(onboardingDecision({ usedThisMonth: 0, cap: 0, worstCase: 1, lookupsToday: 0 })).toBe("busy");
  });

  test("a count that can't be read blocks (never calls Google blind)", () => {
    expect(onboardingDecision({ usedThisMonth: null, cap, worstCase: 1, lookupsToday: 0 })).toBe("busy");
  });

  test("onboarding is no longer 'never blocked' by the Details cap logic", () => {
    const src = readFileSync("lib/placesDetailsBudget.ts", "utf8");
    expect(src).toMatch(/NEVER_BLOCKED[^\n]*new Set<PlacesDetailsKind>\(\["photos"\]\)/);
  });
});

describe("onboarding lookup: per-user daily limit", () => {
  test("20 lookups in any 24 hours, then 'rate_limited'", () => {
    expect(ONBOARDING_LOOKUPS_PER_DAY).toBe(20);
    expect(onboardingDecision({ usedThisMonth: 0, cap: 300, worstCase: 7, lookupsToday: 19 })).toBe("ok");
    expect(onboardingDecision({ usedThisMonth: 0, cap: 300, worstCase: 7, lookupsToday: 20 })).toBe("rate_limited");
    expect(onboardingDecision({ usedThisMonth: 0, cap: 300, worstCase: 7, lookupsToday: 3, perDay: 3 })).toBe("rate_limited");
  });

  test("the ceiling wins over the per-user limit; before the SQL is run the limit is skipped", () => {
    expect(onboardingDecision({ usedThisMonth: 300, cap: 300, worstCase: 1, lookupsToday: 25 })).toBe("busy");
    expect(onboardingDecision({ usedThisMonth: 0, cap: 300, worstCase: 1, lookupsToday: null })).toBe("ok");
  });

  test("friendly messages, EN + ES; other errors are left alone", () => {
    expect(lookupBlockedMessage({ status: "error", code: "busy" }, "en")).toBe("Search is busy right now — please try again later.");
    expect(lookupBlockedMessage({ status: "error", code: "rate_limited" }, "en")).toBe("You've reached today's search limit — please try again tomorrow.");
    expect(lookupBlockedMessage({ status: "error", code: "busy" }, "es")).toBe("La búsqueda está ocupada en este momento; inténtelo de nuevo más tarde.");
    expect(lookupBlockedMessage({ status: "error", code: "rate_limited" }, "es")).toBe("Alcanzó el límite de búsquedas de hoy; inténtelo de nuevo mañana.");
    expect(lookupBlockedMessage({ status: "error", message: "x" }, "en")).toBeNull();
    expect(lookupBlockedMessage(null, "en")).toBeNull();
  });
});

describe("L13: the dev lookup page", () => {
  test("is not found outside development", () => {
    const src = readFileSync("app/dev/places-lookup/page.tsx", "utf8");
    expect(src).toMatch(/if \(process\.env\.NODE_ENV !== "development"\) notFound\(\);/);
  });
});
