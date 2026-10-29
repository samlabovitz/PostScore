// Competitor selection v2 — SAVE for the named businesses only (approved
// one by one after the dry run, scripts/competitors-v2-dry-run.ts). Runs
// the same scan as "Refresh competitors" (Text Search first, Nearby only as
// the fallback; PLACES_SEARCH_MONTHLY_CAP checked, calls logged), saves it
// as a new competitor scan, then runs its full scoring right here (the job
// a new scan always runs: PageSpeed, Safe Browsing, page fetches).
//
//   npx --no-install tsx --env-file=.env.local scripts/save-competitors-v2.ts --only "Hair express on Broadway"

/* eslint-disable no-console, @typescript-eslint/no-require-imports -- the server-only stub must load before the app modules (same as competitor-full-scoring.ts) */
const Module = require("module");
const origLoad = Module._load;
Module._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return origLoad.call(this, req, ...rest);
};

const argv = process.argv.slice(2);
const ONLY = argv.flatMap((a, i) => (a === "--only" ? [argv[i + 1]] : []));

(async () => {
  if (ONLY.length === 0) {
    console.log('Nothing to do: pass --only "Business name" (exact; repeatable).');
    return;
  }
  const { createAdminClient } = require("../lib/supabase/admin");
  const { runAndSaveCompetitorScanWithClient } = require("../app/actions/competitors");
  const { queueScoringJob, runCompetitorScoringJob } = require("../lib/competitorScoringJob");
  const { groupSavedScans, SAVED_SCAN_COLUMNS } = require("../lib/savedCompetitorScans");
  const { ownerStanding } = require("../lib/competitorComparison");
  const { applyOverrides, overridesFromRows } = require("../lib/competitorOverrides");
  const { applyScope } = require("../lib/competitorScope");
  const { loadBusinessNiche } = require("../lib/businessNiche.server");
  const db = createAdminClient();

  const { data: businesses, error } = await db.from("businesses").select("id, name").in("name", ONLY);
  if (error) throw error;
  for (const name of ONLY) if (!(businesses ?? []).some((b: { name: string }) => b.name === name)) console.log(`Not found (exact name): ${name}`);

  for (const b of businesses ?? []) {
    const before = groupSavedScans(((await db.from("competitor_scans").select(SAVED_SCAN_COLUMNS).eq("business_id", b.id).order("created_at", { ascending: false }).limit(60)).data ?? []))[0];
    const result = await runAndSaveCompetitorScanWithClient(db, b.id, {
      enforceCooldown: false,
      startScoring: async (scanId: string, businessId: string, count: number) => {
        await queueScoringJob(db, scanId, businessId, "new_scan", count);
        const out = await runCompetitorScoringJob(db, scanId, { log: (l: string) => console.log(`${b.name}:${l}`) });
        console.log(`${b.name}: full scoring ${JSON.stringify(out)}`);
      },
    });
    console.log(`${b.name}: ${JSON.stringify(result)}`);
    if (result.status !== "saved") continue;
    // As the Competitors page shows it: the owner's Remove / Add applied,
    // ranked within the niche scope.
    const { data: ov } = await db.from("competitor_overrides").select("place_id, action, reason, name, created_at").eq("business_id", b.id);
    const overrides = overridesFromRows(ov ?? []);
    const scope = (await loadBusinessNiche(db, b.id))?.scope ?? null;
    const saved = applyOverrides(groupSavedScans(((await db.from("competitor_scans").select(SAVED_SCAN_COLUMNS).eq("scan_id", result.scanId)).data ?? []))[0], overrides);
    const scan = scope ? applyScope(saved, scope).scan : saved;
    const standing = ownerStanding(saved, scope);
    const old = before ? ownerStanding(applyOverrides(before, overrides), scope) : null;
    console.log(`\n${b.name}: rank ${old ? `#${old.rank} of ${old.of}` : "—"} → #${standing?.rank} of ${standing?.of}`);
    for (const e of scan.entries) {
      console.log(`  ${e.isSubject ? "YOU " : "    "}${String(e.total ?? "—").padStart(3)}  ${e.name}${e.ownerAdded ? " (Added by you)" : ""}${e.distanceMeters !== null ? ` · ${(e.distanceMeters / 1609.34).toFixed(1)} mi` : ""} · ${e.reviewCount ?? 0} reviews`);
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
