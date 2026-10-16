// Server-only: a business's own IANA time zone from its Google listing's
// coordinates, looked up offline (@photostructure/tz-lookup — no API, no
// cost). Unknown or invalid coordinates → New York, the old app-wide
// default. Kept out of lib/scoring and client components so the lookup
// table (~90 KB) never reaches the browser — callers pass the resulting
// string down instead.

import tzlookup from "@photostructure/tz-lookup";
import { DEFAULT_BUSINESS_TIMEZONE } from "@/lib/i18n/format";

/** A row read with lat/lng, plus its computed `time_zone` (for
 * DashboardShell and businessRowToScoringInput). */
export function withTimeZone<T extends { lat?: unknown; lng?: unknown }>(row: T): T & { time_zone: string } {
  return { ...row, time_zone: businessTimeZone(row.lat, row.lng) };
}

export function businessTimeZone(lat: unknown, lng: unknown): string {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return DEFAULT_BUSINESS_TIMEZONE;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return DEFAULT_BUSINESS_TIMEZONE;
  try {
    return tzlookup(lat, lng) || DEFAULT_BUSINESS_TIMEZONE;
  } catch {
    return DEFAULT_BUSINESS_TIMEZONE;
  }
}
