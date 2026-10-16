"use server";

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { businessTimeZone } from "@/lib/businessTimeZone";
import {
  competitorFallbackTypes,
  competitorScanBlocker,
  findAndScoreCompetitors,
  MAX_COMPETITORS,
  type CompetitorSourceBusiness,
} from "@/lib/competitors";
import { bizProfileById, resolveBizProfile } from "@/config/bizProfiles";
import { normalizeLocale } from "@/lib/i18n";
import { refreshAvailability, type RefreshAvailability } from "@/lib/competitorScanPolicy";
import {
  groupSavedScans,
  rankPoint,
  type CompetitorRankPoint,
  type SavedCompetitorScan,
  type SavedScanRow,
  SAVED_SCAN_COLUMNS,
} from "@/lib/savedCompetitorScans";

export type { CompetitorRankPoint, SavedCompetitorEntry, SavedCompetitorScan } from "@/lib/savedCompetitorScans";

// Part B (cost-first competitor scan): the Competitors page shows the
// latest SAVED scan and never calls Google to render. A paid scan
// (1–3 Nearby Search calls, ~$0.035 each) runs only:
//   - once automatically, the first time a business has none
//     (ensureFirstCompetitorScan),
//   - on "Refresh competitors", at most once per 30 days
//     (refreshCompetitors),
//   - from the monthly report when the last scan is 30+ days old,
//   - from scripts/rescan-all.ts only with --with-competitors /
//     --competitors-only.
// Every scan is saved (competitor_scans), so there's no separate "Save".

interface CompetitorBusinessRow {
  place_id: string;
  name: string | null;
  address: string | null;
  language: string | null;
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
  verified_website_url: string | null;
  website_trust_overrides_json: unknown;
  primary_type: string | null;
  business_type_override: string | null;
  price_level: string | null;
  lat: number | null;
  lng: number | null;
}

const BUSINESS_COLUMNS =
  "place_id, name, address, phone, website, rating, review_count, category, categories, opening_hours, photo_count, business_status, https_status, website_analysis_json, verified_website_url, website_trust_overrides_json, primary_type, business_type_override, price_level, lat, lng, language";

const SCAN_COLUMNS = SAVED_SCAN_COLUMNS;

export type GetCompetitorsResult =
  | {
      status: "ok";
      businessName: string | null;
      businessAddress: string | null;
      /** The business's own real language column — display-only, passed
       * straight through to DashboardShell (which normalizes it). */
      language: string | null;
      /** The resolved business-type profile's noun, e.g. "salons" — see config/bizProfiles.ts. */
      competitorNoun: string;
      /** The latest saved scan, or null when none has ever run. */
      latest: SavedCompetitorScan | null;
      /** Owner's rank per saved scan, oldest first (one point per scan). */
      rankHistory: CompetitorRankPoint[];
      refresh: RefreshAvailability;
      /** Why a scan can't search at all (from saved data, no cost), or
       * null. "category_too_generic": Google lists only a general type
       * like "store", so there's nothing specific to match on. */
      scanBlocker: "no_location" | "category_too_generic" | null;
      /** The owner's business-type place types the scan searched because
       * Google's own types are all generic — empty when Google's own
       * category was used (see competitorFallbackTypes). */
      comparedViaTypes: string[];
      /** The business's own time zone (lib/businessTimeZone.ts). */
      timeZone: string;
    }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * The Competitors page's data: the latest SAVED scan for a business
 * (RLS-scoped), its rank history, and whether a refresh is allowed.
 * Reads the database only — viewing the page never calls Google.
 */
export async function getCompetitors(businessId: string): Promise<GetCompetitorsResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  return getCompetitorsWithClient(supabase, businessId);
}

/** The real logic behind getCompetitors() — DB reads only. */
export async function getCompetitorsWithClient(
  supabase: SupabaseClient,
  businessId: string,
  now: Date = new Date()
): Promise<GetCompetitorsResult> {
  const { data: business, error } = await supabase
    .from("businesses")
    .select("name, address, language, category, categories, primary_type, business_type_override, lat, lng")
    .eq("id", businessId)
    .single();

  if (error || !business) {
    return { status: "not_found" };
  }

  const row = business as Pick<
    CompetitorBusinessRow,
    "name" | "address" | "language" | "category" | "categories" | "primary_type" | "business_type_override" | "lat" | "lng"
  >;
  const locale = normalizeLocale(row.language);
  const competitorNoun = resolveBizProfile(
    row.category,
    row.primary_type,
    row.business_type_override,
    locale,
    row.categories,
    row.name
  ).competitorNoun;

  const { data: scanRows, error: scanError } = await supabase
    .from("competitor_scans")
    .select(SCAN_COLUMNS)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(600);

  if (scanError) {
    return { status: "error", message: scanError.message };
  }

  const scans = groupSavedScans((scanRows ?? []) as SavedScanRow[]);
  const latest = scans[0] ?? null;

  return {
    status: "ok",
    businessName: row.name,
    businessAddress: row.address,
    language: row.language,
    timeZone: businessTimeZone(row.lat, row.lng),
    competitorNoun,
    latest,
    rankHistory: scans.map(rankPoint).reverse(),
    refresh: refreshAvailability(latest?.createdAt ?? null, now),
    scanBlocker: competitorScanBlocker({
      lat: row.lat,
      lng: row.lng,
      primaryType: row.primary_type,
      categories: row.categories,
      fallbackPlaceTypes: ownerTypePlaceTypes(row.business_type_override),
    }),
    comparedViaTypes: competitorFallbackTypes({
      primaryType: row.primary_type,
      categories: row.categories,
      fallbackPlaceTypes: ownerTypePlaceTypes(row.business_type_override),
    }),
  };
}

