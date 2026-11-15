// Fires on the 1st of every month (06:00 UTC, after the monthly reports
// start) and only triggers gbp-insights-batch.mts, the Background Function
// that does the work — the same thin-trigger pattern as
// monthly-reports-scheduler.mts.
import type { Config } from "@netlify/functions";

async function handler() {
  const cronSecret = process.env.CRON_SECRET;
  const siteUrl = process.env.URL ?? process.env.SITE_URL;
  if (!cronSecret || !siteUrl) {
    console.error("[gbp-insights-scheduler] CRON_SECRET or the site URL is missing — cannot trigger gbp-insights-batch.");
    return;
  }
  try {
    const res = await fetch(`${siteUrl}/.netlify/functions/gbp-insights-batch`, { method: "POST", headers: { Authorization: `Bearer ${cronSecret}` } });
    console.log(`[gbp-insights-scheduler] triggered gbp-insights-batch — response status ${res.status}.`);
  } catch (err) {
    console.error(`[gbp-insights-scheduler] failed to trigger gbp-insights-batch: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export default handler;

export const config: Config = {
  schedule: "0 6 1 * *",
};
