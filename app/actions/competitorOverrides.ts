"use server";

// The owner's own competitor choices, all plans (supabase/competitor-overrides.sql):
// - Remove (Closed / Not really a competitor / Other) — gone from the list
//   now and never picked by a future scan; "Restore" undoes it.
// - Add a competitor — search Google by name (ONE Text Search call, inside
//   PLACES_SEARCH_MONTHLY_CAP), pick one: it joins the latest list now
//   (scored from that same search) and every future scan keeps it.
// Owner-only through RLS; nothing here reads or stores review text.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeLocale } from "@/lib/i18n";
import { isRemoveReason, type RemoveReason } from "@/lib/competitorOverrides";
import { placesSearchMonthlyCap } from "@/lib/placesSearchBudget";
import { MAX_COMPETITOR_DISTANCE_METERS } from "@/lib/competitorQuality";
import type { NearbyCandidate } from "@/lib/google/places";

const MISSING_TABLE = new Set(["PGRST205", "42P01", "PGRST204", "42703"]);
/** At most this many owner-added competitors per business. */
const MAX_ADDED = 5;
/** A name search's results stay pickable this long (same server process). */
const PICK_TTL_MS = 15 * 60 * 1000;
const picked = new Map<string, { candidate: NearbyCandidate; at: number }>();

export type OverrideResult = { status: "ok" } | { status: "unauthenticated" | "not_found" | "not_enabled" | "invalid" | "limit" | "error" };

export interface CompetitorSearchHit {
  placeId: string;
  name: string;
  address: string | null;
  distanceMeters: number | null;
  rating: number | null;
  reviewCount: number | null;
  /** Farther than 15 miles — can't be added. */
  tooFar: boolean;
  /** Already on the list or already added. */
  alreadyListed: boolean;
}
export type SearchCompetitorResult =
  | { status: "ok"; hits: CompetitorSearchHit[] }
  | { status: "capped" }
  | { status: "unauthenticated" | "not_found" | "invalid" | "error" };

async function ownBusiness(businessId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, business: null };
  const { data: business } = await supabase.from("businesses").select("id, place_id, lat, lng, address, language").eq("id", businessId).eq("owner_id", user.id).maybeSingle();
  return { supabase, user, business: business as { id: string; place_id: string; lat: number | null; lng: number | null; address: string | null; language: string | null } | null };
}

function done(businessId: string): OverrideResult {
  revalidatePath(`/business/${businessId}/competitors`);
  return { status: "ok" };
}

/** "Remove" with the owner's reason. */
export async function removeCompetitor(businessId: string, placeId: string, reason: RemoveReason, name: string | null): Promise<OverrideResult> {
  if (typeof placeId !== "string" || !placeId || !isRemoveReason(reason)) return { status: "invalid" };
  const { supabase, user, business } = await ownBusiness(businessId);
  if (!user) return { status: "unauthenticated" };
  if (!business || business.place_id === placeId) return { status: "not_found" };
  const { error } = await supabase
    .from("competitor_overrides")
    .upsert({ business_id: businessId, place_id: placeId, action: "removed", reason, name: typeof name === "string" ? name.slice(0, 200) : null, created_by: user.id, created_at: new Date().toISOString() }, { onConflict: "business_id,place_id" });
  if (error) return { status: MISSING_TABLE.has(error.code ?? "") ? "not_enabled" : "error" };
  return done(businessId);
}

/** Undo a Remove (or an Add): the place is picked by the usual rules again. */
export async function restoreCompetitor(businessId: string, placeId: string): Promise<OverrideResult> {
  if (typeof placeId !== "string" || !placeId) return { status: "invalid" };
  const { supabase, user, business } = await ownBusiness(businessId);
  if (!user) return { status: "unauthenticated" };
  if (!business) return { status: "not_found" };
  const { error } = await supabase.from("competitor_overrides").delete().eq("business_id", businessId).eq("place_id", placeId);
  if (error) return { status: MISSING_TABLE.has(error.code ?? "") ? "not_enabled" : "error" };
  return done(businessId);
}

