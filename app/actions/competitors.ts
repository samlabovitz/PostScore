"use server";

import { requestCache } from "@/lib/requestCache";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { businessTimeZone } from "@/lib/businessTimeZone";
import {
  competitorFallbackTypes,
  competitorScanBlocker,
  findAndScoreCompetitors,
  isGenericType,
  type CompetitorSourceBusiness,
} from "@/lib/competitors";
import {
  alsoNearby,
  COMPETITOR_SELECTION_UPDATED_AT,
  distanceNote,
  SELECTION_NOTE_KEY,
  selectionChangedBetween,
  selectionNoteApplies,
  SMALL_SAMPLE_BELOW,
  type AlsoNearbyListing,
} from "@/lib/competitorQuality";
import { bizProfileById, resolveBizProfile } from "@/config/bizProfiles";
import { normalizeLocale, t } from "@/lib/i18n";
import { getPlan } from "@/lib/premium";
import { refreshAvailability, rescanRefreshesCompetitors, type RefreshAvailability } from "@/lib/competitorScanPolicy";
import type { Plan } from "@/lib/plan";
import {
  groupSavedScans,
  rankPoint,
  type CompetitorRankPoint,
  type SavedCompetitorScan,
  type SavedScanRow,
  SAVED_SCAN_COLUMNS,
} from "@/lib/savedCompetitorScans";
import { nearbyReviewAverage, ownerStanding, reviewGoal, type ReviewGoal } from "@/lib/competitorComparison";
import { latestScoringProgress, unfinishedNewScanIds, withoutUnfinished, type ScoringProgress } from "@/lib/competitorScoringStatus";
import { loadBusinessNiche, loadCompetitorScope, type BusinessNicheState } from "@/lib/businessNiche.server";
import { canRunScan, nextMonthStartUtc, placesSearchMonthlyCap } from "@/lib/placesSearchBudget";
import { scopeGroupLabel, nicheSearchTypes } from "@/lib/competitorScope";


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
      /** The latest FULLY SCORED saved scan, or null when none is finished yet. */
      latest: SavedCompetitorScan | null;
      /** A scan still being fully scored ("Checking 7 of 11…"), or null. */
      scoring: ScoringProgress | null;
      /** Owner's rank per saved scan, oldest first (one point per scan). */
      rankHistory: CompetitorRankPoint[];
      /** Show the one-time "We updated how we pick your competitors" note. */
      selectionUpdated?: boolean;
      /** "Also nearby, with few or no reviews yet" — never ranked or scored. */
      alsoNearby?: AlsoNearbyListing[];
      /** "The nearest established … are {min}–{max} miles away" (mostly over 5 mi). */
      distanceNote?: { min: number; max: number } | null;
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
      /** Niche + ranking scope (lib/businessNiche.ts); null if unreadable. */
      niche?: BusinessNicheState | null;
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
  const plan = await getPlan();
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  return getCompetitorsWithClient(supabase, businessId, new Date(), plan);
}

