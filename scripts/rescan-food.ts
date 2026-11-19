// Day 23 2d-5: reads only PostScore's own saved results and the owner's
// confirmed details; Google's values are read live when needed (counted,
// capped Places reads — Business Profile when connected), never saved.
// Online ordering, step 1: re-scans ONLY the food businesses (restaurants,
// cafés, bakeries, dessert shops — lib/serviceOptions.ts FOOD_PROFILE_IDS)
// so their Google service options (takeout, delivery, curbside, dine-in)
// get collected. No points come from them yet.
//
// It picks the businesses from our own saved results (their saved type), prints what the re-scan will
// call, then hands them to scripts/rescan-all.ts --only=<ids>
// --no-screenshots — the app's own re-scan (rescanBusinessWithClient),
// one at a time, with every cap it already respects:
//   - each Place Details call is checked against PLACES_DETAILS_MONTHLY_CAP
//     (kind "rescan_all": over the cap, or the count unreadable, it keeps
//     the saved listing data and makes no call);
//   - never a screenshot (--no-screenshots), never a competitor scan;
//   - Browserless renders stay within their own monthly cap.
//
//   npx tsx --env-file=.env.local scripts/rescan-food.ts --dry-run
//   npx tsx --env-file=.env.local scripts/rescan-food.ts
//
// --dry-run: no Google call, no write — the list and the call count.

import { spawnSync } from "child_process";
import { createClient } from "@supabase/supabase-js";
import { resolveBizProfile } from "../config/bizProfiles";
import { isFoodBusiness } from "../lib/serviceOptions";
import { BILLED_DETAILS_KINDS, placesDetailsMonthlyCap } from "../lib/placesDetailsBudget";
import { monthStartUtc } from "../lib/placesSearchBudget";
import { businessWebsiteUrl } from "../lib/businessWebsite";
import { gradedSiteUrl } from "../lib/gradedSite";

/** PageSpeed: 1 run when Google has real-visitor data, else 3; each run
 * up to 2 attempts (lib/websiteAnalysis.ts fetchMobilePerformance). */
const PAGESPEED_MIN_PER_SITE = 1;
const PAGESPEED_MAX_PER_SITE = 6;
/** Place Details: 1 per business, plus 1 retry only when Google returns no
 * website while one is on file (app/actions/scoring.ts website_retry). */
const DETAILS_MAX_PER_BUSINESS = 2;
/** Place Details Enterprise + Atmosphere, per call (unchanged by step 1). */
const DETAILS_PRICE = 25 / 1000;

type Row = {
  id: string;
  name: string | null;
  category: string | null;
  primary_type: string | null;
  business_type_override: string | null;
  biz_type_resolved?: string | null;
  categories: string[] | null;
  website: string | null;
  verified_website_url: string | null;
  listing_mode: string | null;
  archived_at?: string | null;
  place_id: string | null;
};

/** The food businesses a Google re-scan can reach: a listing, not archived. */
export function foodRescanTargets(rows: Row[]): Row[] {
  return rows.filter(
    (b) =>
      !!b.place_id &&
      b.listing_mode !== "website_only" &&
      !b.archived_at &&
      isFoodBusiness(resolveBizProfile(b.category, b.primary_type, b.business_type_override, "en", b.categories, b.name, b.biz_type_resolved).id)
  );
}

/** The Google calls the re-scan will make, from saved data. */
export function foodRescanCalls(targets: Row[]): { details: { min: number; max: number }; pageSpeed: { min: number; max: number }; safeBrowsing: number; sites: number } {
  const sites = targets.filter((b) => businessWebsiteUrl(b) !== null).length;
  return {
    details: { min: targets.length, max: targets.length * DETAILS_MAX_PER_BUSINESS },
    pageSpeed: { min: sites * PAGESPEED_MIN_PER_SITE, max: sites * PAGESPEED_MAX_PER_SITE },
    safeBrowsing: sites,
    sites,
  };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (use --env-file=.env.local).");
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Day 23 2d-5: our own saved type and the site our last scan graded —
  // Google's category, name and link aren't saved.
  const saved = await db.from("businesses").select("id, business_type_override, biz_type_resolved, verified_website_url, website_analysis_json, listing_mode, archived_at, place_id").order("created_at");
  if (saved.error) throw new Error(`Couldn't read businesses: ${saved.error.message}`);
  const rows: Row[] = ((saved.data ?? []) as Array<Omit<Row, "name" | "category" | "primary_type" | "categories" | "website"> & { website_analysis_json: unknown }>).map(({ website_analysis_json, ...r }) => ({
    ...r,
    name: null,
    category: null,
    primary_type: null,
    categories: null,
    website: gradedSiteUrl(website_analysis_json),
  }));
  const targets = foodRescanTargets(rows);
  const calls = foodRescanCalls(targets);

  // This month's Place Details count against the cap (a read — no Google call).
  const used = await db.from("places_calls").select("calls").in("kind", BILLED_DETAILS_KINDS as string[]).gte("created_at", monthStartUtc(new Date()));
  const usedCalls = used.error ? null : (used.data ?? []).reduce((s, r) => s + (Number((r as { calls: number }).calls) || 0), 0);
  const cap = placesDetailsMonthlyCap();

  console.log(`${dryRun ? "DRY RUN — no Google call, no write. " : ""}Food businesses to re-scan: ${targets.length}\n`);
  for (const b of targets) console.log(`  ${b.name ?? "(unnamed)"}${businessWebsiteUrl(b) ? "" : "  (no website — Places Details only)"}`);
  console.log(`
Google calls this re-scan will make:
  Places API Place Details (billed, Enterprise + Atmosphere, $25 per 1,000): ${calls.details.min}${calls.details.max > calls.details.min ? ` — up to ${calls.details.max} if Google returns no website for some (one retry each)` : ""}
    ≈ $${(calls.details.min * DETAILS_PRICE).toFixed(2)}–$${(calls.details.max * DETAILS_PRICE).toFixed(2)} before Google's monthly free usage
    This month so far: ${usedCalls ?? "couldn't read (the re-scan will keep saved data instead of calling)"} of ${cap} (PLACES_DETAILS_MONTHLY_CAP)${usedCalls !== null && usedCalls + calls.details.max > cap ? " — the cap stops it early; the rest keep their saved data" : ""}
  PageSpeed Insights (free): ${calls.pageSpeed.min}–${calls.pageSpeed.max} for ${calls.sites} website(s)
  Safe Browsing (free): up to ${calls.safeBrowsing}
  Competitor searches: 0 · ScreenshotOne: 0 (--no-screenshots)`);

  const args = ["tsx", "scripts/rescan-all.ts", `--only=${targets.map((b) => b.id).join(",")}`, "--no-screenshots", ...(dryRun ? ["--dry-run"] : [])];
  if (targets.length === 0) return;
  console.log(`\n${dryRun ? "Handing the list to rescan-all's own dry run:" : "Running:"} npx ${args.slice(0, 3).join(" ")} --no-screenshots${dryRun ? " --dry-run" : ""}\n`);
  const r = spawnSync("npx", ["--no-install", ...args], { stdio: "inherit", env: process.env });
  process.exit(r.status ?? 1);
}

// Run only as a script (tests import the helpers above).
if (process.argv[1]?.endsWith("rescan-food.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
