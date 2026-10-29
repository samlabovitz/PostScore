// Competitor selection v2 — DRY RUN. For each named business: the saved
// competitor list (before) next to what the new selection picks (after:
// Text Search with the customer's query, Nearby Search only as the
// fallback). NOTHING is saved: no competitor_scans rows, no overrides.
// Every Google search call is logged to places_calls ("competitor_scan"),
// so PLACES_SEARCH_MONTHLY_CAP counts it, and the run stops before the cap.
// No PageSpeed: the "after" lists are scored from listing data only.
//
//   npx tsx scripts/competitors-v2-dry-run.ts [--only "Name" …] [--out file.md]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { NearbyCandidate } from "@/lib/google/places";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const DEFAULT_NAMES = ["Hair express", "Kee's", "Mini Shop", "Umami", "Red Bowl", "Switch Skate", "Drybar", "Gregg L. Smith", "Main Street Sweets", "J & G Italian Deli"];
// --only "Name" (repeatable) narrows the run.
const ONLY = process.argv.flatMap((a, i) => (a === "--only" ? [process.argv[i + 1]] : []));
const NAMES = ONLY.length > 0 ? ONLY : DEFAULT_NAMES;
/** The Tarrytown salons the owner expected (diagnosis). */
const EXPECTED_HAIR = ["Ilda", "Hair and Makeup Lounge by Angela", "Eclipse Hair", "New Karma"];

const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? process.argv[outArg + 1] : path.join(os.homedir(), "Desktop", "competitors-v2-dry-run.md");

