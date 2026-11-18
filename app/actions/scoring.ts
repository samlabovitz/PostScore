"use server";

import { gradedSiteUrl } from "@/lib/gradedSite";
import { withOwnerDetails } from "@/lib/ownerDetails";
import { loadOwnerDetails } from "@/lib/ownerDetails.server";
import { requestCache } from "@/lib/requestCache";
import { withTimeZone } from "@/lib/businessTimeZone";
import { rescanGate } from "@/lib/rescanPolicy";
import { getPlan } from "@/lib/premium";
import { diffBreakdowns } from "@/lib/scoreChanges";
import { refreshCompetitorsOnRescanWithClient } from "@/app/actions/competitors";
import type { Plan } from "@/lib/plan";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isBusinessArchived } from "@/lib/businessArchive.server";
import {
  businessRowToScoringInput,
  getScoreWithSuggestions,
  type BusinessScoringRow,
  type ScanKind,
  type ScoreBreakdown,
  type ScoreWithSuggestions,
  V112_SCORING_COLUMNS,
} from "@/lib/scoring";
import { isFullScan } from "@/lib/websiteRecheckPolicy";
import { reconcileTasks, type TaskRow } from "@/lib/actionPlan";
import { buildProfileSnapshot, type ProfileSnapshot } from "@/lib/profileChanges";
import { lookupBusinessByPlaceId, type OpeningHoursPeriod } from "@/lib/google/places";
import type { PlacesDetailsKind } from "@/lib/placesDetailsBudget";
import { changesAcross, type GbpPhotoTimes, type GbpReviewTimes, type ScanChangeRecord, type ScanChangeSummary } from "@/lib/scanChanges";
import { breakdownWithoutQuotes } from "@/lib/breakdownStorage";
import { savedVersionStandsIn, withSavedScore } from "@/lib/savedScore";
import { latestSavedScore } from "@/lib/savedScore.server";
import type { LiveListing } from "@/lib/ownerListing";
import { emptyListingColumns, listingScoringRow, type ListingScoringColumns } from "@/lib/listingScoringRow";
import { FP_KEY_COLUMN, loadScanChangeRecords } from "@/lib/scanChanges.server";
import { saveBusinessWithClient } from "@/app/actions/businesses";
import { DEFAULT_LOCALE, normalizeLocale, t, type Locale } from "@/lib/i18n";
import { findLastKnownWebsiteDate, resolveListingWebsite } from "@/lib/googleListingWebsite";

export interface BusinessRecord extends BusinessScoringRow {
  id: string;
  listing_mode?: string | null;
  /** Day 23 2d-2: Google couldn't be read for this page — its values are empty (lib/ownerListing.ts). */
  live_unavailable?: boolean;
  /** Where this page's Google values came from. */
  live_source?: "business_profile" | "places";
  /** The site the owner confirmed with "Wrong site?" (lib/ownerWebsite.server.ts). */
  owner_website_url?: string | null;
  /** Google's place id (null for a website-only business). */
  place_id?: string | null;
  name: string | null;
  address: string | null;
  google_maps_uri: string | null;
  /** The business's own real language column — display-only, never used
   * by scoring. Passed straight through to DashboardShell (which
   * normalizes it), same as the rest of this display-only trio. */
  language: string | null;
  /** Google's structured regularOpeningHours.periods (see
   * lib/google/places.ts) — display-only, never used by scoring. Lets
   * ListingCard (BusinessScoreView.tsx) render hours in the business's
   * own language via lib/hours.ts's formatOpeningHours(), falling back
   * to the English opening_hours lines above when this is null. */
  opening_hours_periods: OpeningHoursPeriod[] | null;
  /** Non-null only while this scan is the first to SUSPECT Google's
   * listing lost its website (one real lookup + one real retry, both
   * empty, despite a website already on file) — see
   * resolveListingWebsite (lib/googleListingWebsite.ts) and
   * supabase/schema.sql's own doc. Display-only, never used by
   * scoring — the stored `website` column itself is always what
   * scoring reads. */
  google_listing_missing_website_since: string | null;
  /** Non-null once a SUSPECTED gap (above) has been CONFIRMED on a
   * later, separate scan — see resolveListingWebsite's own doc and
   * supabase/schema.sql's for the real Endless Nails case this exists
   * for. The one real "is this confirmed" signal — never read for
   * display (see google_listing_last_known_website_at below for the
   * real date). Display-only, never used by scoring. */
  google_listing_website_removed_since: string | null;
  /** The REAL date Google last actually returned a website, for the
   * honest "it last showed one on {date}" line — see
   * findLastKnownWebsiteDate (lib/googleListingWebsite.ts) and
   * supabase/schema.sql's own doc. Null means either not currently
   * confirmed missing, or confirmed with no determinable prior date —
   * the two are told apart by google_listing_website_removed_since
   * above, never guessed from this field alone. Display-only, never
   * used by scoring. */
  google_listing_last_known_website_at: string | null;
}

