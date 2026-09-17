// The real monthly-report batch orchestrator — a genuine Netlify
// Background Function (up to a 15-minute run budget), triggered by
// monthly-reports-scheduler.mts. Its whole job: call
// app/api/cron/monthly-reports (the Next.js route that does the actual
// per-business work) repeatedly in small chunks via its `limit`/`offset`
// query params until every eligible business has been covered, logging
// a running account and a final summary as it goes.
//
// WHY THIS FUNCTION EXISTS AT ALL, rather than the scheduler just
// calling the report route directly, or the report route processing
// everyone in one call:
//
//   1. app/api/cron/monthly-reports/route.ts is a Next.js API Route,
//      deployed via Netlify's Next.js Runtime as a STANDARD (synchronous)
//      function — Netlify's Next.js Runtime has deprecated support for
//      configuring a Next.js API Route itself as a Background Function
//      (that mechanism only ever applied to an older runtime version,
//      for Next.js 10-13.4). So the route's own per-invocation duration
//      is bounded by whatever a standard function's ceiling is — short,
//      on the order of ten-ish seconds, not minutes.
//   2. A single business's real re-scan can legitimately take up to
//      ~30s on its own in the worst case (see the report route's own
//      TIMING/COST comment) — meaning even ONE business, in the worst
//      case, can already threaten a standard function's ceiling. There
//      is no `limit` value that makes this fully safe; smaller chunks
//      only reduce how much real work is lost if a chunk call is killed
//      by the platform mid-flight (the report route inserts each
//      business's monthly_reports row as soon as THAT business's send
//      succeeds, not batched at the end — so a killed chunk still keeps
//      whatever it already finished; only the interrupted business, and
//      any after it in that same chunk, are left for a later run).
//   3. Netlify Scheduled Functions (monthly-reports-scheduler.mts) have
//      their OWN short execution ceiling, well under what it would take
//      to loop through many chunk calls sequentially — so the scheduler
//      can't be the thing doing this looping either.
//
// A genuine Background Function is the one piece of Netlify's platform
// built for exactly this: "not fast, but can run for a while, and
// nothing is waiting synchronously on its result." This function IS
// that piece — the scheduler hands off to it, and it has up to 15
// minutes to make many small, safe calls to the standard report route.
import type { Config } from "@netlify/functions";
import { timingSafeEqual } from "crypto";

/** How many businesses the report route processes per chunk call —
 * small on purpose (see this file's top comment: even one business can
 * approach a standard function's ceiling in the worst case, so this
 * isn't "safe," only "as safe as a single call can reasonably be").
 * Overridable without a redeploy if real-world timing ever calls for a
 * different number. */
const CHUNK_SIZE = Number.parseInt(process.env.MONTHLY_REPORTS_CHUNK_SIZE ?? "", 10) || 3;

/** Leaves real buffer under Netlify's real ~15-minute Background
 * Function ceiling — this function stops issuing NEW chunk calls once
 * it's used this much of its own budget, so it can still log a clean,
 * honest final summary instead of being killed mid-loop with nothing
 * recorded. Any businesses left unprocessed this run are simply picked
 * up by next month's run (monthly_report_enabled = true is a standing
 * condition, not a one-shot queue). */
const MAX_RUN_MS = 13 * 60 * 1000;

/** A sanity ceiling against a runaway loop (e.g. a caller/bug where
 * `hasMore` never honestly goes false) — no realistic near-term business
 * count gets anywhere near this many chunks. */
const MAX_CHUNKS = 500;

interface ChunkSummary {
  pageSize: number;
  hasMore: boolean;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  results: Array<{ businessId: string; status: "sent" | "skipped" | "failed"; reason?: string }>;
}

function isAuthorized(req: Request, secret: string): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);
  if (headerBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(headerBuf, expectedBuf);
}

async function handler(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !isAuthorized(req, cronSecret)) {
    // Never treat "not configured" as "no secret required" — same
    // fail-closed discipline as the report route's own check.
    console.error("[monthly-reports-batch] rejected: missing or incorrect Authorization bearer secret.");
    return;
  }

  const siteUrl = process.env.URL ?? process.env.SITE_URL;
  if (!siteUrl) {
    console.error("[monthly-reports-batch] no site URL available (process.env.URL and SITE_URL both unset) — cannot call the report route.");
    return;
  }

  const startedAt = Date.now();
  let offset = 0;
  let chunkCount = 0;
  let chunkFailures = 0;
  let totalProcessed = 0;
  let totalSent = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let stoppedReason: string | null = null;

  // Sequential and per-chunk try/caught on purpose — one chunk's network
  // error or non-2xx response must never stop the whole run; it's
  // logged and the loop moves on to the next offset (see this file's
  // top comment for why re-trying the SAME chunk isn't attempted here:
  // whatever it didn't finish is simply covered by next month's run).
  while (true) {
    if (chunkCount >= MAX_CHUNKS) {
      stoppedReason = `hit the safety cap of ${MAX_CHUNKS} chunks`;
      break;
    }
    if (Date.now() - startedAt > MAX_RUN_MS) {
      stoppedReason = "hit this function's own time budget";
      break;
    }

    const url = `${siteUrl}/api/cron/monthly-reports?limit=${CHUNK_SIZE}&offset=${offset}`;
    chunkCount++;

    let chunk: ChunkSummary;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      if (!res.ok) {
        chunkFailures++;
        const body = await res.text().catch(() => "");
        console.error(`[monthly-reports-batch] chunk at offset ${offset} returned ${res.status}: ${body}`);
        offset += CHUNK_SIZE;
        continue;
      }
      chunk = (await res.json()) as ChunkSummary;
    } catch (err) {
      chunkFailures++;
      console.error(
        `[monthly-reports-batch] chunk at offset ${offset} failed: ${err instanceof Error ? err.message : String(err)}`
      );
      offset += CHUNK_SIZE;
      continue;
    }

    totalProcessed += chunk.processed;
    totalSent += chunk.sent;
    totalSkipped += chunk.skipped;
    totalFailed += chunk.failed;

    console.log(
      `[monthly-reports-batch] offset ${offset}: pageSize=${chunk.pageSize} sent=${chunk.sent} skipped=${chunk.skipped} failed=${chunk.failed}`
    );

    for (const result of chunk.results) {
      if (result.status === "failed") {
        console.error(`[monthly-reports-batch] business ${result.businessId} failed: ${result.reason ?? "(no reason given)"}`);
      }
    }

    if (chunk.pageSize === 0 || !chunk.hasMore) {
      break;
    }
    offset += CHUNK_SIZE;
  }

  // A Background Function's return value has no reader (the caller
  // already got its 202 long ago) — this log line IS the real "report a
  // summary" for this run; check it in the Netlify dashboard's function
  // logs for monthly-reports-batch.
  console.log(
    `[monthly-reports-batch] run complete: ${JSON.stringify({
      chunksCalled: chunkCount,
      chunkFailures,
      totalProcessed,
      totalSent,
      totalSkipped,
      totalFailed,
      stoppedReason,
      durationMs: Date.now() - startedAt,
    })}`
  );
}

export default handler;

export const config: Config = {
  background: true,
};