const BUSINESS_COLUMNS =
  "id, place_id, name, address, phone, website, rating, review_count, category, categories, opening_hours, photo_count, business_status, https_status, website_analysis_json, verified_website_url, website_trust_overrides_json, primary_type, business_type_override, price_level, lat, lng, language";

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { findAndScoreCompetitors, explainCategoryMatch } = await import("@/lib/competitors");
  const { loadBusinessNiche } = await import("@/lib/businessNiche.server");
  const { nicheSearchTypes } = await import("@/lib/competitorScope");
  const { nicheScanFields } = await import("@/lib/competitorNicheRule");
  const { bizProfileById } = await import("@/config/bizProfiles");
  const { canRunScan, placesSearchMonthlyCap } = await import("@/lib/placesSearchBudget");
  const { monthStartUtc } = await import("@/lib/placesSearchBudget");
  // Same count and log as lib/placesSearchBudget.server.ts (which can't be
  // imported outside Next: it's server-only).
  const placesSearchCallsThisMonth = async () => {
    const { data } = await db.from("places_calls").select("calls").eq("kind", "competitor_scan").gte("created_at", monthStartUtc(new Date()));
    return { used: (data ?? []).reduce((sum, r) => sum + (Number((r as { calls: number }).calls) || 0), 0) };
  };
  const logPlacesSearchCalls = async (businessId: string, calls: number) => {
    if (calls > 0) await db.from("places_calls").insert({ business_id: businessId, kind: "competitor_scan", calls });
  };
  const { groupSavedScans, SAVED_SCAN_COLUMNS } = await import("@/lib/savedCompetitorScans");

  const cap = placesSearchMonthlyCap();
  const startUsed = (await placesSearchCallsThisMonth()).used;
  let textCalls = 0;
  let nearbyCalls = 0;
  const out: string[] = [
    "# Competitor selection v2 — dry run",
    "",
    `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · nothing saved · Places search calls this month before the run: ${startUsed} of ${cap}`,
    "",
    "**Before** = the saved list today. **After** = what v2 would pick: Text Search for the customer's query (Google's order shown as G#), Nearby Search only when that finds fewer than 5 of the same kind. Same rules as before: established first (5+ reviews), open only, never the business itself, 15 miles max, 10 max.",
    "",
  ];
  const mi = (m: number | null | undefined) => (m === null || m === undefined ? "" : (m / 1609.34).toFixed(1));

  for (const name of NAMES) {
    const { data: rows } = await db.from("businesses").select(BUSINESS_COLUMNS).ilike("name", `%${name}%`).limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a raw businesses row
    const row = rows?.[0] as Record<string, any> | undefined;
    if (!row) {
      out.push(`## ${name}`, "", "_Not found._", "");
      continue;
    }
    const { used } = await placesSearchCallsThisMonth();
    if (!canRunScan(used, cap)) {
      out.push(`## ${row.name}`, "", `_Skipped: ${used} of ${cap} search calls used this month._`, "");
      continue;
    }
    const niche = await loadBusinessNiche(db as never, row.id);
    const fields = nicheScanFields(niche?.resolved, niche?.scope, row.website ?? row.verified_website_url);
    const subject = {
      placeId: row.place_id,
      name: row.name,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      primaryType: row.primary_type,
      priceLevel: row.price_level,
      fallbackPlaceTypes: bizProfileById(row.business_type_override)?.placesType ?? [],
      rating: row.rating,
      review_count: row.review_count,
      phone: row.phone,
      opening_hours: row.opening_hours,
      website: row.website,
      categories: row.categories,
      category: row.category,
      photo_count: row.photo_count,
      business_status: row.business_status,
      https_status: row.https_status,
      website_analysis_json: row.website_analysis_json,
      verified_website_url: row.verified_website_url,
      website_trust_overrides_json: row.website_trust_overrides_json,
      niche: niche ? nicheSearchTypes(niche.scope) : null,
      ...fields,
      ownerOverrides: null,
    };

    let textResults: NearbyCandidate[] = [];
    const nearbySeen: NearbyCandidate[] = [];
    const result = await findAndScoreCompetitors(subject as never, "en", {
      onSearch: (stage, c) => (stage === "text" ? (textResults = c) : nearbySeen.push(...c)),
    });
    await logPlacesSearchCalls(row.id, result.placesCalls ?? 0);
    textCalls += result.textSearchCalls ?? 0;
    nearbyCalls += (result.placesCalls ?? 0) - (result.textSearchCalls ?? 0);
    const gRank = new Map(textResults.map((c, i) => [c.placeId, i + 1]));

    // Before: the latest saved scan.
    const { data: scanRows } = await db.from("competitor_scans").select(SAVED_SCAN_COLUMNS).eq("business_id", row.id).order("created_at", { ascending: false }).limit(60);
    const before = (groupSavedScans((scanRows ?? []) as never)[0]?.entries ?? []).filter((e) => !e.isSubject).sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
    const after = result.ranked.filter((r) => !r.isSubject).sort((a, b) => (gRank.get(a.placeId) ?? 99) - (gRank.get(b.placeId) ?? 99) || (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
    const beforeIds = new Set(before.map((e) => e.placeId));
    const afterIds = new Set(after.map((e) => e.placeId));

    out.push(`## ${row.name}`, "");
    out.push(`Query: ${result.textQuery ? `\`${result.textQuery}\`` : "_none (no town or no specific kind) — Nearby Search only_"} · calls: ${result.textSearchCalls ?? 0} Text Search + ${(result.placesCalls ?? 0) - (result.textSearchCalls ?? 0)} Nearby · ${result.status}`, "");
    out.push("| # | Before (saved) | mi | reviews | | After (v2) | G# | mi | reviews |", "|---|---|---|---|---|---|---|---|---|");
    const n = Math.max(before.length, after.length);
    for (let i = 0; i < n; i++) {
      const b = before[i];
      const a = after[i];
      const bName = b ? `${b.name ?? ""}${afterIds.has(b.placeId) ? "" : " ✗"}` : "";
      const aName = a ? `${a.name}${beforeIds.has(a.placeId) ? "" : " 🆕"}` : "";
      out.push(`| ${i + 1} | ${bName} | ${b ? mi(b.distanceMeters) : ""} | ${b?.reviewCount ?? ""} | | ${aName} | ${a ? gRank.get(a.placeId) ?? "—" : ""} | ${a ? mi(a.distanceMeters) : ""} | ${a?.reviewCount ?? ""} |`);
    }
    out.push("", "✗ = dropped by v2 · 🆕 = new in v2 · G# = position in Google's results for the query (— = found by the Nearby fallback)", "");

    if (/hair express/i.test(row.name)) {
      out.push("### Why the Tarrytown salons were missing", "");
      out.push(
        "Hair express's niche is \"Hair salon\" (set by the owner). With a niche, the old rule took only places whose MAIN Google type is exactly `hair_salon` — it skipped the hair-salon family (`beauty_salon`, `hair_care`) and the rule that keeps out nail/spa places. Google lists most Tarrytown salons as `beauty_salon`, so they were rejected, while Tatiana Day Spa (main type `hair_salon`, also tagged nail salon and spa) got in. v2 fixes the rule: a niche's types match with the family and its exclusions.",
        ""
      );
      const directTypes = subject.niche?.directTypes ?? [];
      for (const want of EXPECTED_HAIR) {
        const c = [...textResults, ...nearbySeen].find((x) => (x.details?.name ?? x.name ?? "").toLowerCase().includes(want.toLowerCase()));
        const saved = before.find((e) => (e.name ?? "").toLowerCase().includes(want.toLowerCase()));
        if (!c) {
          out.push(`- **${want}**: ${saved ? "on the saved list" : "not on the saved list"}; not in Google's results for the query either.`);
          continue;
        }
        const oldRule = !!c.primaryType && directTypes.includes(c.primaryType);
        const v2 = directTypes.some((type: string) => explainCategoryMatch(c, { type, displayName: row.category ?? null }).matches);
        out.push(
          `- **${c.details?.name ?? c.name}** — Google's #${gRank.get(c.placeId) ?? "—"} for the query, ${mi(c.location ? haversine(row as { lat: number; lng: number }, c.location) : null)} mi, ${c.details?.userRatingCount ?? 0} reviews, main type \`${c.primaryType}\`. Saved list: ${saved ? "yes" : "no"}. Old rule: ${oldRule ? "accepted" : `rejected (main type isn't ${directTypes.join("/")})`}. v2: ${v2 ? "same kind" : "not the same kind"}, ${afterIds.has(c.placeId) ? "picked" : "not picked"}.`
        );
      }
      out.push("");
    }
  }

  const total = textCalls + nearbyCalls;
  out.push(
    "## Cost",
    "",
    `- Text Search calls: ${textCalls}`,
    `- Nearby Search calls (fallback): ${nearbyCalls}`,
    `- Total Places search calls: ${total} (≈ $${(total * 0.035).toFixed(2)} at ~$0.035 each with these listing fields)`,
    "- PageSpeed calls: 0 (the dry run scores from listing data only; nothing is saved, so no full scoring runs)",
    `- This month's search calls: ${startUsed} before → ${startUsed + total} after, cap ${cap}`,
    ""
  );
  fs.writeFileSync(OUT, out.join("\n"));
  console.log(`Wrote ${OUT}: ${textCalls} Text Search + ${nearbyCalls} Nearby = ${total} calls`);
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
