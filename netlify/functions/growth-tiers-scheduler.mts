// Fires every Monday (09:00 UTC, after every US business's week has closed)
// and calls app/api/cron/growth-tiers. Dry run until GROWTH_TIERS_LIVE=true is
// set in Netlify (off until Sam approves the dry run). Logs counts only;
// nothing emails or notifies anyone.
import type { Config } from "@netlify/functions";

async function handler() {
  const cronSecret = process.env.CRON_SECRET;
  const siteUrl = process.env.URL ?? process.env.SITE_URL;
  if (!cronSecret || !siteUrl) {
    console.error("[growth-tiers-scheduler] CRON_SECRET or the site URL is missing — cannot run the recompute.");
    return;
  }
  try {
    const res = await fetch(`${siteUrl}/api/cron/growth-tiers`, { method: "POST", headers: { Authorization: `Bearer ${cronSecret}` } });
    const body = (await res.json().catch(() => null)) as { dryRun?: boolean; businesses?: number; byTier?: Record<string, number>; ups?: number; downs?: number } | null;
    console.log(`[growth-tiers-scheduler] HTTP ${res.status} ${body?.dryRun ? "dry run" : "live"}: ${body?.businesses ?? 0} businesses, ${body?.ups ?? 0} up, ${body?.downs ?? 0} down`);
  } catch (err) {
    console.error(`[growth-tiers-scheduler] failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export default handler;

export const config: Config = {
  schedule: "0 9 * * 1",
};
