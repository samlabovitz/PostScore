// Step 2d: ScreenshotOne cost control. One rule, shared by the real scan
// (saveBusinessWithClient) and scripts/rescan-all.ts's --dry-run, so the
// dry run's count is exactly what a real run would do.
//
//   1. A scan captures screenshots automatically ONLY when the business
//      has no screenshot and none has ever been attempted. Never because
//      a screenshot is old; a past attempt that failed isn't retried
//      automatically either (the "Refresh screenshots" button can).
//   2. Automatic captures stop for the month once the real ScreenshotOne
//      requests recorded this month (automatic AND manual — both use the
//      same plan) would go over SCREENSHOT_AUTO_MONTHLY_CAP (default 80,
//      under the free plan's 100). A capture reserves its worst case
//      (homepage + MAX_ADDITIONAL_PAGES) before running.
//   3. The manual Refresh button is never capped here — it stays manual.

import type { WebsiteAnalysis } from "@/lib/scoring";

export const DEFAULT_SCREENSHOT_AUTO_MONTHLY_CAP = 80;
/** Homepage + up to 4 discovered pages (MAX_ADDITIONAL_PAGES). */
export const MAX_SCREENSHOT_CALLS_PER_CAPTURE = 5;

export function screenshotAutoMonthlyCap(env: Record<string, string | undefined> = process.env): number {
  const raw = Number.parseInt(env.SCREENSHOT_AUTO_MONTHLY_CAP ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_SCREENSHOT_AUTO_MONTHLY_CAP;
}

/** Rule 1: does this business need its first automatic capture? */
export function needsAutoScreenshot(analysis: WebsiteAnalysis | null): boolean {
  return !analysis?.screenshotUrl && !analysis?.lastScreenshotRefreshAt;
}

function sameUtcMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

/** Real ScreenshotOne requests recorded this calendar month (UTC). A
 * capture from before calls were logged counts its homepage + stored
 * pages (the requests it's known to have made). */
export function screenshotCallsThisMonth(analyses: Array<WebsiteAnalysis | null>, now: Date = new Date()): number {
  let total = 0;
  for (const a of analyses) {
    if (!a) continue;
    if (a.screenshotCaptureLog) {
      if (sameUtcMonth(a.screenshotCaptureLog.at, now)) total += a.screenshotCaptureLog.calls;
    } else if (a.lastScreenshotRefreshAt && sameUtcMonth(a.lastScreenshotRefreshAt, now)) {
      total += 1 + a.additionalPages.length;
    }
  }
  return total;
}

/** Rule 2: is there room for one more automatic capture this month? */
export function canAutoCapture(callsThisMonth: number, cap: number): boolean {
  return callsThisMonth + MAX_SCREENSHOT_CALLS_PER_CAPTURE <= cap;
}
