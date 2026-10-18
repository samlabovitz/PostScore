// When an owner can re-scan, and how fresh their results look. Pure.
//
// - One re-scan per business per 24 hours (rolling, from the latest saved
//   scan of any kind — an automatic monthly or bulk scan counts too, since
//   the results are just as fresh). A re-scan is 1 Google Places Details
//   call (~$0.02) plus free PageSpeed/Safe Browsing/link checks.
// - Freshness, in the business's own time zone: "Scanned today" (green),
//   "Scanned N days ago" (neutral), 30+ days → amber "re-scan for current
//   results".

import { calendarDaysAgo } from "@/lib/i18n/format";

export const RESCAN_COOLDOWN_HOURS = 24;
export const STALE_SCAN_DAYS = 30;
const HOUR_MS = 3_600_000;

export interface RescanAvailability {
  allowed: boolean;
  /** When the next re-scan opens — null when allowed now. */
  nextAvailableAt: string | null;
}

export function rescanAvailability(lastScanAt: string | null, now: Date): RescanAvailability {
  if (!lastScanAt) return { allowed: true, nextAvailableAt: null };
  const next = Date.parse(lastScanAt) + RESCAN_COOLDOWN_HOURS * HOUR_MS;
  if (!Number.isFinite(next) || now.getTime() >= next) return { allowed: true, nextAvailableAt: null };
  return { allowed: false, nextAvailableAt: new Date(next).toISOString() };
}

export type ScanFreshness =
  | { kind: "never" }
  | { kind: "today" }
  | { kind: "days"; days: number }
  | { kind: "stale"; days: number };

export function scanFreshness(lastScanAt: string | null, now: Date, timeZone: string): ScanFreshness {
  if (!lastScanAt) return { kind: "never" };
  const days = Math.max(0, calendarDaysAgo(lastScanAt, now, timeZone));
  if (days === 0) return { kind: "today" };
  return days >= STALE_SCAN_DAYS ? { kind: "stale", days } : { kind: "days", days };
}

/** Pages other than the Overview show a re-scan notice only once the last
 * scan is MORE than this old; within it, nothing at all. */
export const RESCAN_NOTICE_AFTER_HOURS = 48;

/** Whether Growth, Reviews, Website, Competitors, Pricing and Reports show
 * the "Scanned N days ago — re-scan for current results" notice. */
export function showRescanNotice(lastScanAt: string | null, now: Date): boolean {
  if (!lastScanAt) return false;
  const t = Date.parse(lastScanAt);
  return Number.isFinite(t) && now.getTime() - t > RESCAN_NOTICE_AFTER_HOURS * 60 * 60 * 1000;
}
