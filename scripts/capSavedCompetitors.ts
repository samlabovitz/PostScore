// One-time (Day 19): the latest saved competitor list of every business,
// capped at the 10 most relevant (lib/competitorQuality.ts
// selectCompetitors) — from saved data only, no Google or PageSpeed calls.
// Lists over 10 came only from the owner's "also competes with" areas
// being added after the cap; new scans are capped when they're made.

import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_COMPETITORS } from "../lib/competitors";
import { selectCompetitors, type PoolEntry } from "../lib/competitorQuality";
import { groupSavedScans, SAVED_SCAN_COLUMNS, type SavedScanRow } from "../lib/savedCompetitorScans";
import { ownerStanding } from "../lib/competitorComparison";
import { resolveBusinessNiche, competitorScopeFor } from "../lib/businessNiche";
import { nicheSearchTypes } from "../lib/competitorScope";
import type { NearbyCandidate } from "../lib/google/places";

type Row = SavedScanRow & { id: string; business_status?: string | null };

/** A saved row as the selection sees a search result. */
function asCandidate(r: Row): NearbyCandidate {
  return {
    placeId: r.place_id,
    name: r.name,
    formattedAddress: r.address,
    types: r.categories ?? null,
    primaryType: r.categories?.[0] ?? null,
    primaryTypeDisplayName: null,
    businessStatus: r.business_status ?? "OPERATIONAL",
    location: null,
    priceLevel: r.price_level,
    details: { name: r.name, website: r.website_url ?? null, userRatingCount: r.review_count, businessStatus: r.business_status ?? "OPERATIONAL" } as never,
  };
}

export interface CapResult {
  businessId: string;
  name: string;
  scanId: string;
  before: { rank: number; of: number } | null;
  after: { rank: number; of: number } | null;
  removed: Row[];
}

export async function capSavedCompetitorLists(db: SupabaseClient, opts: { apply: boolean }): Promise<CapResult[]> {
  const { data: businesses } = await db.from("businesses").select("*");
  const results: CapResult[] = [];
  for (const b of (businesses ?? []) as Array<Record<string, unknown> & { id: string; name: string | null }>) {
    const { data: latest } = await db.from("competitor_scans").select("scan_id").eq("business_id", b.id).order("created_at", { ascending: false }).limit(1);
    const scanId = latest?.[0]?.scan_id as string | undefined;
    if (!scanId) continue;
    const { data } = await db.from("competitor_scans").select(`id, business_status, ${SAVED_SCAN_COLUMNS}`).eq("scan_id", scanId);
    const rows = (data ?? []) as Row[];
    const others = rows.filter((r) => !r.is_subject);
    if (others.length <= MAX_COMPETITORS) continue;

    const niche = nicheSearchTypes(competitorScopeFor(resolveBusinessNiche(b as never), b as never));
    const wide = new Set(niche?.wideTypes ?? []);
    const direct = new Set(niche?.directTypes ?? []);
    const pool: PoolEntry[] = others.map((r) => {
      const type = r.categories?.[0] ?? "";
      return { candidate: asCandidate(r), distanceMeters: Number(r.distance_meters ?? 0), area: wide.has(type) && !direct.has(type) };
    });
    const keep = new Set(selectCompetitors(pool, MAX_COMPETITORS).map((p) => p.candidate.placeId));
    const removed = others.filter((r) => !keep.has(r.place_id));
    const standing = (rs: Row[]) => {
      const s = ownerStanding(groupSavedScans(rs)[0]);
      return s ? { rank: s.rank, of: s.of } : null;
    };
    const capped = rows.filter((r) => r.is_subject || keep.has(r.place_id));
    if (opts.apply && removed.length > 0) {
      const { error } = await db.from("competitor_scans").delete().in("id", removed.map((r) => r.id));
      if (error) throw new Error(`${b.name}: ${error.message}`);
    }
    results.push({ businessId: b.id, name: b.name ?? b.id, scanId, before: standing(rows), after: standing(capped), removed });
  }
  return results;
}