/** Google place types for the owner's PostScore business type (only used
 * when Google's own listing types are all generic). */
function ownerTypePlaceTypes(businessTypeOverride: string | null): string[] {
  return bizProfileById(businessTypeOverride)?.placesType ?? [];
}

export type SaveCompetitorScanResult =
  | { status: "saved"; scanId: string }
  | { status: "too_soon"; nextAvailableAt: string }
  | { status: "no_data" }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

async function latestCompetitorScanAt(supabase: SupabaseClient, businessId: string): Promise<string | null> {
  const { data } = await supabase
    .from("competitor_scans")
    .select("created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1);
  return data && data.length > 0 ? (data[0] as { created_at: string }).created_at : null;
}

/**
 * Runs ONE paid competitor scan (1–3 Nearby Search calls) and saves one
 * competitor_scans row per ranked entry (the business plus every scored
 * competitor), tagged with a shared scan_id — never overwritten, so
 * history accumulates like `scores`. With `enforceCooldown`, refuses
 * (too_soon) when the last saved scan is under 30 days old.
 */
export async function runAndSaveCompetitorScanWithClient(
  supabase: SupabaseClient,
  businessId: string,
  options: { enforceCooldown: boolean; now?: Date; scan?: typeof findAndScoreCompetitors } = { enforceCooldown: false }
): Promise<SaveCompetitorScanResult> {
  const now = options.now ?? new Date();
  if (options.enforceCooldown) {
    const availability = refreshAvailability(await latestCompetitorScanAt(supabase, businessId), now);
    if (!availability.allowed && availability.nextAvailableAt) {
      return { status: "too_soon", nextAvailableAt: availability.nextAvailableAt };
    }
  }

  const { data: business, error } = await supabase.from("businesses").select(BUSINESS_COLUMNS).eq("id", businessId).single();
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
    priceLevel: row.price_level,
    fallbackPlaceTypes: ownerTypePlaceTypes(row.business_type_override),
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
  };

  let result;
  try {
    result = await (options.scan ?? findAndScoreCompetitors)(subject, normalizeLocale(row.language));
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not scan competitors." };
  }
  if (result.status !== "ok" || result.ranked.length === 0) {
    return { status: "no_data" };
  }

  const scanId = randomUUID();
  const rows = result.ranked.map((r) => ({
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
    photo_count: r.photoCount,
  }));

  const { error: insertError } = await supabase.from("competitor_scans").insert(rows);
  if (insertError) {
    return { status: "error", message: insertError.message };
  }
  return { status: "saved", scanId };
}

/** "Refresh competitors" — one paid scan, at most once per 30 days. */
export async function refreshCompetitors(businessId: string): Promise<SaveCompetitorScanResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "unauthenticated" };
  }
  return runAndSaveCompetitorScanWithClient(supabase, businessId, { enforceCooldown: true });
}

/**
 * The automatic first competitor scan: runs only when the business has
 * NEVER had a saved scan, so it can run at most once per business.
 * Called after an owner adds a business and after a manual re-scan —
 * never from the bulk re-scan script or the monthly report. Never
 * throws: a failed competitor scan must never fail the business save.
 */
export async function ensureFirstCompetitorScanWithClient(
  supabase: SupabaseClient,
  businessId: string,
  run: typeof runAndSaveCompetitorScanWithClient = runAndSaveCompetitorScanWithClient
): Promise<SaveCompetitorScanResult | { status: "skipped" }> {
  try {
    if ((await latestCompetitorScanAt(supabase, businessId)) !== null) return { status: "skipped" };
    return await run(supabase, businessId, { enforceCooldown: false });
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not scan competitors." };
  }
}

export interface CompetitorSnapshotEntry {
  name: string | null;
  isSubject: boolean;
  total: number | null;
  grade: string | null;
  priceLevel: string | null;
  photoCount: number | null;
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
    .select("scan_id, created_at, is_subject, name, total, grade, price_level, photo_count")
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
    photo_count: number | null;
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
      photoCount: r.photo_count,
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
    .select("name, category, categories, primary_type, business_type_override, language")
    .eq("id", businessId)
    .single();

  if (businessError || !business) {
    return { status: "not_found" };
  }

  const competitorNoun = resolveBizProfile(
    business.category,
    business.primary_type,
    business.business_type_override,
    normalizeLocale(business.language),
    business.categories,
    business.name
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
