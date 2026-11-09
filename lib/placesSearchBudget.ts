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

/**
 * The month's count couldn't be read (a database error — not the table
 * missing in development). Batch callers (the monthly job, rescan-all
 * --with-competitors, scripts) never run blind; a single interactive owner
 * action (one re-scan, one search) still does.
 */
export function countUnreadableAllows(interactive: boolean): boolean {
  return interactive;
}

/** "Add a competitor" name searches per business in any 24 hours — so one
 * owner (or a loop on the server action) can't use up the project's
 * monthly search allowance for everyone. */
export const COMPETITOR_SEARCHES_PER_DAY = 10;
/** The 0-call places_calls row that marks one name search, written BEFORE Google is called. */
export const COMPETITOR_NAME_SEARCH_KIND = "competitor_name_search";

/** `countIncludingThis`: this business's name searches in the last 24 h,
 * this one included; null = couldn't be counted (the monthly cap still holds). */
export function competitorSearchAllowed(countIncludingThis: number | null, perDay: number = COMPETITOR_SEARCHES_PER_DAY): boolean {
  return countIncludingThis === null || countIncludingThis <= perDay;
}

/** A scan may run only when even its worst case stays under the cap. */
export function canRunScan(usedThisMonth: number, cap: number): boolean {
  return usedThisMonth + MAX_CALLS_PER_SCAN <= cap;
}