export type ScoreBusinessResult =
  | {
      status: "ok";
      /** What the page shows: Google's values as read now (Day 23 2d-2, scoreForDisplayWithClient). */
      business: BusinessRecord;
      result: ScoreWithSuggestions;
      /** The row the score and the plan's estimates were worked out from (defaults to `business`). */
      scoringBusiness?: BusinessRecord;
      /** Day 23 2d-4: where the Google values came from — the scan's own read
       * ("scan"), the visit's live read ("ok"), Google couldn't be read
       * ("unavailable": every Google value empty), or no listing ("none"). */
      live?: "scan" | "ok" | "unavailable" | "none";
      /** The visit's live read itself, when there was one. */
      liveListing?: LiveListing;
    }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * Loads a saved business (RLS-scoped to the current user) and scores it
 * live. This never writes to the database — it's just lib/scoring.ts run
 * on whatever the businesses table currently holds, so viewing a
 * business's page is free to do as often as you like.
 */
async function scoreBusinessByIdUncached(
  businessId: string,
  /** "business": the business's own language (read from the same row) —
   * lets a page score without first waiting for the summary. */
  locale: Locale | "business" = DEFAULT_LOCALE
): Promise<ScoreBusinessResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  return scoreForDisplayWithClient(supabase, businessId, locale);
}

/**
 * Day 23 2d-1: the score a page (or a report) shows — the latest SAVED
 * scan's total, grade and points (lib/savedScore.ts), with today's
 * words. When the saved scan no longer matches (an owner answer or a
 * scoring update changed the score since), a new scan is saved first,
 * exactly as the Overview did before — so it's still one score
 * everywhere.
 */
export async function scoreForDisplayWithClient(
  supabase: SupabaseClient,
  businessId: string,
  locale: Locale | "business" = DEFAULT_LOCALE,
  /** false: never writes (scripts/preview-report.ts) — shows what the
   * new scan would hold instead of saving it. */
  options: { save?: boolean } = {}
): Promise<ScoreBusinessResult> {
  const [scored, saved] = await Promise.all([scoreBusinessWithClient(supabase, businessId, locale), latestSavedScore(supabase, businessId)]);
  if (scored.status !== "ok") return scored;
  // Day 23 2d-3: the owner's confirmed name and address (lib/ownerDetails.ts);
  // before that, the listing's as this visit read it.
  const business = withOwnerDetails(scored.business, (await loadOwnerDetails(supabase, businessId))?.details ?? null, scored.liveListing ?? null);
  const now = scored.result.breakdown;
  // Day 23 2d-4: the saved scan's points with the words built from Google
  // now; a Google-side check that reads differently now is marked
  // (lib/savedScore.ts) — a page never saves a scan for a Google change.
  const shown = withSavedScore(now, saved, { liveUnavailable: scored.live === "unavailable" });
  const scoringBusiness = scored.business;
  if (shown) return { ...scored, business, scoringBusiness, result: { ...scored.result, breakdown: shown } };
  // No saved scan can stand in (a scoring update changed this business's
  // checks): today's breakdown, never saved from a page — only a real scan
  // or the re-score script saves a score (Scoring 1.16.0).
  void options;
  return { ...scored, business, scoringBusiness };
}

/** The owner's listing as Google shows it now (lib/ownerListing.server.ts). */
async function liveListingFor(supabase: SupabaseClient, businessId: string, row: { place_id?: string | null; listing_mode?: string | null }): Promise<LiveListing> {
  const { liveListingForRow } = await import("@/lib/ownerListing.server");
  return liveListingForRow(supabase, businessId, row);
}

/**
 * The real logic behind scoreBusinessById(), parameterized by an
 * already-resolved Supabase client instead of creating its own RLS-
 * scoped one and checking the session — reused by the monthly-report
 * cron route (via the service-role admin client, which has no session
 * to check and no RLS to rely on) so cron and the interactive Website
 * page score a business through the exact same code, never a second
 * scoring path that could drift on a future honesty fix. With the
 * RLS-scoped client, `not_found` still means "doesn't exist OR isn't
 * this session's own business" exactly as before; with the admin
 * client, it purely means "doesn't exist" — the cron caller is
 * responsible for only ever passing a businessId it already looked up
 * itself.
 */
export async function scoreBusinessWithClient(
  supabase: SupabaseClient,
  businessId: string,
  locale: Locale | "business" = DEFAULT_LOCALE,
  /** Day 23 2d-4: the listing this scan just read (lib/listingScoringRow.ts),
   * in memory. Omitted: the visit's live read (pages, syncs, re-scores).
   * The saved Google columns are never scored. */
  options: { listing?: ListingScoringColumns } = {}
): Promise<ScoreBusinessResult> {
  const { data: business, error } = await supabase
    .from("businesses")
    .select(
      `id, place_id, listing_mode, name, address, phone, website, rating, review_count, category, categories, primary_type, business_type_override, biz_type_resolved, opening_hours, opening_hours_periods, photo_count, business_status, https_status, website_analysis_json, google_maps_uri, language, google_listing_missing_website_since, google_listing_website_removed_since, google_listing_last_known_website_at, verified_website_url, website_trust_overrides_json, lat, lng, ${V112_SCORING_COLUMNS}`
    )
    .eq("id", businessId)
    .single();

  if (error || !business) {
    return { status: "not_found" };
  }

  // Google's values: this scan's read, else the visit's live read
  // (Business Profile when connected, else one Places read per visit —
  // lib/ownerListing.server.ts); empty when Google can't be read.
  let row: Record<string, unknown> = business;
  let live: "scan" | "ok" | "unavailable" | "none";
  let liveListing: LiveListing | undefined;
  if (options.listing) {
    row = { ...business, ...options.listing };
    live = "scan";
  } else {
    liveListing = await liveListingFor(supabase, businessId, business);
    live = liveListing.status;
    row = liveListing.status === "ok" ? { ...business, ...liveListing.columns } : liveListing.status === "unavailable" ? { ...business, ...emptyListingColumns() } : business;
  }

  // The business's own time zone (Day 5 prep) — for DashboardShell and
  // any date inside a check explanation.
  // The owner's confirmed site (read on its own — null before supabase/owner-website.sql).
  const { withOwnerWebsite } = await import("@/lib/ownerWebsite.server");
  const zoned = await withOwnerWebsite(supabase, businessId, withTimeZone(row));
  const input = businessRowToScoringInput(zoned as unknown as BusinessScoringRow);
  const result = getScoreWithSuggestions(input, locale === "business" ? normalizeLocale(business.language) : locale);

  // Can't be read: the header keeps the name and address (until 2d-5), and the page says so.
  const shownRow = live === "unavailable" ? { ...zoned, name: business.name, address: business.address, live_unavailable: true } : live === "ok" ? { ...zoned, live_source: liveListing?.status === "ok" ? liveListing.source : undefined } : zoned;
  return { status: "ok", business: shownRow as BusinessRecord, result, live, ...(liveListing ? { liveListing } : {}) };
}

