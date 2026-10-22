// Competitor audit: every business whose latest saved competitor scan has
// 0–2 competitors, why, and whether the competitor-search fix resolves it.
// Writes ~/Desktop/competitor-audit.md.
//
// Read-only by default (stored data only — no Google calls). With
// --rerun it re-runs the competitor search for the flagged businesses
// through the app's own runAndSaveCompetitorScanWithClient — the same
// PLACES_SEARCH_MONTHLY_CAP check, call logging and background scoring as
// "Refresh competitors" — and reports the new counts.
//
// Usage:
//   npx tsx scripts/competitor-audit.ts
//   npx tsx scripts/competitor-audit.ts --rerun

/* eslint-disable no-console */
// lib/supabase/admin.ts guards itself with `import "server-only"`, which
// throws outside Next — stub it, as scripts/competitor-full-scoring.ts
// and scripts/rescan-all.ts do, so call logging and scoring really run.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NodeModule = require("module") as { _load: (request: string, ...rest: unknown[]) => unknown };
const originalLoad = NodeModule._load;
NodeModule._load = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

import { createClient } from "@supabase/supabase-js";

type Row = { id: string; name: string | null; address: string | null; primary_type: string | null; categories: string[] | null; category: string | null; lat: number | null; lng: number | null; listing_mode: string | null; business_type_override: string | null; niche_id?: string | null };

async function main() {
  const rerun = process.argv.includes("--rerun");
  const { competitorScanBlocker, isFoodServiceType } = await import("../lib/competitors");
  const { resolveBusinessNiche, competitorScopeFor } = await import("../lib/businessNiche");
  const { nicheSearchTypes } = await import("../lib/competitorScope");
  const { placesSearchMonthlyCap, MAX_CALLS_PER_SCAN } = await import("../lib/placesSearchBudget");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const { data: rows, error } = await db.from("businesses").select("*").order("created_at");
  if (error || !rows) throw new Error(error?.message ?? "no businesses");
  const businesses = (rows as Row[]).filter((b) => b.listing_mode !== "website_only");

  const latestCount = async (id: string) => {
    const { data } = await db.from("competitor_scans").select("scan_id, created_at").eq("business_id", id).order("created_at", { ascending: false }).limit(1);
    const scan = (data ?? [])[0] as { scan_id: string; created_at: string } | undefined;
    if (!scan) return null;
    const { count } = await db.from("competitor_scans").select("id", { count: "exact", head: true }).eq("scan_id", scan.scan_id).eq("is_subject", false);
    return { at: scan.created_at, competitors: count ?? 0 };
  };

  const BROAD = new Set(["restaurant", "meal_takeaway", "meal_delivery"]);
  type Finding = { b: Row; before: { at: string; competitors: number } | null; why: string; fix: string; rerun: boolean; after?: string };
  const findings: Finding[] = [];
  for (const b of businesses) {
    const before = await latestCount(b.id);
    if (before && before.competitors >= 3) continue;
    const resolved = resolveBusinessNiche(b as never);
    const niche = nicheSearchTypes(competitorScopeFor(resolved, b as never));
    const blocker = competitorScanBlocker({ lat: b.lat, lng: b.lng, primaryType: b.primary_type, categories: b.categories, fallbackPlaceTypes: niche?.directTypes ?? [] });
    const types = [b.primary_type, ...(b.categories ?? [])].filter(Boolean) as string[];
    const onlyBroadFood = !!b.primary_type && BROAD.has(b.primary_type) && !types.some((t) => isFoodServiceType(t) && !BROAD.has(t));
    let why: string;
    let fix: string;
    let canRerun = true;
    if (blocker === "no_location") {
      why = "no saved coordinates — a search can't run";
      fix = "No — needs the listing's location (re-scan the business).";
      canRerun = false;
    } else if (blocker === "category_too_generic") {
      why = "only generic Google types (e.g. \"store\", \"service\") and no niche — a search can't run";
      fix = "No — the owner needs to pick a business type/niche in Settings.";
      canRerun = false;
    } else if (!before) {
      why = "no competitor scan saved yet";
      fix = "Yes — re-run.";
    } else if (onlyBroadFood) {
      why = `primary type "${b.primary_type}" is a broad food tag — the old search kept only places with that same PRIMARY tag, and nearby food places are filed under their cuisine (the Umami bug)`;
      fix = "Yes — broad food types now compare with nearby food places of any cuisine.";
    } else {
      why = `searched "${niche?.directTypes?.join(", ") || b.primary_type}" up to 5 mi and found ${before.competitors}`;
      fix = "Maybe — fewer than 3 now triggers one broader search (same family / any cuisine); re-run to see.";
    }
    findings.push({ b, before, why, fix, rerun: canRerun });
  }

  if (rerun) {
    const { runAndSaveCompetitorScanWithClient } = await import("../app/actions/competitors");
    const { data: used } = await db.from("places_calls").select("calls").eq("kind", "competitor_scan").gte("created_at", new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString());
    let budget = placesSearchMonthlyCap() - (used ?? []).reduce((s, r: { calls: number }) => s + r.calls, 0);
    for (const f of findings.filter((x) => x.rerun)) {
      if (budget < MAX_CALLS_PER_SCAN) {
        f.after = "not re-run — this month's search cap would be exceeded";
        continue;
      }
      const result = await runAndSaveCompetitorScanWithClient(db as never, f.b.id, { enforceCooldown: false });
      budget -= MAX_CALLS_PER_SCAN;
      const now = await latestCount(f.b.id);
      f.after =
        result.status === "saved"
          ? `re-run: ${now?.competitors ?? 0} competitor(s) found (${result.placesCalls ?? "?"} search calls)`
          : result.status === "no_data"
            ? "re-run: searched and still found none nearby"
            : `re-run did not complete: ${result.status}${"message" in result ? ` — ${result.message}` : ""}`;
      console.log(`${f.b.name}: ${f.after}`);
    }
  }

  const out = [
    "# Competitor audit",
    "",
    `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC — ${businesses.length} businesses with a Google listing; ${findings.length} have 0–2 competitors in their latest saved scan (or no scan).${rerun ? " Flagged ones were re-run with the fixed search." : " Stored data only (no Google calls)."}`,
    "",
    "| Business | Competitors before | Why | Does the fix resolve it? | After re-run |",
    "|---|---|---|---|---|",
    ...findings.map((f) => `| ${f.b.name ?? "(unnamed)"}<br><small>${f.b.address ?? ""}</small> | ${f.before ? `${f.before.competitors} (scan ${f.before.at.slice(0, 10)})` : "no scan"} | ${f.why} | ${f.fix} | ${f.after ?? (f.rerun ? "—" : "not re-run (can't search)")} |`),
    "",
  ];
  fs.writeFileSync(path.join(os.homedir(), "Desktop", "competitor-audit.md"), out.join("\n"));
  console.log(`wrote ~/Desktop/competitor-audit.md (${findings.length} flagged)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
