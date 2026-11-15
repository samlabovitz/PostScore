// Fires every day (07:30 UTC) and only triggers gbp-google-edits-batch.mts,
// the Background Function that does the work — the same thin-trigger pattern as
// monthly-reports-scheduler.mts.
import type { Config } from "@netlify/functions";

async function handler() {
  const cronSecret = process.env.CRON_SECRET;
  const siteUrl = process.env.URL ?? process.env.SITE_URL;
  if (!cronSecret || !siteUrl) {
    console.error("[gbp-google-edits-scheduler] CRON_SECRET or the site URL is missing — cannot trigger gbp-google-edits-batch.");
    return;
  }
  try {
    const res = await fetch(`${siteUrl}/.netlify/functions/gbp-google-edits-batch`, { method: "POST", headers: { Authorization: `Bearer ${cronSecret}` } });
    console.log(`[gbp-google-edits-scheduler] triggered gbp-google-edits-batch — response status ${res.status}.`);
  } catch (err) {
    console.error(`[gbp-google-edits-scheduler] failed to trigger gbp-google-edits-batch: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export default handler;

export const config: Config = {
  schedule: "30 7 * * *",
};
