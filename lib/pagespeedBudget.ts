// PageSpeed Insights daily budget for competitor full scoring. The limits
// are what the Google Cloud Console shows for this project's PageSpeed
// Insights API quota (PAGESPEED_DAILY_LIMIT, PAGESPEED_PER_100S_LIMIT).
// Competitor scoring stays under 80% of the daily limit, counting owner
// re-scans too, and refuses to run when the daily limit isn't set.

/** Share of the daily limit competitor scoring may bring usage up to. */
export const PAGESPEED_BUDGET_SHARE = 0.8;
/** An owner scan makes at most this many PageSpeed requests (one retry). */
export const PAGESPEED_CALLS_PER_SCAN_MAX = 2;
/** Upper bound on PageSpeed requests one competitor worker makes per 100 s
 * (each request takes 10 s or more). */
const PAGESPEED_CALLS_PER_WORKER_PER_100S = 10;
export const MAX_SCORING_CONCURRENCY = 4;

function positiveInt(raw: string | undefined): number | null {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function pagespeedDailyLimit(env: Record<string, string | undefined> = process.env): number | null {
  return positiveInt(env.PAGESPEED_DAILY_LIMIT);
}

export function pagespeedPer100sLimit(env: Record<string, string | undefined> = process.env): number | null {
  return positiveInt(env.PAGESPEED_PER_100S_LIMIT);
}

/** Calls allowed today in total (80% of the daily limit), or null when unset. */
export function pagespeedDailyBudget(env: Record<string, string | undefined> = process.env): number | null {
  const limit = pagespeedDailyLimit(env);
  return limit === null ? null : Math.floor(limit * PAGESPEED_BUDGET_SHARE);
}

/** Workers that keep under 80% of the per-100-seconds limit (1–4). */
export function scoringConcurrency(env: Record<string, string | undefined> = process.env): number {
  const per100 = pagespeedPer100sLimit(env);
  if (per100 === null) return MAX_SCORING_CONCURRENCY;
  return Math.max(1, Math.min(MAX_SCORING_CONCURRENCY, Math.floor((per100 * PAGESPEED_BUDGET_SHARE) / PAGESPEED_CALLS_PER_WORKER_PER_100S)));
}

/** PageSpeed's daily quota resets at midnight Pacific time. */
export function pacificDayStart(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const sinceMidnightMs = ((Number(parts.hour) * 60 + Number(parts.minute)) * 60 + Number(parts.second)) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - sinceMidnightMs).toISOString();
}

/** Can one more competitor (up to 2 requests) run without passing the budget? */
export function canSpendPagespeed(usedToday: number, budget: number | null): boolean {
  return budget !== null && usedToday + PAGESPEED_CALLS_PER_SCAN_MAX <= budget;
}