export type SaveScoreSnapshotResult =
  | { status: "saved"; scoreId: string; tasksConfirmed: number; tasksReopened: number; pointsConfirmed: number; listingChanges?: ScanChangeRecord[] }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * Records the current score as a new row in `scores` — one row per scan,
 * so history accumulates. Uses the exact same breakdown scoreBusinessById
 * would show you; this just also persists it, along with a real-listing
 * profile snapshot (see buildProfileSnapshot in lib/profileChanges.ts)
 * used to build the honest "what changed since your last scan" feed.
 *
 * This is also the app's one real "re-scan" moment, so it's where any
 * action-plan tasks marked "I did this" get checked against reality
 * (see reconcileTasks in lib/actionPlan.ts) — a task only ever becomes
 * completed here, by the real breakdown showing its check at full
 * points, never by the owner's checkbox alone. Note this re-scores
 * whatever is currently saved in `businesses` — it does not itself
 * re-fetch from Google, so a real Google-side fix (new hours, a linked
 * website, etc.) only shows up here once that business's saved row has
 * itself been refreshed. rescanBusiness() below is the caller that does
 * that live re-fetch first, then calls this to score and persist it.
 */
export async function saveScoreSnapshot(businessId: string): Promise<SaveScoreSnapshotResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  return saveScoreSnapshotWithClient(supabase, businessId);
}

/**
 * The real logic behind saveScoreSnapshot() — see scoreBusinessWithClient's
 * doc comment for why this accepts an injected client rather than
 * creating its own. Reused as-is by rescanBusinessWithClient below and
 * by the monthly-report cron route.
 */
