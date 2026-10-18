// Netlify Background Function (up to 15 minutes): fully scores one saved
// competitor scan by calling app/api/cron/competitor-scoring once per
// competitor site until the scan is done, paused (PageSpeed budget) or
// out of time — the same chunked pattern as monthly-reports-batch.mts.
// Progress is saved after every site, so an interrupted run loses at most
// the one site in flight and a later run picks up where this one stopped.
import type { Config } from "@netlify/functions";
import { timingSafeEqual } from "crypto";

const MAX_RUN_MS = 13 * 60 * 1000;

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
  const { scanId } = (await req.json().catch(() => ({}))) as { scanId?: string };
  const siteUrl = process.env.URL ?? process.env.SITE_URL;
  if (!scanId || !siteUrl) {
    console.error("[competitor-scoring-batch] missing scanId or site URL");
    return;
  }
  const started = Date.now();
  for (let step = 1; Date.now() - started < MAX_RUN_MS; step++) {
    const res = await fetch(`${siteUrl}/api/cron/competitor-scoring`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scanId }),
    }).catch((err) => {
      console.error(`[competitor-scoring-batch] step ${step} request failed:`, err);
      return null;
    });
    const outcome = res && res.ok ? ((await res.json()) as { status: string; done: number; total: number; stopped?: string }) : null;
    console.log(`[competitor-scoring-batch] ${scanId} step ${step}: ${outcome ? `${outcome.status} ${outcome.done}/${outcome.total}` : `HTTP ${res?.status ?? "error"}`}`);
    if (!outcome || outcome.status !== "running") return;
  }
  console.log(`[competitor-scoring-batch] ${scanId}: out of time; the next run resumes it.`);
};

export const config: Config = { background: true };
