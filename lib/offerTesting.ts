// Day 25B step 5 (docs/plans/day25a-spec.md §6.2, rule 4): a coupon or
// referral program is a test when an internal account made it — the dev
// test login or a PLAN_SWITCHER_EMAILS account. Saved as is_test on promos
// and referrals (supabase/offers-is-test.sql). Customer offers never lists
// or counts test offers, except for the dev test login itself (its own test
// activity, shown with "Test account"). Pure.

type Env = { DEV_TEST_LOGIN_EMAIL?: string; PLAN_SWITCHER_EMAILS?: string; NODE_ENV?: string };

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

/** The dev test login (any environment: its rows are tests wherever they're made). */
export function isDevTestLoginEmail(email: string | null | undefined, env: Env = process.env): boolean {
  return !!norm(email) && norm(email) === norm(env.DEV_TEST_LOGIN_EMAIL);
}

/** An internal account: the dev test login or a plan-switcher email. */
export function isInternalEmail(email: string | null | undefined, env: Env = process.env): boolean {
  if (!norm(email)) return false;
  if (isDevTestLoginEmail(email, env)) return true;
  return (env.PLAN_SWITCHER_EMAILS ?? "").split(",").map(norm).filter(Boolean).includes(norm(email));
}

/** A new offer made by this account is a test. */
export function offerIsTest(email: string | null | undefined, env: Env = process.env): boolean {
  return isInternalEmail(email, env);
}

/** Whether this viewer sees test offers: only the dev test login (spec §6.2 exception). */
export function showsTestOffers(email: string | null | undefined, env: Env = process.env): boolean {
  return isDevTestLoginEmail(email, env);
}

export interface OfferSummary {
  /** Offers started (coupons, first-time offers and referral programs; running or ended). */
  count: number;
  /** The first one's start (ISO), null when none. */
  since: string | null;
  /** Every "+1" logged on them. */
  uses: number;
}

/** "{n} offers started since {date} · {uses} uses logged", from the rows a viewer may see. */
export function offerSummary(rows: Array<{ created_at: string; redemptions: number; is_test?: boolean | null }>, includeTests: boolean): OfferSummary {
  const shown = rows.filter((r) => includeTests || !r.is_test);
  const since = shown.reduce<string | null>((min, r) => (min === null || r.created_at < min ? r.created_at : min), null);
  return { count: shown.length, since, uses: shown.reduce((sum, r) => sum + (Number(r.redemptions) || 0), 0) };
}