export async function saveScoreSnapshotWithClient(
  supabase: SupabaseClient,
  businessId: string,
  /** "website_recheck" marks a website-only re-check (app/actions/websiteRecheck.ts). */
  scanKind?: ScanKind,
  /** A connected owner's review dates, read by this scan (rescanBusinessWithClient).
   * `listing`: Google's values this scan just read, in memory (Day 23 2d-4) —
   * omitted, the visit's live read (syncs, re-scores, website re-checks). */
  options: { gbpReviews?: GbpReviewTimes | null; gbpPhotos?: GbpPhotoTimes | null; listing?: ListingScoringColumns } = {}
): Promise<SaveScoreSnapshotResult> {
  const scored = await scoreBusinessWithClient(supabase, businessId, DEFAULT_LOCALE, { listing: options.listing });
  if (scored.status !== "ok") return scored;
  // Never a scan built on empty Google values.
  if (scored.live === "unavailable") return { status: "error", message: t(DEFAULT_LOCALE, "dashboard.live.unavailable") };
  const breakdownJson: ScoreBreakdown = scanKind && scanKind !== "full" ? { ...scored.result.breakdown, scanKind } : scored.result.breakdown;
  const snapshot = buildProfileSnapshot(scored.business);

  const { data, error } = await supabase
    .from("scores")
    .insert({
      business_id: businessId,
      total: scored.result.breakdown.total,
      grade: scored.result.breakdown.grade,
      // Our own results only — never text quoting Google's values
      // (lib/breakdownStorage.ts); pages show the live score's own words.
      breakdown_json: breakdownWithoutQuotes(breakdownJson),
      scoring_version: scored.result.breakdown.scoringVersion,
      // Google's listing values aren't kept (Day 23 2c-5): what changed is
      // recorded below from this scan's values in memory and its fingerprints.
      profile_snapshot_json: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not save this scan." };
  }

  // Our own record of what changed since the last scan, and this scan's
  // fingerprints (lib/scanChanges.server.ts). Never fails the scan.
  let listingChanges: ScanChangeRecord[] = [];
  try {
    // Written by the server: the score row above was saved under the
    // owner's own access, and owners can't update a saved score.
    const [{ recordScanChanges }, { createAdminClient }] = await Promise.all([import("@/lib/scanChanges.server"), import("@/lib/supabase/admin")]);
    if (scanKind === "scoring_update") {
      // A scoring update re-scores the last scan without reading Google:
      // its fingerprints are that scan's, and nothing changed on the listing.
      await keepPreviousFingerprints(createAdminClient(), businessId, data.id);
    } else {
      listingChanges = await recordScanChanges(createAdminClient(), businessId, data.id, snapshot, { gbpReviews: options.gbpReviews, gbpPhotos: options.gbpPhotos });
    }
  } catch (err) {
    console.error(`[scan-changes] not recorded for ${businessId}:`, err instanceof Error ? err.message : err);
  }

  // A scoring update (scripts/rescore-all.ts) re-scores saved data — it
  // never confirms or reopens the owner's "I did this" tasks; the next
  // real scan does.
  const { toComplete, toReopen, pointsConfirmed } =
    scanKind === "scoring_update"
      ? { toComplete: 0, toReopen: 0, pointsConfirmed: 0 }
      : await reconcileActionPlanTasks(supabase, businessId, scored.result.breakdown, data.id);

  // In-app notifications (lib/notifications.ts): one per urgent issue this
  // scan finds, and the ones it shows are fixed resolved. Never fails the scan.
  try {
    const [{ urgentIssues }, { syncUrgentNotifications }, { createAdminClient }] = await Promise.all([
      import("@/lib/urgency"),
      import("@/lib/notifications.server"),
      import("@/lib/supabase/admin"),
    ]);
    const input = businessRowToScoringInput(scored.business as BusinessScoringRow);
    const issues = urgentIssues(input, scored.result.breakdown, { hasListing: !!scored.business.place_id });
    await syncUrgentNotifications(createAdminClient(), businessId, issues, { listingParked: input.websiteAnalysis?.websiteTrust?.listingLinkParked === true });
  } catch (err) {
    console.error(`[notifications] sync failed for ${businessId}:`, err instanceof Error ? err.message : err);
  }

  return {
    status: "saved",
    scoreId: data.id,
    tasksConfirmed: toComplete,
    tasksReopened: toReopen,
    pointsConfirmed,
    listingChanges,
  };
}

/** A scoring update's fingerprints: the previous scan's (nothing on the listing was read). */
async function keepPreviousFingerprints(admin: SupabaseClient, businessId: string, scoreId: string): Promise<void> {
  const { data: prev } = await admin.from("scores").select("field_fingerprints").eq("business_id", businessId).neq("id", scoreId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const p = prev as Record<string, unknown> | null;
  if (p?.field_fingerprints) await admin.from("scores").update({ field_fingerprints: p.field_fingerprints }).eq("id", scoreId);
}

/** When each business last saved a catch-up snapshot (this server process) —
 * two page loads at once save one, not two. */
const recentSyncs = new Map<string, number>();
const SYNC_DEDUPE_MS = 15_000;

/**
 * One score everywhere: if the score the ring shows now isn't the latest
 * saved snapshot's — Google connected, an owner answer changed our own
 * inputs — save a snapshot, so the ring, "Since last scan", "Since your
 * last scan" and Reports show the same number. A changed scoring version
 * is saved as a scoring update (no delta). Nothing before a business's
 * first snapshot (lib/businessAdded.server.ts saves it). Never fails a page.
 * `kind`: "data_update" after an owner's own change; "google_connected"
 * right after a connect (the callback); "page" on a page load — Day 23
 * 2d-4: Google's values are read live now, so a page saves only for a
 * changed scoring version, never for a Google change (the page marks it:
 * "Changed on Google since your last scan").
 */
export async function syncScoreSnapshotWithClient(
  supabase: SupabaseClient,
  businessId: string,
  kind: "data_update" | "google_connected" | "page" = "data_update",
  now: number = Date.now()
): Promise<{ saved: boolean; before: number | null; after: number | null }> {
  // A page load never saves a score — not for a Google change, not for a
  // scoring update (the real Hair Express case: re-scored by opening the
  // Overview right after the 1.16.0 bump). Only real scans and the
  // re-score script do; an owner's own change ("data_update") or connecting
  // Google ("google_connected") still saves here.
  if (kind === "page") return { saved: false, before: null, after: null };
  try {
    const [scored, { data: latest }] = await Promise.all([
      scoreBusinessWithClient(supabase, businessId, "business"),
      supabase.from("scores").select("total, grade, scoring_version").eq("business_id", businessId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (scored.status !== "ok") return { saved: false, before: null, after: null };
    const live = scored.result.breakdown;
    const last = latest as { total: number; grade: string; scoring_version: string } | null;
    if (!last) return { saved: false, before: null, after: live.total };
    // A scan of an older version that the current rules don't change still stands (lib/savedScore.ts).
    const versionChanged = !savedVersionStandsIn(last.scoring_version, live);
    // Connecting Google always gets its own labeled snapshot, even at +0.
    if (kind !== "google_connected" && !versionChanged && last.total === live.total && last.grade === live.grade) return { saved: false, before: last.total, after: live.total };
    const lastSync = recentSyncs.get(businessId);
    if (kind !== "google_connected" && lastSync !== undefined && now - lastSync < SYNC_DEDUPE_MS) return { saved: false, before: last.total, after: live.total };
    recentSyncs.set(businessId, now);
    const saved = await saveScoreSnapshotWithClient(supabase, businessId, versionChanged && kind !== "google_connected" ? "scoring_update" : kind);
    return { saved: saved.status === "saved", before: last.total, after: live.total };
  } catch (err) {
    console.error(`[scores] snapshot sync failed for ${businessId}:`, err instanceof Error ? err.message : err);
    return { saved: false, before: null, after: null };
  }
}

/** syncScoreSnapshotWithClient on a page load, for the signed-in owner (RLS). */
export async function syncScoreSnapshot(businessId: string): Promise<void> {
  await syncScoreSnapshotWithClient(createClient(), businessId, "page");
}

/**
 * Applies reconcileTasks()'s verdict to the `tasks` table: pending tasks
 * whose check is now genuinely full get marked completed and stamped
 * with the score that proved it; completed tasks whose check has since
 * regressed are deleted, since "completed" only means anything while
 * the real breakdown still agrees — a fresh task row is created next
 * time the owner marks it done again, rather than the row lying stale.
 * Returns real counts and the real point total confirmed (each
 * confirmed task's own stored `promised_points`, never estimated or
 * re-derived) so a caller can tell the owner exactly what a re-scan
 * actually proved. Best-effort: a failure here shouldn't fail the scan
 * that was just successfully saved.
 */
async function reconcileActionPlanTasks(
  supabase: SupabaseClient,
  businessId: string,
  breakdown: ScoreBreakdown,
  scoreId: string
): Promise<{ toComplete: number; toReopen: number; pointsConfirmed: number }> {
  const { data: taskRows, error } = await supabase
    .from("tasks")
    .select("id, check_id, status, promised_points, marked_done_at, verified_at, marked_metric_value")
    .eq("business_id", businessId);

  if (error || !taskRows || taskRows.length === 0) {
    return { toComplete: 0, toReopen: 0, pointsConfirmed: 0 };
  }

  const rows = taskRows as TaskRow[];
  const { toComplete, toReopen } = reconcileTasks(breakdown, rows);

  if (toComplete.length > 0) {
    await supabase
      .from("tasks")
      .update({ status: "completed", verified_at: new Date().toISOString(), verified_score_id: scoreId })
      .in("id", toComplete);
  }

  if (toReopen.length > 0) {
    await supabase.from("tasks").delete().in("id", toReopen);
  }

  const rowById = new Map(rows.map((r) => [r.id, r]));
  const pointsConfirmed = toComplete.reduce((sum, id) => sum + (rowById.get(id)?.promised_points ?? 0), 0);

  return { toComplete: toComplete.length, toReopen: toReopen.length, pointsConfirmed };
}

export type RescanBusinessResult =
  | {
      status: "ok";
      scoreId: string;
      tasksConfirmed: number;
      tasksReopened: number;
      pointsConfirmed: number;
      /** What changed on the listing since the last scan (our own records). */
      changes: ScanChangeRecord[];
      /** Interactive re-scans only (rescanBusiness): the score before and
       * after, whether PostScore's scoring version changed in between,
       * and how many checks changed — for the honest summary toast. */
      summary?: RescanSummary;
    }
  | { status: "too_soon"; nextAvailableAt: string; limit?: "daily" | "weekly" }
  /** A re-scan (or competitor refresh) is already starting or running for this business. */
  | { status: "in_progress" }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "no_results" }
  | { status: "error"; message: string };

/**
 * The real "re-scan now" action, and the only place a business's saved
 * Google data gets refreshed after it was first added: re-fetches this
 * business's LIVE data from Google Places by its real place_id (a fresh
 * network call — never a re-read of whatever's already saved), then
 * hands the result to saveBusinessWithClient() (app/actions/businesses.ts),
 * which overwrites the saved row AND re-runs the real HTTPS probe on the
 * current website, exactly like the original add-business flow. Only
 * once that's landed does it call saveScoreSnapshotWithClient() to score
 * the now-current data, persist a new `scores` row, and run the pending-
 * verification reconciliation — so a task only ever gets confirmed by
 * this real re-detected data, never by the click itself. Also diffs the
 * profile snapshot from just before the re-fetch against the fresh one,
 * so the caller can show an immediate "what changed" summary without
 * waiting on a page reload.
 *
 * Exactly one Google Places Details call per invocation.
 */
export interface RescanSummary {
  scoreBefore: number | null;
  scoreAfter: number;
  /** PostScore's scoring version changed between the two scans — the
   * point difference isn't the business's doing. */
  scoringUpdated: boolean;
  checksChanged: number;
  /** Whether this re-scan also refreshed competitors (by plan — Free
   * never, Grow weekly, Premium/Multi always). */
  competitors?: "refreshed" | "skipped";
  /** The plan the re-scan ran on — the toast says what that means for
   * competitors. */
  plan?: Plan;
}

type SavedScore = { total: number; scoring_version: string; breakdown_json: ScoreBreakdown; created_at: string };

async function latestScore(supabase: SupabaseClient, businessId: string) {
  const { data } = await supabase
    .from("scores")
    .select("total, scoring_version, breakdown_json, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as SavedScore | null;
}

/** The latest FULL scan — the 1-a-day re-scan limit never counts a
 * website-only re-check (at most 3 a day, so 10 rows always reach one). */
async function latestFullScore(supabase: SupabaseClient, businessId: string) {
  const { data } = await supabase
    .from("scores")
    .select("total, scoring_version, breakdown_json, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(10);
  return ((data ?? []) as SavedScore[]).find((row) => isFullScan(row.breakdown_json)) ?? null;
}

export async function rescanBusiness(businessId: string): Promise<RescanBusinessResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  // A double click (or a second tab) while a run is starting or running is
  // ignored — never a second paid scan (lib/scanRunGuard.ts).
  const { claimScanRun } = await import("@/lib/scanRunGuard.server");
  const run = await claimScanRun(businessId);
  if (!run.claimed) return { status: "in_progress" };
  try {
    return await rescanClaimed(supabase, businessId);
  } finally {
    await run.release().catch(() => undefined);
  }
}

/** rescanBusiness once this business's scan run is claimed. */
async function rescanClaimed(supabase: ReturnType<typeof createClient>, businessId: string): Promise<RescanBusinessResult> {
  // One re-scan per business per 24 hours, and on Free one owner re-scan
  // per 7 days (lib/rescanPolicy.ts rescanGate) — checked before any paid
  // call. Website-only re-checks don't count.
  const plan = await getPlan();
  const free = plan === "free";
  // Loaded here (admin client, server only) so importing this file stays light.
  const { lastOwnerRescanAt } = await import("@/lib/placesSearchBudget.server");
  const [before, lastFull, lastOwner] = await Promise.all([
    latestScore(supabase, businessId),
    latestFullScore(supabase, businessId),
    free ? lastOwnerRescanAt(businessId) : Promise.resolve(null),
  ]);
  const gate = rescanGate(free, lastFull?.created_at ?? null, lastOwner, new Date());
  if (!gate.allowed) return { status: "too_soon", nextAvailableAt: gate.nextAvailableAt!, limit: gate.limit ?? "daily" };

  // Its Place Details call is logged as "owner_rescan" — every plan, and
  // Free's re-scan limit reads it (lastOwnerRescanAt).
  const result = await rescanBusinessWithClient(supabase, businessId, false, { detailsKind: "owner_rescan" });
  if (result.status !== "ok") return result;
  // Competitors, by plan: Premium/Multi every re-scan, Grow weekly, Free
  // never (Free re-scans make no Nearby Search call). Interactive only —
  // the bulk re-scan script and the monthly report call
  // rescanBusinessWithClient directly.
  const competitors = await refreshCompetitorsOnRescanWithClient(supabase, businessId, plan);

  const after = await latestScore(supabase, businessId);
  if (!after) return result;
  const scoringUpdated = !!before && before.scoring_version !== after.scoring_version;
  return {
    ...result,
    summary: {
      scoreBefore: before?.total ?? null,
      scoreAfter: after.total,
      scoringUpdated,
      checksChanged: before && !scoringUpdated ? diffBreakdowns(before.breakdown_json, after.breakdown_json).length : 0,
      competitors,
      plan,
    },
  };
}

/**
 * The real logic behind rescanBusiness() — see scoreBusinessWithClient's
 * doc comment for why this accepts an injected client rather than
 * creating its own. This is the SAME re-scan the interactive "Re-scan
 * now" button runs, parameterized so the monthly-report cron route can
 * run the identical Google-refetch → save → score → diff sequence,
 * through the service-role admin client, for a business it doesn't have
 * a session for. Reads the business's own real owner_id off the row
 * itself (never a client-supplied value) so saveBusinessWithClient's
 * upsert still lands on the exact same owner+place_id row it always has.
 */
export async function rescanBusinessWithClient(
  supabase: SupabaseClient,
  businessId: string,
  // Forces saveBusinessWithClient to skip a real ScreenshotOne capture
  // even on this business's first-ever website analysis — see its own
  // doc comment (app/actions/businesses.ts). Omitted (not merely false)
  // by the interactive "Re-scan now" path and the monthly-report cron,
  // so neither one's real behavior changes; only
  // scripts/rescan-all.ts's --no-screenshots flag passes true.
  skipScreenshots: boolean = false,
  // Which caller this is, for the Place Details log and
  // PLACES_DETAILS_MONTHLY_CAP (lib/placesDetailsBudget.ts): "owner_rescan",
  // "monthly", "rescan_all"…
  options: { detailsKind?: PlacesDetailsKind } = {}
): Promise<RescanBusinessResult> {
  const detailsKind = options.detailsKind ?? "rescan";
  // Archived ("Yes, we've closed"): no Google calls, no new score.
  if (await isBusinessArchived(supabase, businessId)) {
    return { status: "error", message: t(DEFAULT_LOCALE, "dashboard.closed.archived.blocked") };
  }
  const { data: before, error: beforeError } = await supabase
    .from("businesses")
    .select(
      // Day 23 2d-4: our own columns only — never Google's saved values.
      "owner_id, place_id, language, website_analysis_json, google_listing_missing_website_since, google_listing_website_removed_since, google_listing_last_known_website_at"
    )
    .eq("id", businessId)
    .single();

  if (beforeError || !before) {
    return { status: "not_found" };
  }

  // Day 2b: a website-only business has no Google listing to re-fetch —
  // never a Places call for it (its website is re-checked by
  // recheckWebsiteOnlyBusiness instead).
  if (!before.place_id) {
    return { status: "error", message: "This business has no Google listing — re-check its website instead." };
  }

  const locale = normalizeLocale(before.language);
  // The listing's website at the last scan (D6): whether it showed one (its
  // fingerprint), and the site we graded — our own result, never Google's
  // saved link.
  const previousWebsite = await previousListingWebsite(supabase, businessId, before.website_analysis_json);

  // Loaded here (admin client, server only) so importing this file stays light.
  const details = await import("@/lib/placesDetailsBudget.server");
  // Over this month's Place Details cap (D5): no Google read, so nothing
  // to score — the last scan stands, and the owner is told why.
  if (!(await details.detailsCallAllowed(detailsKind))) {
    await details.logPlacesDetailsSkip(businessId, detailsKind);
    return { status: "error", message: t(locale, "dashboard.scan.refreshSkipped") };
  }

  const lookup = await lookupBusinessByPlaceId(before.place_id);
  // Every answered call is billed and logged (a network error isn't).
  if (lookup.status !== "error") await details.logPlacesDetailsCall(businessId, detailsKind);

  if (lookup.status === "no_results") {
    return { status: "no_results" };
  }
  if (lookup.status === "multiple") {
    // A single place_id we already resolved once should never come back
    // ambiguous on a re-fetch — surface this honestly rather than
    // silently guessing which candidate is still the right one.
    return {
      status: "error",
      message: "Google returned more than one match for this listing's saved place ID.",
    };
  }
  if (lookup.status === "error") {
    return { status: "error", message: lookup.message };
  }

  // Google's fresh lookup came back with no website this time, but we
  // already have one on file — a single empty response is never trusted
  // as proof the listing actually lost its website (the real Endless
  // Nails case this fixes), so retry once for real before deciding
  // anything. See resolveListingWebsite (lib/googleListingWebsite.ts)
  // for the exact decision this feeds.
  let retryLookupWebsite: string | null | undefined;
  if (!lookup.place.website && previousWebsite && (await details.detailsCallAllowed("website_retry", { interactive: detailsKind === "owner_rescan" }))) {
    const retry = await lookupBusinessByPlaceId(before.place_id);
    if (retry.status !== "error") await details.logPlacesDetailsCall(businessId, "website_retry");
    retryLookupWebsite = retry.status === "found" ? retry.place.website : null;
  }
  const resolvedWebsite = resolveListingWebsite(
    previousWebsite,
    lookup.place.website,
    retryLookupWebsite,
    before.google_listing_missing_website_since,
    before.google_listing_website_removed_since,
    new Date().toISOString()
  );
  const placeToSave = { ...lookup.place, website: resolvedWebsite.website };
  // This read is the visit's read too (not connected: connected owners'
  // pages read Business Profile) — no second call right after a scan.
  {
    const { isGbpConnected, rememberOwnerListing } = await import("@/lib/ownerListing.server");
    const { liveListingFromPlaces } = await import("@/lib/ownerListing");
    if (!(await isGbpConnected(supabase, businessId))) rememberOwnerListing(businessId, liveListingFromPlaces(placeToSave));
  }

  // The REAL "it last showed one on {date}" date — see
  // findLastKnownWebsiteDate's own doc (lib/googleListingWebsite.ts) for
  // why this must never reuse googleListingWebsiteRemovedSince itself
  // (the real Endless Nails bug this fixes: a manual one-off restore's
  // own timestamp had ended up in that field, then in the banner).
  // Only computed via a real history lookup at the exact moment a
  // SUSPECTED gap is newly promoted to CONFIRMED; carried forward
  // unchanged on every later scan that stays confirmed; cleared
  // whenever not currently confirmed missing.
  let lastKnownWebsiteAt: string | null = null;
  if (resolvedWebsite.googleListingWebsiteRemovedSince) {
    if (before.google_listing_website_removed_since) {
      // Already confirmed before this scan — carry the real date forward unchanged.
      lastKnownWebsiteAt = before.google_listing_last_known_website_at;
    } else {
      // Newly confirmed THIS scan — look up the real history.
      // A scan showed a website when its website fingerprint is set (Google's
      // address itself isn't kept — lib/scanChanges.ts).
      const { data: history } = await supabase
        .from("scores")
        .select("created_at, fp_website:field_fingerprints->f->>website")
        .eq("business_id", businessId);
      const snapshots = (history ?? []).map((row) => ({
        website: (row as { fp_website?: string | null }).fp_website ? "listed" : null,
        createdAt: row.created_at as string,
      }));
      lastKnownWebsiteAt = findLastKnownWebsiteDate(snapshots, resolvedWebsite.googleListingWebsiteRemovedSince);
    }
  }

  const saved = await saveBusinessWithClient(
    supabase,
    before.owner_id,
    placeToSave,
    undefined,
    undefined,
    undefined,
    skipScreenshots,
    resolvedWebsite.googleListingMissingWebsiteSince,
    resolvedWebsite.googleListingWebsiteRemovedSince,
    lastKnownWebsiteAt
  );
  if (saved.status !== "saved") {
    return saved.status === "unauthenticated"
      ? { status: "unauthenticated" }
      : { status: "error", message: saved.status === "error" ? saved.message : "Could not save the fresh listing data." };
  }

  // Connected businesses: the review-reply counts, once per scan (owner
  // re-scan, monthly job, rescan-all — all come through here) — BEFORE the
  // score, which (v1.12.0) uses them. Never fails the scan. Loaded here:
  // it's server-only.
  const { runGbpReplyCheck } = await import("@/lib/gbpReplyCounts.server");
  const replyCheck = await runGbpReplyCheck(businessId);
  // Photos and posts on the listing (summaries only); never fails the scan.
  const [{ refreshPhotosAndPosts }, { createAdminClient }] = await Promise.all([import("@/lib/gbpMediaPosts.server"), import("@/lib/supabase/admin")]);
  const photosCheck = await refreshPhotosAndPosts(createAdminClient(), businessId).catch(() => undefined);
  // Google's own edits (getGoogleUpdated): read only; never fails the scan.
  const { checkGoogleEdits } = await import("@/lib/gbpGoogleEdits.server");
  await checkGoogleEdits(createAdminClient(), businessId).catch(() => undefined);

  // Their own reviews and photos, just read: exactly how many are new since
  // the last scan. Scored from this scan's listing in memory (Day 23 2d-4) —
  // none of Google's values were saved.
  const scoreResult = await saveScoreSnapshotWithClient(supabase, businessId, undefined, {
    gbpReviews: replyCheck.status === "ok" ? replyCheck.reviewTimes : null,
    gbpPhotos: photosCheck?.photoTimes ?? null,
    listing: listingScoringRow(placeToSave),
  });
  if (scoreResult.status !== "saved") {
    return scoreResult;
  }

  return {
    status: "ok",
    scoreId: scoreResult.scoreId,
    tasksConfirmed: scoreResult.tasksConfirmed,
    tasksReopened: scoreResult.tasksReopened,
    pointsConfirmed: scoreResult.pointsConfirmed,
    // What changed since the last scan: our own records of it (lib/scanChanges.ts).
    changes: scoreResult.listingChanges ?? [],
  };
}

/** Whether the listing showed a website at the last scan (its fingerprint)
 * and, if so, the site we graded then (our website analysis) — what a
 * single empty answer from Google keeps scoring with (lib/googleListingWebsite.ts). */
async function previousListingWebsite(supabase: SupabaseClient, businessId: string, analysisJson: unknown): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("scores")
      .select("fp_website:field_fingerprints->f->>website")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!(data as { fp_website?: string | null } | null)?.fp_website) return null;
    return gradedSiteUrl(analysisJson);
  } catch {
    // Unknown: treated as no website at the last scan (never fails the scan).
    return null;
  }
}

/** When the business's most recent scan ran, or null if it's never been
 * scanned — used to tell a still-pending action-plan task apart as
 * "hasn't been re-checked since you marked it" vs. "checked, no change
 * yet" (see pendingCheckStatus in lib/actionPlan.ts). A single narrow
 * query rather than reusing getScoreHistory/getRecentScoreSnapshots,
 * since the Growth page needs only this one timestamp. */
async function getLastScanAtUncached(businessId: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("scores")
    .select("created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.created_at;
}

export interface ScoreHistoryRow {
  id: string;
  total: number;
  grade: string;
  scoring_version: string;
  created_at: string;
  /** "website_recheck" for a website-only re-check; null for a full scan. */
  scan_kind?: string | null;
}

/** Most recent scans for a business, newest first. RLS-scoped to the current user. */
async function getScoreHistoryUncached(businessId: string): Promise<ScoreHistoryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("scores")
    .select("id, total, grade, scoring_version, created_at, scan_kind:breakdown_json->>scanKind")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) return [];
  return data;
}

export interface ScoreSnapshot {
  id: string;
  total: number;
  grade: string;
  scoring_version: string;
  created_at: string;
  breakdown_json: ScoreBreakdown;
  /** Real Google listing fields at the moment of this scan — see
   * buildProfileSnapshot in lib/profileChanges.ts. Null for any scan
   * saved before that column existed; callers must treat that honestly
   * as "nothing to diff from," never as all-fields-unchanged. */
  profile_snapshot_json: ProfileSnapshot | null;
  /** On the newest scan only: what changed since the scan before it, from
   * our own change records (lib/scanChanges.ts). */
  listing_changes?: ScanChangeSummary;
}

/**
 * The two (or so) most recent saved scans, full breakdown AND profile
 * snapshot included — used to build both the check-level "score changes"
 * view and the real-listing "what changed" feed. Deliberately a
 * separate, narrower query from getScoreHistory(): the history table
 * only needs totals/grades for many rows, this needs the full per-check
 * breakdown and profile snapshot for just the last couple.
 */
export async function getRecentScoreSnapshots(
  businessId: string,
  limit = 2
): Promise<ScoreSnapshot[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("scores")
    .select(`id, total, grade, scoring_version, created_at, breakdown_json, profile_snapshot_json, ${FP_KEY_COLUMN}`)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  const rows = data as unknown as Array<ScoreSnapshot & { fp_key: string | null }>;
  if (rows.length >= 2) {
    const [current, previous] = rows;
    rows[0] = { ...current, listing_changes: changesAcross([{ id: previous.id, fpKey: previous.fp_key }, { id: current.id, fpKey: current.fp_key }], await loadScanChangeRecords(supabase, [current.id])) };
  }
  return rows;
}

/** Request-scoped (lib/requestCache.ts): one query per page render. */
const scoreBusinessByIdCached = requestCache(scoreBusinessByIdUncached);
export async function scoreBusinessById(...args: Parameters<typeof scoreBusinessByIdUncached>): Promise<Awaited<ReturnType<typeof scoreBusinessByIdUncached>>> {
  return scoreBusinessByIdCached(...args);
}

/** Request-scoped (lib/requestCache.ts): one query per page render. */
const getScoreHistoryCached = requestCache(getScoreHistoryUncached);
export async function getScoreHistory(...args: Parameters<typeof getScoreHistoryUncached>): Promise<Awaited<ReturnType<typeof getScoreHistoryUncached>>> {
  return getScoreHistoryCached(...args);
}

/** Request-scoped (lib/requestCache.ts): one query per page render. */
const getLastScanAtCached = requestCache(getLastScanAtUncached);
export async function getLastScanAt(...args: Parameters<typeof getLastScanAtUncached>): Promise<Awaited<ReturnType<typeof getLastScanAtUncached>>> {
  return getLastScanAtCached(...args);
}
