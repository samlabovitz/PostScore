"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import {
  findAndScoreCompetitors,
  type CompetitorScanResult,
  type CompetitorSourceBusiness,
} from "@/lib/competitors";
import { bizProfile } from "@/config/bizProfiles";

interface CompetitorBusinessRow {
  place_id: string;
  name: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  categories: string[] | null;
  opening_hours: string[] | null;
  photo_count: number | null;
  business_status: string | null;
  https_status: string | null;
  primary_type: string | null;
  lat: number | null;
  lng: number | null;
}

export type GetCompetitorsResult =
  | {
      status: "ok";
      businessName: string | null;
      businessAddress: string | null;
      /** The resolved business-type profile's noun, e.g. "salons" — see config/bizProfiles.ts. */
      competitorNoun: string;
      result: CompetitorScanResult;
    }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * Loads a saved business (RLS-scoped to the current user) and runs the
 * live competitor scan against it. Never writes to the database — same
 * "free to view" model as scoreBusinessById.
 */
export async function getCompetitors(businessId: string): Promise<GetCompetitorsResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: business, error } = await supabase
    .from("businesses")
    .select(
      "place_id, name, address, phone, website, rating, review_count, category, categories, opening_hours, photo_count, business_status, https_status, primary_type, lat, lng"
    )
    .eq("id", businessId)
    .single();

  if (error || !business) {
    return { status: "not_found" };
  }

  const row = business as CompetitorBusinessRow;
  const subject: CompetitorSourceBusiness = {
    placeId: row.place_id,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    primaryType: row.primary_type,
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
  };

  try {
    const result = await findAndScoreCompetitors(subject);
    const competitorNoun = bizProfile(row.category, row.primary_type).competitorNoun;
    return {
      status: "ok",
      businessName: row.name,
      businessAddress: row.address,
      competitorNoun,
      result,
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Could not load competitors.",
    };
  }
}

export type SaveCompetitorScanResult =
  | { status: "saved"; scanId: string }
  | { status: "no_data" }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * Re-runs the live competitor scan and persists one row per ranked entry
 * (the saved business plus every scored competitor) into
 * competitor_scans, tagged with a shared scan_id — one snapshot in time,
 * never overwritten, so history can accumulate like `scores` does.
 */
export async function saveCompetitorScan(businessId: string): Promise<SaveCompetitorScanResult> {
  const fetched = await getCompetitors(businessId);
  if (fetched.status !== "ok") return fetched;
  if (fetched.result.status !== "ok" || fetched.result.ranked.length === 0) {
    return { status: "no_data" };
  }

  const supabase = createClient();
  const scanId = randomUUID();

  const rows = fetched.result.ranked.map((r) => ({
    scan_id: scanId,
    business_id: businessId,
    is_subject: r.isSubject,
    place_id: r.placeId,
    name: r.name,
    address: r.address,
    distance_meters: r.distanceMeters,
    rating: r.rating,
    review_count: r.reviewCount,
    has_website: r.hasWebsite,
    total: r.breakdown.total,
    grade: r.breakdown.grade,
    scoring_version: r.breakdown.scoringVersion,
    breakdown_json: r.breakdown,
    price_level: r.priceLevel,
  }));

  const { error } = await supabase.from("competitor_scans").insert(rows);
  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "saved", scanId };
}

export interface CompetitorScanHistoryRow {
  scan_id: string;
  created_at: string;
  is_subject: boolean;
  name: string | null;
  total: number | null;
  grade: string | null;
}

/** Most recent saved competitor scans for a business, newest first. RLS-scoped. */
export async function getCompetitorScanHistory(
  businessId: string
): Promise<CompetitorScanHistoryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("competitor_scans")
    .select("scan_id, created_at, is_subject, name, total, grade")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return data;
}

export interface CompetitorSnapshotEntry {
  name: string | null;
  isSubject: boolean;
  total: number | null;
  grade: string | null;
  priceLevel: string | null;
}

export interface CompetitorSnapshot {
  scanId: string;
  createdAt: string;
  entries: CompetitorSnapshotEntry[];
}

/**
 * The single most recent saved competitor scan for a business, or null if
 * none has ever been saved. Deliberately reads the LAST *saved* scan
 * (competitor_scans, a plain DB read) rather than re-running the live
 * Google Places scan getCompetitors() does — used to ground the "Ask
 * about your presence" assistant (see app/actions/assistant.ts) without
 * spending a fresh round of Places API calls on every chat message. If
 * the owner has never clicked "Save this scan," this honestly returns
 * null rather than silently running a live scan the owner didn't ask for.
 */
export async function getLatestCompetitorSnapshot(businessId: string): Promise<CompetitorSnapshot | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("competitor_scans")
    .select("scan_id, created_at, is_subject, name, total, grade, price_level")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data || data.length === 0) return null;

  const rows = data as Array<{
    scan_id: string;
    created_at: string;
    is_subject: boolean;
    name: string | null;
    total: number | null;
    grade: string | null;
    price_level: string | null;
  }>;

  const latestScanId = rows[0].scan_id;
  const latestRows = rows.filter((r) => r.scan_id === latestScanId);

  return {
    scanId: latestScanId,
    createdAt: rows[0].created_at,
    entries: latestRows.map((r) => ({
      name: r.name,
      isSubject: r.is_subject,
      total: r.total,
      grade: r.grade,
      priceLevel: r.price_level,
    })),
  };
}
