// Fires on the 1st of every month (UTC) and does exactly ONE thing:
// trigger monthly-reports-batch.mts, the real orchestrator. Deliberately
// kept this thin — see that file's own top comment for why the actual
// multi-business work can't live in a Netlify Scheduled Function at all.
//
// Scheduled Functions have their own hard execution ceiling (short —
// low tens of seconds, not minutes) specifically because they're meant
// to be trigger points, not workers. This function's own real work is
// just "make one HTTP call and get back the fire-and-forget 202" —
// comfortably within that budget regardless of how long the actual
// monthly batch ends up taking (up to the Background Function's own,
// much larger budget) — this function returns long before the batch
// function's real work even starts to matter.
import type { Config } from "@netlify/functions";

async function handler(req: Request) {
  const { next_run } = (await req.json().catch(() => ({ next_run: null }))) as { next_run: string | null };
  console.log(`[monthly-reports-scheduler] fired. Next scheduled run: ${next_run ?? "unknown"}.`);

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[monthly-reports-scheduler] CRON_SECRET is not configured — cannot trigger monthly-reports-batch.");
    return;
  }

  // process.env.URL is Netlify's own, always-populated "this site's real
  // base URL" for any function running on it (including in `netlify dev`
  // locally) — the right default for a same-site function-to-function
  // call. SITE_URL (this app's own env var, used to build the email's
  // real unsubscribe link) is only a fallback for the unlikely case that
  // Netlify's own var is somehow unset.
  const siteUrl = process.env.URL ?? process.env.SITE_URL;
  if (!siteUrl) {
    console.error("[monthly-reports-scheduler] no site URL available (process.env.URL and SITE_URL both unset) — cannot trigger monthly-reports-batch.");
    return;
  }

  const batchUrl = `${siteUrl}/.netlify/functions/monthly-reports-batch`;

  try {
    // Awaiting this only waits for the Background Function's immediate
    // 202 Accepted acknowledgment, not for its real work to finish — see
    // monthly-reports-batch.mts.
    const res = await fetch(batchUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    console.log(`[monthly-reports-scheduler] triggered monthly-reports-batch — response status ${res.status}.`);
  } catch (err) {
    console.error(
      `[monthly-reports-scheduler] failed to trigger monthly-reports-batch: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export default handler;

export const config: Config = {
  // UTC, per Netlify's own cron semantics — 00:00 on the 1st of every month.
  schedule: "0 0 1 * *",
};
