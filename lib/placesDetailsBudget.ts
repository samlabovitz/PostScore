// Google Place Details calls, logged one row per call site in places_calls
// with its own `kind`, and capped per calendar month by
// PLACES_DETAILS_MONTHLY_CAP (default 800) — the same pattern as
// PLACES_SEARCH_MONTHLY_CAP (lib/placesSearchBudget.ts). Pure.
//
// Over the cap a re-scan skips the Google refresh and keeps the saved
// listing data (it never fails); the skip is logged. Two kinds are logged
// but never blocked: "onboarding" (a new owner must always be able to add
// their business) and "photos" (the photos-only Details call is Google's
// free "IDs Only" SKU, so it doesn't count toward the cap either).
// See docs/review-scoring-plan.md, Stage 1.

export const DEFAULT_PLACES_DETAILS_MONTHLY_CAP = 800;

export type PlacesDetailsKind =
  /** Adding a business (the intake lookup). */
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

/** Billed Details calls — what the cap counts (photos-only is free). */
export const BILLED_DETAILS_KINDS: readonly PlacesDetailsKind[] = PLACES_DETAILS_KINDS.filter((k) => k !== "photos");

/** Never skipped by the cap (still logged). */
const NEVER_BLOCKED: ReadonlySet<PlacesDetailsKind> = new Set<PlacesDetailsKind>(["onboarding", "photos"]);

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
