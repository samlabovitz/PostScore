"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import {
  findAndScoreCompetitors,
  MAX_COMPETITORS,
  type CompetitorScanResult,
  type CompetitorSourceBusiness,
} from "@/lib/competitors";
import { resolveBizProfile } from "@/config/bizProfiles";

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
  website_analysis_json: unknown;
  primary_type: string | null;
  business_type_override: string | null;
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
      "place_id, name, address, phone, website, rating, review_count, category, categories, opening_hours, photo_count, business_status, https_status, website_analysis_json, primary_type, business_type_override, lat, lng"
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
    website_analysis_json: row.website_analysis_json,
  };

  try {
    const result = await findAndScoreCompetitors(subject);
    const competitorNoun = resolveBizProfile(row.category, row.primary_type, row.business_type_override).competitorNoun;
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

// ---------------------------------------------------------------------------
// Local benchmark (Day 12c) — "where do I rank against my real local peers,"
// computed entirely from the last SAVED competitor scan (getLatestCompetitor
// Snapshot above), never a fresh live Google Places call. It moves only when
// the owner re-saves a scan on the Competitors page — same cadence as the
// scan data it's built from.
// ---------------------------------------------------------------------------

/**
 * A saved scan with fewer real nearby peers than a scan normally finds
 * (see MAX_COMPETITORS in lib/competitors.ts) is still a legitimate
 * comparison, just a limited one — the UI must say so rather than present
 * a 1-of-1 or 2-of-3 comparison with the same confidence as a full one.
 */
const SMALL_SAMPLE_THRESHOLD = MAX_COMPETITORS;

export interface LocalBenchmark {
  /** The resolved business-type profile's noun, e.g. "salons". */
  competitorNoun: string;
  scanId: string;
  /** ISO timestamp of the scan this benchmark was computed from — callers format for display. */
  scanAt: string;
  subjectTotal: number;
  subjectGrade: string | null;
  /** 1-based rank among the full peer set (this business included), highest PostScore first. */
  rank: number;
  /** Peer set size INCLUDING this business — the "Y" in "#X of Y", same convention the assistant's competitor context and the live Competitors page already use. */
  peerCount: number;
  /** Real nearby peers actually compared against — EXCLUDES this business itself, since a business isn't "nearby" itself. This is the N in "based on N nearby [type]". */
  othersCount: number;
  /** How many of those other peers this business currently outscores (a tie doesn't count as "ahead of"). */
  aheadCount: number;
  /** Rounded 0-100 percent of `othersCount` this business is ahead of. */
  percentileAhead: number;
  /** True when othersCount is below SMALL_SAMPLE_THRESHOLD — the UI must disclose this rather than present a small comparison as a definitive ranking. */
  smallSample: boolean;
}

export type GetLocalBenchmarkResult =
  | { status: "ok"; benchmark: LocalBenchmark }
  /** A scan was saved, but it found no comparable businesses at all to compare against — honest, not an error. */
  | { status: "no_peers"; competitorNoun: string }
  /** No competitor scan has ever been saved for this business — the honest "go save one first" state. */
  | { status: "no_scan" }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * Computes where this business ranks among the real nearby peers from its
 * last SAVED competitor scan — never a fresh live scan (see
 * getLatestCompetitorSnapshot's own doc comment for why), and never
 * against anything but that scan's own already-same-category, already-
 * nearby matches (lib/competitors.ts's real matching logic, not
 * re-implemented or loosened here). Resolves the business-type noun with
 * resolveBizProfile so a manually-corrected type is reflected here too,
 * same as coupons/referrals/pricing.
 */
export async function getLocalBenchmark(businessId: string): Promise<GetLocalBenchmarkResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("category, primary_type, business_type_override")
    .eq("id", businessId)
    .single();

  if (businessError || !business) {
    return { status: "not_found" };
  }

  const competitorNoun = resolveBizProfile(
    business.category,
    business.primary_type,
    business.business_type_override
  ).competitorNoun;

  const snapshot = await getLatestCompetitorSnapshot(businessId);
  if (!snapshot) {
    return { status: "no_scan" };
  }

  const subject = snapshot.entries.find((e) => e.isSubject);
  if (!subject || subject.total === null) {
    // Every real saved scan includes the subject with a real score — this
    // shouldn't happen, but if it somehow did, say there's nothing to
    // show rather than guess a number.
    return { status: "no_peers", competitorNoun };
  }
  const subjectTotal = subject.total;

  const others = snapshot.entries.filter((e) => !e.isSubject);
  if (others.length === 0) {
    return { status: "no_peers", competitorNoun };
  }

  const sorted = [...snapshot.entries].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  const rank = sorted.findIndex((e) => e.isSubject) + 1;
  const aheadCount = others.filter((e) => (e.total ?? -1) < subjectTotal).length;

  return {
    status: "ok",
    benchmark: {
      competitorNoun,
      scanId: snapshot.scanId,
      scanAt: snapshot.createdAt,
      subjectTotal,
      subjectGrade: subject.grade,
      rank,
      peerCount: snapshot.entries.length,
      othersCount: others.length,
      aheadCount,
      percentileAhead: Math.round((aheadCount / others.length) * 100),
      smallSample: others.length < SMALL_SAMPLE_THRESHOLD,
    },
  };
}
