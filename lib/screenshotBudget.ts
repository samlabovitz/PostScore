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
//   3. The manual Refresh button is capped by the same monthly total
//      (lib/websiteScreenshotRefresh.server.ts), as is the one capture
//      after "Wrong site?".
//   4. Each business also has its own monthly ScreenshotOne allowance, by
//      plan (SCREENSHOT_CALLS_PER_BUSINESS — Free 5, about one capture;
//      Grow, Premium and Multi 10, about two), counted across every path:
//      the first capture when added, Refresh screenshots, "Wrong site?",
//      the monthly job and rescan-all. Checked before ScreenshotOne is
//      called; when it's used, the existing screenshot stays. The
//      account-wide cap (rule 2) is still the overall limit.

import type { WebsiteAnalysis } from "@/lib/scoring";
import type { Plan } from "@/lib/plan";

/** ScreenshotOne calls one business may use per calendar month (UTC). */
export const SCREENSHOT_CALLS_PER_BUSINESS: Record<Plan, number> = { free: 5, grow: 10, premium: 10, multi: 10 };

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

/** Rule 4: this business's own ScreenshotOne calls this calendar month
 * (its capture log adds up the month's captures). */
export function businessScreenshotCallsThisMonth(analysis: WebsiteAnalysis | null, now: Date = new Date()): number {
  return screenshotCallsThisMonth([analysis], now);
}

/** Rule 4: room for one more capture (its worst case) for this business? */
export function canCaptureForBusiness(analysis: WebsiteAnalysis | null, plan: Plan, now: Date = new Date()): boolean {
  return businessScreenshotCallsThisMonth(analysis, now) + MAX_SCREENSHOT_CALLS_PER_CAPTURE <= SCREENSHOT_CALLS_PER_BUSINESS[plan];
}

/** When this business's allowance starts again: the 1st of next month (UTC). */
export function nextBusinessCaptureAt(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/** The capture log after a capture: this month's earlier calls kept, so
 * both the business's and the account's monthly counts stay whole. */
export function nextCaptureLog(
  earlier: WebsiteAnalysis["screenshotCaptureLog"] | null | undefined,
  calls: number,
  source: "auto" | "manual" | "site_change",
  now: Date = new Date()
): { at: string; calls: number; source: "auto" | "manual" | "site_change" } {
  const at = new Date(earlier?.at ?? "");
  const sameMonth = !!earlier && at.getUTCFullYear() === now.getUTCFullYear() && at.getUTCMonth() === now.getUTCMonth();
  return { at: now.toISOString(), calls: (sameMonth ? earlier.calls : 0) + calls, source };
}

/** Rules 1, 2 and 4 together: may a scan capture automatically now? The
 * business's own allowance first, then the account-wide cap. */
export function autoCaptureAllowed(analysis: WebsiteAnalysis | null, plan: Plan, accountCallsThisMonth: number, cap: number, now: Date = new Date()): boolean {
  return needsAutoScreenshot(analysis) && canCaptureForBusiness(analysis, plan, now) && canAutoCapture(accountCallsThisMonth, cap);
}
