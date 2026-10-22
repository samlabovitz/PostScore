import type { Plan } from "@/lib/plan";

// When a paid competitor scan may run (Part B, cost-first competitor
// scan — see ~/Desktop/auto-competitors-plan.md). Pure: no network, no
// database, so every rule is testable on its own.
//
// - The Competitors page only ever shows the latest SAVED scan; viewing
//   it never calls Google.
// - A business's first scan runs automatically once (see
//   ensureFirstCompetitorScan in app/actions/competitors.ts).
// - "Refresh competitors" is allowed once per COOLDOWN_DAYS.
// - The monthly report reuses a scan younger than COOLDOWN_DAYS.
// - scripts/rescan-all.ts scans competitors only when asked to
//   (--with-competitors / --competitors-only).

export const COMPETITOR_REFRESH_COOLDOWN_DAYS = 30;

/** The widest search radius a competitor scan uses (lib/competitors.ts's
 * last radius tier) — when nothing comparable turns up, this is how far
 * we looked. */
export const MAX_SEARCH_RADIUS_MILES = 5;
const DAY_MS = 86_400_000;

/** Google bills each Nearby Search Enterprise call at $35 per 1,000. */
export const NEARBY_SEARCH_COST_USD = 0.035;
/** A scan is 1–3 Nearby Search calls (1.5 mi, widening to 3 and 5 mi). */
export const NEARBY_CALLS_PER_SCAN = { min: 1, max: 3 } as const;

export interface RefreshAvailability {
  allowed: boolean;
  /** When the next refresh is allowed — null when allowed now. */
  nextAvailableAt: string | null;
}

/** Whether "Refresh competitors" may run now, given the latest saved
 * scan's time (null when the business has never been scanned). */
export function refreshAvailability(latestScanAt: string | null, now: Date): RefreshAvailability {
  if (!latestScanAt) return { allowed: true, nextAvailableAt: null };
  const next = Date.parse(latestScanAt) + COMPETITOR_REFRESH_COOLDOWN_DAYS * DAY_MS;
  if (!Number.isFinite(next) || now.getTime() >= next) return { allowed: true, nextAvailableAt: null };
  return { allowed: false, nextAvailableAt: new Date(next).toISOString() };
}

/** True when a saved scan is recent enough to reuse instead of paying for
 * a new one (the monthly report, the Pricing page). */
export function isScanFresh(latestScanAt: string | null, now: Date): boolean {
  if (!latestScanAt) return false;
  const age = now.getTime() - Date.parse(latestScanAt);
  return Number.isFinite(age) && age >= 0 && age < COMPETITOR_REFRESH_COOLDOWN_DAYS * DAY_MS;
}

export interface RescanCompetitorFlags {
  /** --with-competitors: also scan competitors for each re-scanned
   * business whose last saved scan is 30+ days old (or missing). */
  withCompetitors: boolean;
  /** --competitors-only: skip the business re-scan; scan competitors only
   * for businesses with NO saved competitor scan (the one-time backfill). */
  competitorsOnly: boolean;
}

/** Which businesses the bulk re-scan should run a competitor scan for.
 * Without a flag: none, ever. */
export function competitorScanTargets(
  businesses: Array<{ id: string; latestCompetitorScanAt: string | null; plan: Plan }>,
  flags: RescanCompetitorFlags,
  now: Date
): string[] {
  if (flags.competitorsOnly) return businesses.filter((b) => b.latestCompetitorScanAt === null).map((b) => b.id);
  // Free: never refreshed after the first scan — only a missing first scan.
  if (flags.withCompetitors)
    return businesses
      .filter((b) => (b.plan === "free" ? b.latestCompetitorScanAt === null : refreshAvailability(b.latestCompetitorScanAt, now).allowed))
      .map((b) => b.id);
  return [];
}

/** Estimated cost of `scans` competitor scans, as a list-price range. */
export function competitorScanCostRange(scans: number): { min: number; max: number } {
  return {
    min: scans * NEARBY_CALLS_PER_SCAN.min * NEARBY_SEARCH_COST_USD,
    max: scans * NEARBY_CALLS_PER_SCAN.max * NEARBY_SEARCH_COST_USD,
  };
}

/** Whether an owner re-scan also refreshes competitors (Nearby Search):
 * - Premium and Multi: every re-scan;
 * - Grow: when the last saved competitor scan is GROW_RESCAN_COMPETITOR_DAYS
 *   or more old (or there isn't one);
 * - Free: never — Free competitors are never refreshed after the first
 *   scan (not by a re-scan, the monthly report or scripts/rescan-all.ts). */
export const GROW_RESCAN_COMPETITOR_DAYS = 7;

export function rescanRefreshesCompetitors(plan: Plan, latestCompetitorScanAt: string | null, now: Date): boolean {
  if (plan === "free") return false;
  if (plan === "premium" || plan === "multi") return true;
  if (!latestCompetitorScanAt) return true;
  const age = now.getTime() - Date.parse(latestCompetitorScanAt);
  return !Number.isFinite(age) || age >= GROW_RESCAN_COMPETITOR_DAYS * DAY_MS;
}

/** Grow: when a re-scan will next refresh competitors (the last saved
 * scan + GROW_RESCAN_COMPETITOR_DAYS; null = the next re-scan does). */
export function growNextCompetitorUpdate(latestCompetitorScanAt: string | null): string | null {
  if (!latestCompetitorScanAt) return null;
  const next = Date.parse(latestCompetitorScanAt) + GROW_RESCAN_COMPETITOR_DAYS * DAY_MS;
  return Number.isFinite(next) ? new Date(next).toISOString() : null;
}