/** The real logic behind getCompetitors() — DB reads only. */
export async function getCompetitorsWithClient(
  supabase: SupabaseClient,
  businessId: string,
  now: Date = new Date(),
  plan: Plan | null = null
): Promise<GetCompetitorsResult> {
  // Every read needs only the id — run them together (each RLS-scoped).
  const [{ data: business, error }, { data: scanRows, error: scanError }, unfinished, scoring, niche] = await Promise.all([
    supabase
      .from("businesses")
      .select("name, address, language, category, categories, primary_type, business_type_override, lat, lng")
      .eq("id", businessId)
      .single(),
    supabase.from("competitor_scans").select(SCAN_COLUMNS).eq("business_id", businessId).order("created_at", { ascending: false }).limit(600),
    unfinishedNewScanIds(supabase, businessId),
    latestScoringProgress(supabase, businessId),
    loadBusinessNiche(supabase, businessId),
  ]);

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

  if (scanError) {
    return { status: "error", message: scanError.message };
  }

  // A new scan still being fully scored stays hidden — the last finished
  // one is shown meanwhile, with honest progress. The 30-day refresh limit
  // still counts it.
  const allRows = (scanRows ?? []) as SavedScanRow[];
  const scans = groupSavedScans(withoutUnfinished(allRows, unfinished));
  const latest = scans[0] ?? null;
  const newestSavedAt = allRows[0]?.created_at ?? null;

  return {
    status: "ok",
    scoring,
    businessName: row.name,
    businessAddress: row.address,
    language: row.language,
    timeZone: businessTimeZone(row.lat, row.lng),
    competitorNoun,
    latest,
    rankHistory: scans.map((s) => rankPoint(s, niche?.scope)).reverse(),
    selectionUpdated: await competitorSelectionNote(businessId),
    alsoNearby: latest
      ? await alsoNearbyFor(supabase, latest, allRows, [row.primary_type, ...(row.categories ?? []), ...((niche && nicheSearchTypes(niche.scope)?.directTypes) ?? [])])
      : [],
    distanceNote: latest ? distanceNote(latest.entries.filter((e) => !e.isSubject)) : null,
    niche,
    // Free: "Refresh" only when the latest scan found no competitors (the
    // one exception — right away, no cooldown).
    refresh:
      plan === "free"
        ? latest && !latest.entries.some((e) => !e.isSubject)
          ? { allowed: true, nextAvailableAt: null }
          : { allowed: false, nextAvailableAt: null }
        : refreshAvailability(newestSavedAt, now),
    scanBlocker: competitorScanBlocker({
      lat: row.lat,
      lng: row.lng,
      primaryType: row.primary_type,
      categories: row.categories,
      // A niche's own Google types make a generic listing searchable.
      fallbackPlaceTypes: [...((niche && nicheSearchTypes(niche.scope)?.directTypes) ?? []), ...ownerTypePlaceTypes(row.business_type_override)],
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
  | { status: "saved"; scanId: string; placesCalls?: number }
  | { status: "too_soon"; nextAvailableAt: string }
  /** This month's Places search allowance (PLACES_SEARCH_MONTHLY_CAP) is used up. */
  | { status: "capped"; nextAvailableAt: string }
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
  options: {
    enforceCooldown: boolean;
    now?: Date;
    scan?: typeof findAndScoreCompetitors;
    /** Starts the background full scoring (tests replace it). */
    startScoring?: (scanId: string, businessId: string, competitorCount: number) => Promise<void>;
    /** This month's Places search calls so far (tests replace it). */
    budget?: () => Promise<{ used: number }>;
    /** Logs the calls a scan made (tests replace it). */
    logCalls?: (businessId: string, calls: number) => Promise<void>;
  } = { enforceCooldown: false }
): Promise<SaveCompetitorScanResult> {
  const now = options.now ?? new Date();
  if (options.enforceCooldown) {
    const availability = refreshAvailability(await latestCompetitorScanAt(supabase, businessId), now);
    if (!availability.allowed && availability.nextAvailableAt) {
      return { status: "too_soon", nextAvailableAt: availability.nextAvailableAt };
    }
  }

  // The month's Places search allowance: a scan runs only when even its
  // worst case (4 calls) fits under PLACES_SEARCH_MONTHLY_CAP.
  try {
    const { used } = await (options.budget ?? defaultBudget)();
    if (!canRunScan(used, placesSearchMonthlyCap())) return { status: "capped", nextAvailableAt: nextMonthStartUtc(now) };
  } catch {
    // An unreadable count never blocks a scan the cooldown allows.
  }

  const [{ data: business, error }, niche] = await Promise.all([
    supabase.from("businesses").select(BUSINESS_COLUMNS).eq("id", businessId).single(),
    loadBusinessNiche(supabase, businessId),
  ]);
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
    niche: niche ? nicheSearchTypes(niche.scope) : null,
  };

  let result;
  try {
    result = await (options.scan ?? findAndScoreCompetitors)(subject, normalizeLocale(row.language));
  } catch (err) {
    console.error(`[competitors] scan threw for ${businessId}:`, err instanceof Error ? err.message : err);
    return { status: "error", message: err instanceof Error ? err.message : "Could not scan competitors." };
  }
  // Every search call counts toward the month, found anything or not.
  await (options.logCalls ?? logPlacesSearchCalls)(businessId, result.placesCalls ?? 0).catch(() => undefined);
  // "Didn't run" is never shown as "found none": a failed search or a scan
  // that couldn't search (no location, only generic types) says so.
  if (result.status !== "ok") {
    if (result.status === "error") console.error(`[competitors] scan failed for ${businessId}: ${result.message}`);
    return { status: "error", message: result.message };
  }
  if (result.ranked.length === 0) {
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
    website_url: r.websiteUrl ?? null,
    phone: r.listing?.phone ?? null,
    opening_hours: r.listing ? { weekday: r.listing.openingHours, periods: r.listing.openingHoursPeriods } : null,
    categories: r.listing?.categories ?? null,
    business_status: r.listing?.businessStatus ?? null,
  }));

  // "Also nearby" rides on the owner's own row (supabase/competitor-also-nearby.sql);
  // before that file is run the scan saves without it.
  const subjectIndex = rows.findIndex((r) => r.is_subject);
  const withAlsoNearby = rows.map((r, i) => (i === subjectIndex ? { ...r, also_nearby_json: result.alsoNearby ?? [] } : r));
  let { error: insertError } = await supabase.from("competitor_scans").insert(withAlsoNearby);
  if (insertError && (insertError.code === "PGRST204" || insertError.code === "42703")) {
    ({ error: insertError } = await supabase.from("competitor_scans").insert(rows));
  }
  if (insertError) {
    return { status: "error", message: insertError.message };
  }
  // Each competitor's full PostScore is worked out in the background; the
  // page keeps showing the last finished scan until this one is done.
  try {
    await (options.startScoring ?? defaultStartScoring)(scanId, businessId, result.ranked.filter((r) => !r.isSubject).length);
  } catch (err) {
    console.error(`[competitors] could not queue full scoring for ${scanId}:`, err);
  }
  return { status: "saved", scanId, placesCalls: result.placesCalls };
}

