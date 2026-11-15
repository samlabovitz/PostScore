// Checks PostScore's Google numbers against Google's own Performance
// screen: a LIVE read (nothing saved) of one connected business's views and
// interactions for a range of months, and the same dates a year earlier.
// The range ends yesterday at the latest (Google has no data for today and
// lags a few days), so a month in progress is counted up to then. Also
// prints the stored monthly totals for the same months, to compare.
//
//   npx tsx --env-file=.env.local scripts/check-insights.ts --business <id> --from 2026-06 --to 2026-11

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
import { checkRange, percentText } from "../lib/gbpInsightsCheck";

function allowServerOnly(): void {
  const nodeRequire = createRequire(import.meta.url);
  const Module = nodeRequire("module") as { _load: (request: string, ...rest: unknown[]) => unknown };
  const originalLoad = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, ...rest);
  };
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const businessId = arg("--business");
  const from = arg("--from");
  const to = arg("--to");
  if (!businessId || !from || !to || !/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
    console.error("Usage: scripts/check-insights.ts --business <id> --from YYYY-MM --to YYYY-MM");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (use --env-file=.env.local).");
  allowServerOnly();
  const { readRangeTotalsLive, loadInsights } = await import("../lib/gbpInsights.server");
  const { totalViews, actions } = await import("../lib/gbpInsights");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const range = checkRange(from, to, new Date());
  console.log(`Live from Google: ${range.label} vs ${range.lastYearLabel}`);
  const [now, before] = await Promise.all([readRangeTotalsLive(admin, businessId, range.start, range.end), readRangeTotalsLive(admin, businessId, range.lastYearStart, range.lastYearEnd)]);
  if (!now.ok || !before.ok) {
    console.error(`Couldn't read from Google: ${!now.ok ? now.error : ""} ${!before.ok ? before.error : ""}`);
    process.exit(2);
  }
  console.log(`  Views:        ${now.views.toLocaleString("en-US")}  (last year ${before.views.toLocaleString("en-US")}, ${percentText(now.views, before.views)})`);
  console.log(`  Interactions: ${now.interactions.toLocaleString("en-US")}  (last year ${before.interactions.toLocaleString("en-US")}, ${percentText(now.interactions, before.interactions)})`);
  console.log(`  By metric (this range): ${JSON.stringify(now.byMetric)}`);

  const stored = await loadInsights(admin, businessId);
  if (stored.ok) {
    const inRange = stored.months.filter((m) => m.month >= from && m.month <= to);
    console.log(`Stored in PostScore (${inRange.map((m) => m.month).join(", ") || "none"}): ${inRange.reduce((a, m) => a + totalViews(m), 0).toLocaleString("en-US")} views, ${inRange.reduce((a, m) => a + actions(m), 0).toLocaleString("en-US")} interactions (full months only; a month in progress isn't stored)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
