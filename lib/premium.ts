// PostScore Premium. No plans or checkout exist yet (Day B7), so no
// account has Premium — every Premium-only control stays in its
// "coming soon" state until this reads a real subscription.

export function hasPremium(): boolean {
  return false;
}

/**
 * The real Google Business Profile connect (OAuth) works only when
 * GBP_CONNECT_PUBLIC=true AND the account has Premium. A local dev
 * server (NODE_ENV=development) with GBP_CONNECT_PUBLIC=true also lets
 * it through, so the flow can still be tested before checkout exists;
 * a production build never does.
 */
export function canConnectGbp(
  premium: boolean = hasPremium(),
  env: { GBP_CONNECT_PUBLIC?: string; NODE_ENV?: string } = process.env
): boolean {
  if (env.GBP_CONNECT_PUBLIC !== "true") return false;
  return premium || env.NODE_ENV === "development";
}
