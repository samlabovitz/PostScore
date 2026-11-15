// Reads one connected business's monthly numbers from Google's Business
// Profile Performance API and saves the monthly totals (printing what was saved per month)
// (lib/gbpInsights.server.ts) — the same code the monthly job runs. Reads
// from Google only; writes only PostScore's gbp_monthly_insights rows.
// Needs supabase/gbp-monthly-insights.sql to have been run.
//
//   npx tsx --env-file=.env.local scripts/fetch-insights.ts --business <id>              (the last full month)
//   npx tsx --env-file=.env.local scripts/fetch-insights.ts --business <id> --months 18  (the last 18 full months)

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
import { lastFullMonth, monthRange, totalViews, actions } from "../lib/gbpInsights";

/** lib/gbpInsights.server.ts guards itself with `import "server-only"`,
 * which throws outside Next — neutralized at the module loader (the same
 * workaround as scripts/rescan-all.ts). */
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
  const count = Number.parseInt(arg("--months") ?? "1", 10);
  if (!businessId || !Number.isFinite(count) || count < 1 || count > 18) {
    console.error("Usage: scripts/fetch-insights.ts --business <id> [--months N]   (N = 1–18, default 1)");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (use --env-file=.env.local).");
  allowServerOnly();
  const { runInsightsFetchWithClient, loadInsights } = await import("../lib/gbpInsights.server");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const table = await admin.from("gbp_monthly_insights").select("id", { head: true, count: "exact" });
  if (table.error) throw new Error(`The gbp_monthly_insights table isn't there yet — run supabase/gbp-monthly-insights.sql first (${table.error.code ?? table.error.message}).`);

  const months = monthRange(lastFullMonth(new Date()), count);
  console.log(`Reading ${months[0]} … ${months[months.length - 1]} from Google for ${businessId}…`);
  const run = await runInsightsFetchWithClient(admin, businessId, months);
  console.log(`Result: ${JSON.stringify(run)}`);
  if (run.status !== "ok") process.exit(2);
  if (count >= 18) await admin.from("gbp_connections").update({ insights_backfilled_at: new Date().toISOString() }).eq("business_id", businessId);

  const stored = await loadInsights(admin, businessId);
  if (stored.ok)
    for (const m of stored.months.slice(-Math.min(count, 18)))
      console.log(`  ${m.month}: ${totalViews(m)} views (Search phone ${m.viewsSearchMobile}, Maps phone ${m.viewsMapsMobile}, Search computer ${m.viewsSearchDesktop}, Maps computer ${m.viewsMapsDesktop}) · ${actions(m)} interactions (calls ${m.calls}, directions ${m.directions}, website ${m.websiteClicks}, bookings ${m.bookings}, messages ${m.conversations}, food orders ${m.foodOrders})${m.topKeywords ? ` · ${m.topKeywords.length} search terms` : ""}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
