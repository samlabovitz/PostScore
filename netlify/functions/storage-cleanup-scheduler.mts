// Fires every night (08:15 UTC) and calls app/api/cron/storage-cleanup —
// one quick request (counts and a few batched updates), so no background
// function is needed. Dry run until STORAGE_CLEANUP_LIVE=true is set in
// Netlify. Logs the counts the route returns, never ids or values.
import type { Config } from "@netlify/functions";

async function handler() {
  const cronSecret = process.env.CRON_SECRET;
  const siteUrl = process.env.URL ?? process.env.SITE_URL;
  if (!cronSecret || !siteUrl) {
    console.error("[storage-cleanup-scheduler] CRON_SECRET or the site URL is missing — cannot run the cleanup.");
    return;
  }
  try {
    const res = await fetch(`${siteUrl}/api/cron/storage-cleanup`, { method: "POST", headers: { Authorization: `Bearer ${cronSecret}` } });
    const body = (await res.json().catch(() => null)) as { dryRun?: boolean; results?: Array<{ rule: string; count: number; skipped?: string }> } | null;
    const counts = (body?.results ?? []).map((r) => `${r.rule}=${r.count}${r.skipped ? "(skipped)" : ""}`).join(" ");
    console.log(`[storage-cleanup-scheduler] HTTP ${res.status} ${body?.dryRun ? "dry run" : "live"} ${counts}`);
  } catch (err) {
    console.error(`[storage-cleanup-scheduler] failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export default handler;

export const config: Config = {
  schedule: "15 8 * * *",
};
