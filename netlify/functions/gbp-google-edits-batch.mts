// Netlify Background Function (up to 15 minutes): pages through every
// connected business via app/api/cron/gbp-google-edits, a few at a time, until
// a short page says it's done or its time budget is spent. Each business's
// Google calls go through the shared 300/min limiter (lib/gbpQuota.ts); a
// failed business keeps its rows and is logged by the route.
// Anything not reached this run is picked up tomorrow (or by the next scan).
import type { Config } from "@netlify/functions";
import { timingSafeEqual } from "crypto";

const CHUNK_SIZE = Number.parseInt(process.env.GBP_GOOGLE_EDITS_CHUNK_SIZE ?? "", 10) || 10;
const MAX_RUN_MS = 13 * 60 * 1000;
const MAX_CHUNKS = 500;

function isAuthorized(req: Request, secret: string): boolean {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

async function handler(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !isAuthorized(req, cronSecret)) {
    console.error("[gbp-google-edits-batch] rejected: missing or incorrect Authorization bearer secret.");
    return;
  }
  const siteUrl = process.env.URL ?? process.env.SITE_URL;
  if (!siteUrl) {
    console.error("[gbp-google-edits-batch] no site URL available — cannot call the Google edits route.");
    return;
  }
  const startedAt = Date.now();
  let offset = 0;
  let chunks = 0;
  let processed = 0;
  let notOk = 0;
  let stopped = "done";
  while (true) {
    if (chunks >= MAX_CHUNKS) {
      stopped = "chunk cap";
      break;
    }
    if (Date.now() - startedAt > MAX_RUN_MS) {
      stopped = "time budget";
      break;
    }
    chunks++;
    try {
      const res = await fetch(`${siteUrl}/api/cron/gbp-google-edits?limit=${CHUNK_SIZE}&offset=${offset}`, { method: "POST", headers: { Authorization: `Bearer ${cronSecret}` } });
      if (!res.ok) {
        console.error(`[gbp-google-edits-batch] chunk at offset ${offset} returned ${res.status}; moving on.`);
        offset += CHUNK_SIZE;
        continue;
      }
      const chunk = (await res.json()) as { pageSize: number; hasMore: boolean; results: Array<{ status: string }> };
      processed += chunk.pageSize;
      notOk += chunk.results.filter((r) => r.status !== "ok").length;
      if (!chunk.hasMore) break;
      offset += CHUNK_SIZE;
    } catch (err) {
      console.error(`[gbp-google-edits-batch] chunk at offset ${offset} failed: ${err instanceof Error ? err.message : String(err)}; moving on.`);
      offset += CHUNK_SIZE;
    }
  }
  console.log(`[gbp-google-edits-batch] ${processed} business(es) in ${chunks} chunk(s); ${notOk} not ok (rows kept); stopped: ${stopped}.`);
}

export default handler;

export const config: Config = {
  // A Background Function: answers 202 at once, runs up to 15 minutes.
  background: true,
};
