// Google Places SEARCH calls (Text Search and Nearby Search) made by competitor scans,
// capped per calendar month by PLACES_SEARCH_MONTHLY_CAP (default 800, under
// Google's free monthly amount). Pure.

/** The most one competitor scan can make: the Text Search (competitor
 * selection v2), then — only when it found fewer than 5 of the same kind —
 * the Nearby Search fallback: 3 radius tiers + 1 more (the small-town
 * search or the wider-areas call). */
export const MAX_CALLS_PER_SCAN = 5;
export const DEFAULT_PLACES_SEARCH_MONTHLY_CAP = 800;

export function placesSearchMonthlyCap(env: Record<string, string | undefined> = process.env): number {
  const raw = Number.parseInt(env.PLACES_SEARCH_MONTHLY_CAP ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_PLACES_SEARCH_MONTHLY_CAP;
}

/** Start of the current calendar month (UTC) — Google bills by month. */
export function monthStartUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** When the next month's allowance starts. */
export function nextMonthStartUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/** A scan may run only when even its worst case stays under the cap. */
export function canRunScan(usedThisMonth: number, cap: number): boolean {
  return usedThisMonth + MAX_CALLS_PER_SCAN <= cap;
}
