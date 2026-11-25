// Fires every day (10:00 UTC, early morning in the US) and calls
// app/api/cron/reply-drafts: the review reply drafts are written in the
// background, so pages only read them. Logs counts only.
import type { Config } from "@netlify/functions";

async function handler() {
  const cronSecret = process.env.CRON_SECRET;
  const siteUrl = process.env.URL ?? process.env.SITE_URL;
  if (!cronSecret || !siteUrl) {
    console.error("[reply-drafts-scheduler] CRON_SECRET or the site URL is missing — cannot write the drafts.");
    return;
  }
  try {
    const res = await fetch(`${siteUrl}/api/cron/reply-drafts`, { method: "POST", headers: { Authorization: `Bearer ${cronSecret}` } });
    const body = (await res.json().catch(() => null)) as { businesses?: number; written?: number; skipped?: number } | null;
    console.log(`[reply-drafts-scheduler] HTTP ${res.status}: ${body?.businesses ?? 0} businesses, ${body?.written ?? 0} written, ${body?.skipped ?? 0} skipped`);
  } catch (err) {
    console.error(`[reply-drafts-scheduler] failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export default handler;

export const config: Config = {
  schedule: "0 10 * * *",
};
