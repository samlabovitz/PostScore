// Day 23 2d-4b: a competitor's full scoring gets its listing in memory from
// the scan's own search. Only when that hand-off was lost (a run cut short,
// a paused job resumed later by scripts/competitor-full-scoring.ts) does the
// job read the listing live — one Place Details Enterprise call per
// competitor, logged in places_calls as "competitor_scoring" and capped per
// calendar month by PLACES_COMPETITOR_REREAD_MONTHLY_CAP (default 200), its
// own ceiling so it can never use up what re-scans need. A batch caller:
// it never runs when the month's count can't be read. Pure.

export const COMPETITOR_REREAD_KIND = "competitor_scoring";
export const DEFAULT_COMPETITOR_REREAD_MONTHLY_CAP = 200;

export function competitorRereadMonthlyCap(env: Record<string, string | undefined> = process.env): number {
  const raw = Number.parseInt(env.PLACES_COMPETITOR_REREAD_MONTHLY_CAP ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_COMPETITOR_REREAD_MONTHLY_CAP;
}

/** `used`: this month's re-reads; "missing" before supabase/places-calls.sql
 * (development), "unreadable" on any other read error (never runs blind). */
export function canReread(used: number | "missing" | "unreadable", cap: number): boolean {
  if (used === "missing") return true;
  if (used === "unreadable") return false;
  return used + 1 <= cap;
}
