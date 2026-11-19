// Day 23 2d-5: names in a long list of an owner's businesses (the home list,
// Settings → Businesses). An account with more than LIVE_NAMES_MAX_BUSINESSES
// gets the names already read (the 10-minute cache) with the page; the rest
// load as their rows scroll into view, at most LIVE_NAMES_PER_VIEW live reads
// per page view. Past that, rows keep their placeholder and "Load more names"
// reads the next LIVE_NAMES_PER_VIEW. Pure.

/** Live reads one page view (or one "Load more names") may make. */
export const LIVE_NAMES_PER_VIEW = 25;

export interface ListName {
  name: string | null;
  address: string | null;
  /** Google couldn't be read just now. */
  unavailable: boolean;
  /** Not read: load it when the row is seen (past the budget: wait for "Load more names"). */
  notRead?: boolean;
}

/** The ids a batch may read live, in the order they were seen, within what's left of the view's budget. */
export function liveBatch(ids: string[], left: number): { live: string[]; cachedOnly: string[] } {
  const n = Math.max(0, Math.min(left, LIVE_NAMES_PER_VIEW));
  return { live: ids.slice(0, n), cachedOnly: ids.slice(n) };
}

/** The first row, in list order, still waiting for a name — where "Load more names" goes. */
export function firstWaiting(order: string[], waiting: ReadonlySet<string>): string | null {
  return order.find((id) => waiting.has(id)) ?? null;
}