/** "Add a competitor": ONE Text Search by name, near the business. */
export async function searchCompetitorToAdd(businessId: string, query: string): Promise<SearchCompetitorResult> {
  const q = typeof query === "string" ? query.trim().replace(/\s+/g, " ") : "";
  if (q.length < 2 || q.length > 80) return { status: "invalid" };
  const { supabase, user, business } = await ownBusiness(businessId);
  if (!user) return { status: "unauthenticated" };
  if (!business || business.lat === null || business.lng === null) return { status: "not_found" };
  const budget = await import("@/lib/placesSearchBudget.server");
  try {
    const { used } = await budget.placesSearchCallsThisMonth();
    // One call: it runs while one more fits under the cap.
    if (used + 1 > placesSearchMonthlyCap()) return { status: "capped" };
  } catch {
    // An unreadable count never blocks one search.
  }
  const [{ searchTextCompetitors }, { distanceMetersBetween }] = await Promise.all([import("@/lib/google/places"), import("@/lib/competitors")]);
  let results: NearbyCandidate[];
  try {
    results = await searchTextCompetitors({ textQuery: q, lat: business.lat, lng: business.lng, radiusMeters: 25_000, pageSize: 5 });
  } catch (err) {
    console.error(`[competitors] name search failed for ${businessId}:`, err instanceof Error ? err.message : err);
    return { status: "error" };
  } finally {
    await budget.logPlacesSearchCalls(businessId, 1);
  }
  const { data: listed } = await supabase.from("competitor_overrides").select("place_id, action").eq("business_id", businessId);
  const added = new Set(((listed ?? []) as Array<{ place_id: string; action: string }>).filter((r) => r.action === "added").map((r) => r.place_id));
  const now = Date.now();
  const hits = results
    .filter((c) => c.placeId !== business.place_id && c.businessStatus !== "CLOSED_PERMANENTLY")
    .map((c): CompetitorSearchHit => {
      picked.set(`${businessId}:${c.placeId}`, { candidate: c, at: now });
      const distanceMeters = c.location ? distanceMetersBetween({ lat: business.lat!, lng: business.lng! }, c.location) : null;
      return {
        placeId: c.placeId,
        name: c.details?.name ?? c.name ?? "",
        address: c.formattedAddress,
        distanceMeters,
        rating: c.details?.rating ?? null,
        reviewCount: c.details?.userRatingCount ?? null,
        tooFar: distanceMeters === null || distanceMeters > MAX_COMPETITOR_DISTANCE_METERS,
        alreadyListed: added.has(c.placeId),
      };
    });
  return { status: "ok", hits };
}

/** Pick one from the name search: saved, and on the latest list now. */
export async function addCompetitor(businessId: string, placeId: string): Promise<OverrideResult> {
  if (typeof placeId !== "string" || !placeId) return { status: "invalid" };
  const { supabase, user, business } = await ownBusiness(businessId);
  if (!user) return { status: "unauthenticated" };
  if (!business || business.place_id === placeId || business.lat === null || business.lng === null) return { status: "not_found" };
  // Only a place this owner's own search just returned (never a forged one).
  const cached = picked.get(`${businessId}:${placeId}`);
  if (!cached || Date.now() - cached.at > PICK_TTL_MS) return { status: "invalid" };
  const candidate = cached.candidate;

  const { data: existing, error: readError } = await supabase.from("competitor_overrides").select("place_id, action").eq("business_id", businessId);
  if (readError) return { status: MISSING_TABLE.has(readError.code ?? "") ? "not_enabled" : "error" };
  const addedCount = ((existing ?? []) as Array<{ place_id: string; action: string }>).filter((r) => r.action === "added" && r.place_id !== placeId).length;
  if (addedCount >= MAX_ADDED) return { status: "limit" };

  const { distanceMetersBetween, rankedFromCandidate, savedScanRow } = await import("@/lib/competitors");
  const distanceMeters = candidate.location ? distanceMetersBetween({ lat: business.lat, lng: business.lng }, candidate.location) : null;
  if (distanceMeters === null || distanceMeters > MAX_COMPETITOR_DISTANCE_METERS) return { status: "invalid" };

  const { error } = await supabase
    .from("competitor_overrides")
    .upsert({ business_id: businessId, place_id: placeId, action: "added", reason: null, name: (candidate.details?.name ?? candidate.name ?? "").slice(0, 200), created_by: user.id, created_at: new Date().toISOString() }, { onConflict: "business_id,place_id" });
  if (error) return { status: MISSING_TABLE.has(error.code ?? "") ? "not_enabled" : "error" };

  // Join the latest saved list now, scored from the same search — dated
  // like the rest of that scan, so the 30-day refresh clock doesn't move.
  const { data: latest } = await supabase.from("competitor_scans").select("scan_id, created_at").eq("business_id", businessId).eq("is_subject", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (latest) {
    const { data: already } = await supabase.from("competitor_scans").select("place_id").eq("scan_id", latest.scan_id).eq("place_id", placeId).maybeSingle();
    if (!already) {
      const ranked = rankedFromCandidate(candidate, distanceMeters, normalizeLocale(business.language));
      await supabase.from("competitor_scans").insert({ ...savedScanRow(ranked, latest.scan_id, businessId), created_at: latest.created_at });
    }
  }
  picked.delete(`${businessId}:${placeId}`);
  return done(businessId);
}