async function defaultBudget(): Promise<{ used: number }> {
  const { placesSearchCallsThisMonth } = await import("@/lib/placesSearchBudget.server");
  return placesSearchCallsThisMonth();
}

async function logPlacesSearchCalls(businessId: string, calls: number): Promise<void> {
  const { logPlacesSearchCalls: log } = await import("@/lib/placesSearchBudget.server");
  await log(businessId, calls);
}

async function defaultStartScoring(scanId: string, businessId: string, competitorCount: number): Promise<void> {
  // Loaded only when a job actually starts (server-only modules).
  const [{ createAdminClient }, { queueScoringJob }, { startCompetitorScoring }] = await Promise.all([
    import("@/lib/supabase/admin"),
    import("@/lib/competitorScoringJob"),
    import("@/lib/competitorScoringTrigger"),
  ]);
  await queueScoringJob(createAdminClient(), scanId, businessId, "new_scan", competitorCount);
  startCompetitorScoring(scanId);
}

/** "Refresh competitors" — one paid scan, at most once per 30 days. */
/** Whether the latest saved scan found no competitors at all (only the
 * business itself); null when there's no scan. */
async function latestScanFoundNone(supabase: SupabaseClient, businessId: string): Promise<boolean | null> {
  const { data } = await supabase.from("competitor_scans").select("scan_id").eq("business_id", businessId).order("created_at", { ascending: false }).limit(1);
  const scanId = (data ?? [])[0]?.scan_id as string | undefined;
  if (!scanId) return null;
  const { count } = await supabase.from("competitor_scans").select("id", { count: "exact", head: true }).eq("scan_id", scanId).eq("is_subject", false);
  return (count ?? 0) === 0;
}

export async function refreshCompetitors(businessId: string): Promise<SaveCompetitorScanResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "unauthenticated" };
  }
  // Free keeps its saved list and rank; refreshing (Places searches) is
  // Grow — except when the latest scan came back with NO competitors (or
  // there's none yet): then Free may search again right away.
  if ((await getPlan()) === "free") {
    const latestAt = await latestCompetitorScanAt(supabase, businessId);
    if (latestAt === null || (await latestScanFoundNone(supabase, businessId)) === true) {
      return runAndSaveCompetitorScanWithClient(supabase, businessId, { enforceCooldown: false });
    }
    const { data: row } = await supabase.from("businesses").select("language").eq("id", businessId).maybeSingle();
    return { status: "error", message: t(normalizeLocale(row?.language), "dashboard.free.competitorsLocked") };
  }
  return runAndSaveCompetitorScanWithClient(supabase, businessId, { enforceCooldown: true });
}

/**
 * The competitor part of an owner re-scan, by plan
 * (lib/competitorScanPolicy.ts rescanRefreshesCompetitors): Premium and
 * Multi every re-scan, Grow once a week, Free never (no Nearby Search
 * call at all). Still bounded by the month's Places search cap inside
 * runAndSaveCompetitorScanWithClient. Never throws: a failed competitor
 * scan must never fail the re-scan.
 */
