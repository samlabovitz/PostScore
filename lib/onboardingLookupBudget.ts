// The onboarding lookup's own Google budget (app/api/places/lookup — adding
// a business). Pure.
//
// Every Google call it makes is logged in places_calls under its own kinds
// (Details "onboarding", Text Search "onboarding_search", Geocode
// "onboarding_geocode") and counted against PLACES_ONBOARDING_MONTHLY_CAP —
// never against PLACES_DETAILS_MONTHLY_CAP or PLACES_SEARCH_MONTHLY_CAP, so
// onboarding can't use up what re-scans, competitor scans and the monthly
// job need. A lookup runs only when its worst case still fits the ceiling.
//
// Each signed-in user gets ONBOARDING_LOOKUPS_PER_DAY lookups in any 24
// hours (a 0-call "onboarding_lookup" row with user_id marks each one).

import { t, type Locale } from "@/lib/i18n";

export const DEFAULT_PLACES_ONBOARDING_MONTHLY_CAP = 300;
export const ONBOARDING_LOOKUPS_PER_DAY = 20;

/** The places_calls kinds that count against the onboarding ceiling. */
export const ONBOARDING_CALL_KINDS = ["onboarding", "onboarding_search", "onboarding_geocode"] as const;
/** The 0-call row that marks one lookup for the per-user limit. */
export const ONBOARDING_LOOKUP_KIND = "onboarding_lookup";

/** The most one lookup can call Google (lib/google/businessSearch.ts
 * findBusiness): 3 Text Searches (1 + MAX_FALLBACK_SEARCHES), 1 Geocode and
 * 3 Details (the place ids found on the owner's website). Picking a listing
 * from the list is 1 Details. */
export const WORST_CASE_SEARCH_CALLS = 7;
export const WORST_CASE_PICK_CALLS = 1;

export function placesOnboardingMonthlyCap(env: Record<string, string | undefined> = process.env): number {
  const raw = Number.parseInt(env.PLACES_ONBOARDING_MONTHLY_CAP ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_PLACES_ONBOARDING_MONTHLY_CAP;
}

export type OnboardingDecision = "ok" | "busy" | "rate_limited";

/**
 * May this lookup call Google?
 * - `usedThisMonth` null (the count couldn't be read) → busy: onboarding
 *   never calls Google blind.
 * - `lookupsToday` null → the per-user log isn't set up yet
 *   (supabase/onboarding-lookup-limit.sql not run); the ceiling still holds.
 */
export function onboardingDecision(input: {
  usedThisMonth: number | null;
  cap: number;
  worstCase: number;
  lookupsToday: number | null;
  perDay?: number;
}): OnboardingDecision {
  if (input.usedThisMonth === null || input.usedThisMonth + input.worstCase > input.cap) return "busy";
  if (input.lookupsToday !== null && input.lookupsToday >= (input.perDay ?? ONBOARDING_LOOKUPS_PER_DAY)) return "rate_limited";
  return "ok";
}

/** The places_calls rows for the calls one lookup actually made. */
export function onboardingCallRows(paidCalls: { textSearch: number; details: number; geocode: number }): Array<{ kind: (typeof ONBOARDING_CALL_KINDS)[number]; calls: number }> {
  return (
    [
      { kind: "onboarding_search", calls: paidCalls.textSearch },
      { kind: "onboarding_geocode", calls: paidCalls.geocode },
      { kind: "onboarding", calls: paidCalls.details },
    ] as const
  ).filter((r) => r.calls > 0);
}

/** The lookup route's "blocked" answers, in the owner's language (null for any other answer). */
export function lookupBlockedMessage(data: unknown, locale: Locale): string | null {
  const code = data && typeof data === "object" ? (data as { code?: unknown }).code : null;
  if (code === "busy") return t(locale, "dashboard.intake.searchBusy");
  if (code === "rate_limited") return t(locale, "dashboard.intake.searchRateLimited");
  return null;
}
