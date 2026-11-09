// Google Place Details calls, logged one row per call site in places_calls
// with its own `kind`, and capped per calendar month by
// PLACES_DETAILS_MONTHLY_CAP (default 800) — the same pattern as
// PLACES_SEARCH_MONTHLY_CAP (lib/placesSearchBudget.ts). Pure.
//
// Over the cap a re-scan skips the Google refresh and keeps the saved
// listing data (it never fails); the skip is logged. "photos" is logged but
// never blocked (the photos-only Details call is Google's free "IDs Only"
// SKU, so it doesn't count toward the cap either). "onboarding" (adding a
// business) has its own ceiling, PLACES_ONBOARDING_MONTHLY_CAP
// (lib/onboardingLookupBudget.ts), and isn't counted here — so onboarding
// can never use up what re-scans and the monthly job need.
// See docs/review-scoring-plan.md, Stage 1.

export const DEFAULT_PLACES_DETAILS_MONTHLY_CAP = 800;

export type PlacesDetailsKind =
  /** Adding a business (the intake lookup) — its own ceiling (lib/onboardingLookupBudget.ts). */
  | "onboarding"
  /** "Re-scan now". Also Free's re-scan limit (lastOwnerRescanAt). */
  | "owner_rescan"
  /** The monthly report job's re-scan. */
  | "monthly"
  /** scripts/rescan-all.ts. */
  | "rescan_all"
  /** A re-scan's second look when Google's first answer had no website. */
  | "website_retry"
  /** The Overview header photo (photos-only Details — free SKU). */
  | "photos"
  /** A websiteUri-only Details call (getPlaceWebsiteUri). */
  | "website_only"
  /** Any other re-scan caller. */
  | "rescan"
  /** A one-off measuring script (scripts/scoringDryRun.ts). */
  | "dry_run"
  /** A competitor the owner added that this scan's searches didn't return. */
  | "competitor_added";

export const PLACES_DETAILS_KINDS: readonly PlacesDetailsKind[] = [
  "onboarding",
  "owner_rescan",
  "monthly",
  "rescan_all",
  "website_retry",
  "photos",
  "website_only",
  "rescan",
  "dry_run",
  "competitor_added",
];

/** What this cap counts: billed Details calls, except onboarding's (its own
 * ceiling) and photos-only (free). */
export const BILLED_DETAILS_KINDS: readonly PlacesDetailsKind[] = PLACES_DETAILS_KINDS.filter((k) => k !== "photos" && k !== "onboarding");

/** Never skipped by the cap (still logged). */
const NEVER_BLOCKED: ReadonlySet<PlacesDetailsKind> = new Set<PlacesDetailsKind>(["photos"]);

/** A single owner action, not a batch job: still runs when the month's
 * count can't be read (lib/placesSearchBudget.ts countUnreadableAllows). */
const INTERACTIVE_KINDS: ReadonlySet<PlacesDetailsKind> = new Set<PlacesDetailsKind>(["owner_rescan", "competitor_added"]);

export function isInteractiveDetailsKind(kind: PlacesDetailsKind): boolean {
  return INTERACTIVE_KINDS.has(kind);
}

export function placesDetailsMonthlyCap(env: Record<string, string | undefined> = process.env): number {
  const raw = Number.parseInt(env.PLACES_DETAILS_MONTHLY_CAP ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_PLACES_DETAILS_MONTHLY_CAP;
}

/** May a call of this kind run, with `used` billed calls this month? */
export function canMakeDetailsCall(kind: PlacesDetailsKind, usedThisMonth: number, cap: number): boolean {
  return NEVER_BLOCKED.has(kind) || usedThisMonth + 1 <= cap;
}

/** The places_calls kind recorded when the cap skipped a call. */
export function skippedKind(kind: PlacesDetailsKind): string {
  return `${kind}_skipped`;
}
