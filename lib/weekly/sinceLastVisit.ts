// "Since your last visit" — whether to show it, and what it compares.
// Pure; see app/actions/visits.ts for the server side.
//
// - Shown when the owner's previous visit to this business was 7+ days
//   ago. The visit time is updated the first time a business is opened in
//   a browser session, so it shows once per visit, not on every page.
// - Compares the scan that was current at the last visit with the latest
//   scan now, whatever the gap. No scan since then: say so (never "no
//   change").

import type { Locale } from "@/lib/i18n";
import { compareScans, type ScanComparison, type WeeklyScan } from "./weeklyReport";

export const SINCE_LAST_VISIT_DAYS = 7;
const DAY_MS = 86_400_000;

export function shouldShowSinceLastVisit(lastSeenAt: string | null, now: Date): boolean {
  if (!lastSeenAt) return false;
  const t = Date.parse(lastSeenAt);
  return Number.isFinite(t) && now.getTime() - t >= SINCE_LAST_VISIT_DAYS * DAY_MS;
}

export interface SinceLastVisit {
  since: string;
  /** The scan current at the last visit (null: none yet back then). */
  baseline: WeeklyScan | null;
  latest: WeeklyScan | null;
  /** No scan has run since the last visit. */
  noNewScan: boolean;
  comparison: ScanComparison | null;
}

/** `scans`: every saved scan, oldest first. */
export function sinceLastVisit(lastSeenAt: string, scans: WeeklyScan[], locale: Locale): SinceLastVisit {
  const seen = Date.parse(lastSeenAt);
  const baseline = scans.filter((s) => Date.parse(s.createdAt) <= seen).at(-1) ?? null;
  const latest = scans.at(-1) ?? null;
  const noNewScan = !latest || Date.parse(latest.createdAt) <= seen;
  return {
    since: lastSeenAt,
    baseline,
    latest,
    noNewScan,
    comparison: !noNewScan && baseline && latest ? compareScans(baseline, latest, locale) : null,
  };
}