export async function refreshCompetitorsOnRescanWithClient(
  supabase: SupabaseClient,
  businessId: string,
  plan: Plan,
  now: Date = new Date(),
  run: typeof runAndSaveCompetitorScanWithClient = runAndSaveCompetitorScanWithClient
): Promise<"refreshed" | "skipped"> {
  try {
    // Free searches only when there's no scan yet or the latest found none.
    const latestAt = await latestCompetitorScanAt(supabase, businessId);
    const foundNone = plan === "free" && latestAt !== null ? (await latestScanFoundNone(supabase, businessId)) === true : false;
    if (!rescanRefreshesCompetitors(plan, latestAt, now, foundNone)) return "skipped";
    const result = await run(supabase, businessId, { enforceCooldown: false, now });
    if (result.status === "error") console.error(`[competitors] re-scan competitor search failed for ${businessId}: ${result.message}`);
    return result.status === "saved" ? "refreshed" : "skipped";
  } catch (err) {
    console.error(`[competitors] re-scan competitor search threw for ${businessId}:`, err instanceof Error ? err.message : err);
    return "skipped";
  }
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
    const result = await run(supabase, businessId, { enforceCooldown: false });
    if (result.status === "error") console.error(`[competitors] first competitor scan failed for ${businessId}: ${result.message}`);
    return result;
  } catch (err) {
    console.error(`[competitors] first competitor scan threw for ${businessId}:`, err instanceof Error ? err.message : err);
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
  /** The same scan in the Competitors page's shape — what every rank is
   * computed from (ownerStanding in lib/competitorComparison.ts). */
  scan: SavedCompetitorScan;
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
async function getLatestCompetitorSnapshotUncached(businessId: string): Promise<CompetitorSnapshot | null> {
  const supabase = createClient();

  const [{ data, error }, unfinished] = await Promise.all([
    supabase.from("competitor_scans").select(SAVED_SCAN_COLUMNS).eq("business_id", businessId).order("created_at", { ascending: false }).limit(50),
    unfinishedNewScanIds(supabase, businessId),
  ]);

  if (error || !data || data.length === 0) return null;

  const rows = withoutUnfinished(data as SavedScanRow[], unfinished);
  if (rows.length === 0) return null;

  const latestScanId = rows[0].scan_id;
  const latestRows = rows.filter((r) => r.scan_id === latestScanId);
  const scan = groupSavedScans(latestRows)[0];

  return {
    scan,
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

/** The owner's shared rank (ownerStanding) in the finished competitor
 * scan saved just before `latestScanId` — for "rank improved" on the
 * report. null when there's no earlier scan. */
export async function getPreviousCompetitorRank(businessId: string, latestScanId: string): Promise<number | null> {
  const supabase = createClient();
  const [{ data, error }, unfinished] = await Promise.all([
    supabase.from("competitor_scans").select(SAVED_SCAN_COLUMNS).eq("business_id", businessId).order("created_at", { ascending: false }).limit(150),
    unfinishedNewScanIds(supabase, businessId),
  ]);
  if (error || !data) return null;
  const rows = withoutUnfinished(data as SavedScanRow[], unfinished);
  const previousId = rows.find((r) => r.scan_id !== latestScanId)?.scan_id;
  if (!previousId) return null;
  const scan = groupSavedScans(rows.filter((r) => r.scan_id === previousId))[0];
  return scan ? (ownerStanding(scan, await loadCompetitorScope(supabase, businessId))?.rank ?? null) : null;
}

// ---------------------------------------------------------------------------
// Local benchmark (Day 12c) — "where do I rank against my real local peers,"
// computed entirely from the last SAVED competitor scan (getLatestCompetitor
// Snapshot above), never a fresh live Google Places call. It moves only when
// the owner re-saves a scan on the Competitors page — same cadence as the
// scan data it's built from.
// ---------------------------------------------------------------------------

/**
 * Fewer than SMALL_SAMPLE_BELOW (5) competitors is still a legitimate
 * comparison, just a limited one — the UI says "small sample" rather than
 * present a 1-of-1 or 2-of-3 comparison with the same confidence as a
 * full one (lib/competitorQuality.ts).
 */
const SMALL_SAMPLE_THRESHOLD = SMALL_SAMPLE_BELOW;

export interface LocalBenchmark {
  /** The resolved business-type profile's noun, e.g. "salons". */
  competitorNoun: string;
  scanId: string;
  /** ISO timestamp of the scan this benchmark was computed from — callers format for display. */
  scanAt: string;
  /** The owner's comparable score — the number the rank is based on. */
  subjectTotal: number;
  subjectGrade: string | null;
  /** 1-based rank among the full peer set (this business included) — the
   * shared ownerStanding (comparable score), same as the Competitors page. */
  rank: number;
  /** Peer set size INCLUDING this business — the "Y" in "#X of Y", same convention the assistant's competitor context and the live Competitors page already use. */
  peerCount: number;
  /** Real nearby peers actually compared against — EXCLUDES this business itself, since a business isn't "nearby" itself. This is the N in "based on N nearby [type]". */
  othersCount: number;
  /** How many of those other peers this business outscores on the comparable score (a tie doesn't count as "ahead of"). */
  aheadCount: number;
  /** Rounded 0-100 percent of `othersCount` this business is ahead of. */
  percentileAhead: number;
  /** True when othersCount is below SMALL_SAMPLE_THRESHOLD — the UI must disclose this rather than present a small comparison as a definitive ranking. */
  smallSample: boolean;
  /** Mean Google review count of the competitors in this scan that have
   * one (rounded), or null when fewer than 3 do — a real average only. */
  competitorReviewAverage: number | null;
  /** The review goal (beat the leader / stretch / you lead) — the shared
   * reviewGoal(), same scope as the rank; null below 3 competitors. */
  reviewGoal: ReviewGoal | null;
  /** The comparison group in words (lib/competitorScope.ts scopeGroupLabel). */
  reviewGroup: string;
  /** Show the one-time "We updated how we pick your competitors" note. */
  selectionUpdated?: boolean;
  /** "The nearest established … are {min}–{max} miles away" (mostly over 5 mi). */
  distanceNote?: { min: number; max: number } | null;
}

/**
 * "Also nearby, with few or no reviews yet" for the scan shown: the list the
 * scan saved (supabase/competitor-also-nearby.sql), or — for scans saved
 * before that — worked out from this business's earlier saved scans. Saved
 * data only; never a Google or PageSpeed call.
 */
async function alsoNearbyFor(
  supabase: SupabaseClient,
  latest: SavedCompetitorScan,
  allRows: SavedScanRow[],
  ownTypes: Array<string | null | undefined>
): Promise<AlsoNearbyListing[]> {
  const { data, error } = await supabase.from("competitor_scans").select("also_nearby_json").eq("scan_id", latest.scanId).eq("is_subject", true).maybeSingle();
  const saved = !error && data ? (data as { also_nearby_json?: unknown }).also_nearby_json : null;
  if (Array.isArray(saved)) return saved as AlsoNearbyListing[];
  const ranked = latest.entries.filter((e) => !e.isSubject);
  return alsoNearby(
    allRows
      .filter((r) => !r.is_subject)
      .map((r) => ({ placeId: r.place_id, name: r.name, type: r.categories?.[0] ?? null, types: r.categories ?? null, distanceMeters: r.distance_meters === null ? null : Number(r.distance_meters), reviewCount: r.review_count, website: r.website_url ?? null })),
    {
      ownTypes: ownTypes.filter((t): t is string => !!t && !isGenericType(t)),
      rankedPlaceIds: ranked.map((e) => e.placeId),
      nearestRankedMeters: ranked.length > 0 ? Math.min(...ranked.map((e) => e.distanceMeters ?? Infinity)) : null,
    }
  );
}

/**
 * Whether to show the one-time "We updated how we pick your competitors"
 * note: the list shown now (the newest finished scan) was picked by the
 * established-competitor rules, the one before them by the old rules, the
 * two lists differ, and the owner hasn't dismissed the note.
 */
async function competitorSelectionNoteUncached(businessId: string): Promise<boolean> {
  try {
    const supabase = createClient();
    const [{ data: subjects }, unfinished] = await Promise.all([
      supabase.from("competitor_scans").select("scan_id, created_at").eq("business_id", businessId).eq("is_subject", true).order("created_at", { ascending: false }).limit(50),
      unfinishedNewScanIds(supabase, businessId),
    ]);
    const finished = withoutUnfinished((subjects ?? []) as Array<{ scan_id: string; created_at: string }>, unfinished);
    const current = finished[0];
    const previous = current ? finished.find((r) => r.created_at < COMPETITOR_SELECTION_UPDATED_AT) : undefined;
    if (!current || !previous || !selectionChangedBetween(previous.created_at, current.created_at)) return false;
    const [{ data: rows }, { data: dismissed }] = await Promise.all([
      supabase.from("competitor_scans").select("scan_id, place_id").in("scan_id", [current.scan_id, previous.scan_id]).eq("is_subject", false),
      supabase.from("promo_dismissals").select("promo_key").eq("business_id", businessId).eq("promo_key", SELECTION_NOTE_KEY).maybeSingle(),
    ]);
    if (dismissed) return false;
    const ids = (scanId: string) => ((rows ?? []) as Array<{ scan_id: string; place_id: string }>).filter((r) => r.scan_id === scanId).map((r) => r.place_id);
    return selectionNoteApplies({ currentScanAt: current.created_at, previousScanAt: previous.created_at, currentPlaceIds: ids(current.scan_id), previousPlaceIds: ids(previous.scan_id) });
  } catch {
    return false;
  }
}

/** Request-scoped (lib/requestCache.ts): the Competitors page and the rank card share one check. */
const competitorSelectionNoteCached = requestCache(competitorSelectionNoteUncached);
export async function competitorSelectionNote(businessId: string): Promise<boolean> {
  return competitorSelectionNoteCached(businessId);
}

/** "Got it" on that note — for this user and business, for good. Before
 * supabase/promo-dismissals.sql is run the browser remembers it instead. */
export async function dismissCompetitorSelectionNote(businessId: string): Promise<{ status: "ok" | "not_enabled" | "unauthenticated" | "error" }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  const { error } = await supabase
    .from("promo_dismissals")
    .upsert({ user_id: user.id, business_id: businessId, promo_key: SELECTION_NOTE_KEY, hidden_until: "2100-01-01T00:00:00Z" }, { onConflict: "user_id,business_id,promo_key" });
  if (error) return /promo_dismissals|42P01|PGRST205/.test(`${error.code} ${error.message}`) ? { status: "not_enabled" } : { status: "error" };
  return { status: "ok" };
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
 * same as coupons/referrals/pricing. The nearby review average is the
 * shared nearbyReviewAverage (same scope as the rank).
 */
async function getLocalBenchmarkUncached(businessId: string): Promise<GetLocalBenchmarkResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("name, category, categories, primary_type, business_type_override, language, review_count")
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

  // The one shared rank (comparable score) — identical to the
  // Competitors page, the monthly report and PostAI.
  const scope = await loadCompetitorScope(supabase, businessId);
  const standing = ownerStanding(snapshot.scan, scope);
  const subject = snapshot.entries.find((e) => e.isSubject);
  if (!standing || !subject) {
    // Every real saved scan includes the subject with a real score — this
    // shouldn't happen, but if it somehow did, say there's nothing to
    // show rather than guess a number.
    return { status: "no_peers", competitorNoun };
  }
  if (standing.othersCount === 0) {
    return { status: "no_peers", competitorNoun };
  }

  return {
    status: "ok",
    benchmark: {
      competitorNoun,
      scanId: snapshot.scanId,
      scanAt: snapshot.createdAt,
      subjectTotal: standing.ownerScore,
      subjectGrade: subject.grade,
      rank: standing.rank,
      peerCount: standing.of,
      othersCount: standing.othersCount,
      aheadCount: standing.aheadCount,
      percentileAhead: Math.round((standing.aheadCount / standing.othersCount) * 100),
      smallSample: standing.othersCount < SMALL_SAMPLE_THRESHOLD,
      competitorReviewAverage: nearbyReviewAverage(snapshot.scan, scope),
      // The business's current count (its row); the scan's own as a fallback.
      reviewGoal: reviewGoal(snapshot.scan, scope, (business as { review_count?: number | null }).review_count ?? snapshot.scan.entries.find((e) => e.isSubject)?.reviewCount ?? null),
      reviewGroup: scopeGroupLabel(snapshot.scan, scope, normalizeLocale(business.language), competitorNoun),
      selectionUpdated: await competitorSelectionNote(businessId),
      distanceNote: distanceNote(snapshot.scan.entries.filter((e) => !e.isSubject)),
    },
  };
}

/** Request-scoped (lib/requestCache.ts): one query per page render. */
const getLocalBenchmarkCached = requestCache(getLocalBenchmarkUncached);
export async function getLocalBenchmark(...args: Parameters<typeof getLocalBenchmarkUncached>): Promise<Awaited<ReturnType<typeof getLocalBenchmarkUncached>>> {
  return getLocalBenchmarkCached(...args);
}

/** Request-scoped (lib/requestCache.ts): one query per page render. */
const getLatestCompetitorSnapshotCached = requestCache(getLatestCompetitorSnapshotUncached);
export async function getLatestCompetitorSnapshot(...args: Parameters<typeof getLatestCompetitorSnapshotUncached>): Promise<Awaited<ReturnType<typeof getLatestCompetitorSnapshotUncached>>> {
  return getLatestCompetitorSnapshotCached(...args);
}
