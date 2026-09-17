// Whether the monthly EMAIL report feature has actually been turned on
// for real users yet — kept in its own small, non-"use server" module
// (a "use server" file, like app/actions/reports.ts, may only export
// async functions — a plain boolean constant there fails the build) so
// both server actions and any future non-action code can import it.
//
// The Netlify scheduler that calls app/api/cron/monthly-reports on a
// real cadence is a later, not-yet-built piece, so until this is true,
// honestly nothing is being sent to anyone no matter what any individual
// business's own monthly_report_enabled/monthly_reports state says. Flip
// this env var once that scheduler is live; no code change needed here
// when that happens.
export const MONTHLY_REPORTS_LIVE = process.env.MONTHLY_REPORTS_LIVE === "true";
