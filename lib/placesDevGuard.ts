// Dev-only runs never spend live Places reads: `next dev` (the dev test
// login, devShot screenshots, Sam's browsing on localhost) and one-off
// scripts (tsx) read a page's Google values from the 10-minute cache only
// — a miss is "Couldn't load from Google right now", never a call. Real
// scans keep their own reads (not these page reads), and production
// (NODE_ENV=production, real owners) is unchanged. Tests mock Google
// (test/noLiveGoogle.ts), so they're left alone. PLACES_DEV_LIVE=true
// turns live page reads back on in dev, still logged and capped. Pure.

export function devRunSkipsLivePlaces(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV === "production" || env.VITEST) return false;
  return env.PLACES_DEV_LIVE !== "true";
}
