// Netlify Background Function (up to 15 minutes): fully scores one saved
// competitor scan by calling app/api/cron/competitor-scoring once per
// competitor site until the scan is done, paused (PageSpeed budget) or
// out of time — the same chunked pattern as monthly-reports-batch.mts.
// Progress is saved after every site, so an interrupted run loses at most
// the one site in flight and a later run picks up where this one stopped.
// The scan's listings (`inputs`, Day 23 2d-4b) are passed on to every step
// in memory — never saved or logged.
//
// Speed-up: with the listings in hand, it runs one NAMED competitor per
// step, COMPETITOR_SCORING_PARALLEL_STEPS at a time (default 1 until a real
// step's time on Netlify is confirmed; up to 5), each step the same size as
// before. Every step's time is logged ("… in 32.4 s"). The closing step
// (no competitor named) publishes the scan, or picks up anything left.
import type { Config } from "@netlify/functions";
import { timingSafeEqual } from "crypto";

const MAX_RUN_MS = 13 * 60 * 1000;
const MAX_PARALLEL_STEPS = 5;

function parallelSteps(): number {
  const n = Number.parseInt(process.env.COMPETITOR_SCORING_PARALLEL_STEPS ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(MAX_PARALLEL_STEPS, n) : 1;
}

type Outcome = { status: string; done: number; total: number; stopped?: string };

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export default async (req: Request) => {
  if (!authorized(req)) {
    console.error("[competitor-scoring-batch] unauthorized");
    return;
  }
  const { scanId, inputs, addedPlaceId } = (await req.json().catch(() => ({}))) as { scanId?: string; inputs?: unknown; addedPlaceId?: string };
  const siteUrl = process.env.URL ?? process.env.SITE_URL;
  if (!scanId || !siteUrl) {
    console.error("[competitor-scoring-batch] missing scanId or site URL");
    return;
  }
  const started = Date.now();
  const step = async (label: string, extra: Record<string, unknown>): Promise<Outcome | null> => {
    const t0 = Date.now();
    const res = await fetch(`${siteUrl}/api/cron/competitor-scoring`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scanId, inputs: inputs ?? null, ...extra }),
    }).catch((err) => {
      console.error(`[competitor-scoring-batch] ${label} request failed:`, err);
      return null;
    });
    const outcome = res && res.ok ? ((await res.json().catch(() => null)) as Outcome | null) : null;
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[competitor-scoring-batch] ${scanId} ${label}: ${outcome ? `${outcome.status} ${outcome.done}/${outcome.total}` : `HTTP ${res?.status ?? "error"}`} in ${secs} s`);
    return outcome;
  };

  if (addedPlaceId) {
    await step(`added ${addedPlaceId}`, { addedPlaceId });
    return;
  }

  // One named competitor per step, several at once.
  const ids = inputs && typeof inputs === "object" && !Array.isArray(inputs) ? Object.keys(inputs as Record<string, unknown>) : [];
  let paused = false;
  const workers = Array.from({ length: Math.min(parallelSteps(), ids.length) }, async () => {
    while (ids.length > 0 && !paused && Date.now() - started < MAX_RUN_MS) {
      const placeId = ids.shift()!;
      const outcome = await step(`site ${placeId}`, { placeId });
      if (outcome && outcome.status === "failed") paused = true;
    }
  });
  await Promise.all(workers);

  // Closing steps: publish, or score whatever is left one at a time.
  for (let n = 1; Date.now() - started < MAX_RUN_MS; n++) {
    const outcome = await step(`step ${n}`, {});
    if (!outcome || outcome.status !== "running") return;
  }
  console.log(`[competitor-scoring-batch] ${scanId}: out of time; the next run resumes it.`);
};

export const config: Config = { background: true };
