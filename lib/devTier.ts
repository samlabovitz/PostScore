// Day 25B step 6 (spec §6.2): the dev-only "preview tier" — the dev test
// login can show any tier everywhere for design checks ("Tier: Real · 1 · 2 ·
// 3 · 4 · 5" in the dev plan pill). A cookie in that browser only: it never
// saves, never counts, and never reaches a real owner (only under `next dev`,
// only for the dev test login). "Real" clears it. "2-quiet" etc. also previews
// the "Keep your tier" state (devShot --tier=2-quiet). Pure.

export const DEV_TIER_COOKIE = "ps_dev_tier";

/** The preview tier from the cookie, when allowed; null = the real tier. */
export function devPreviewTier(cookie: string | null | undefined, allowed: boolean): 1 | 2 | 3 | 4 | 5 | null {
  if (!allowed || !cookie) return null;
  const m = /^([1-5])(?:-(set|due|quiet|closed))?$/.exec(cookie);
  return m ? (Number(m[1]) as 1 | 2 | 3 | 4 | 5) : null;
}

export type KeepState = "set" | "due" | "quiet" | "closed";
export const DEV_TIER_VALUE = /^[1-5](?:-(?:set|due|quiet|closed))?$/;

/** The previewed "Keep your tier" state ("2-quiet" → "quiet"), when allowed; null = the real one. */
export function devPreviewKeep(cookie: string | null | undefined, allowed: boolean): KeepState | null {
  if (!allowed || !cookie) return null;
  const m = /^[1-5]-(set|due|quiet|closed)$/.exec(cookie);
  return m ? (m[1] as KeepState) : null;
}

/** Only the dev test login, only under `next dev`. */
export function devTierAllowed(env: { NODE_ENV?: string; DEV_TEST_LOGIN_EMAIL?: string }, email: string | null | undefined): boolean {
  if (env.NODE_ENV !== "development" || !env.DEV_TEST_LOGIN_EMAIL || !email) return false;
  return email.trim().toLowerCase() === env.DEV_TEST_LOGIN_EMAIL.trim().toLowerCase();
}
