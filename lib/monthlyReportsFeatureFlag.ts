// Whether the monthly EMAIL report feature has actually been turned on
// for real users yet — kept in its own small, non-"use server" module
// (a "use server" file, like app/actions/reports.ts, may only export
// async functions — a plain boolean constant there fails the build) so
// both server actions and any future non-action code can import it.
//
// This is the ONE gate standing between a real scheduled run
// (netlify/functions/monthly-reports-scheduler.mts →
// monthly-reports-batch.mts → POST /api/cron/monthly-reports) and
// actually emailing every business with monthly_report_enabled = true —
// see that route's own handleCronRun, which checks this before doing
// any real work. It deliberately does NOT gate the dev-only single-
// business test route (send-one/route.ts) — that route calls
// processBusiness() directly, bypassing handleCronRun entirely, so it
// stays usable for testing regardless of this flag.
//
// A function, not a plain constant, so it re-reads process.env on every
// call instead of freezing a value at first import — the same reasoning
// as isGbpConnectPublic() in lib/googleBusinessProfile.ts, and what
// lets this be unit-tested against different env values in the same
// process (see monthlyReportsFeatureFlag.test.ts).
export function isMonthlyReportsLive(): boolean {
  return process.env.MONTHLY_REPORTS_LIVE === "true";
}
