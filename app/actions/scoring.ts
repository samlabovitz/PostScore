"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  businessRowToScoringInput,
  getScoreWithSuggestions,
  type BusinessScoringRow,
  type ScoreBreakdown,
  type ScoreWithSuggestions,
} from "@/lib/scoring";
import { reconcileTasks, type TaskRow } from "@/lib/actionPlan";
import { buildProfileSnapshot, diffProfileSnapshots, type ProfileChange, type ProfileSnapshot } from "@/lib/profileChanges";
import { lookupBusinessByPlaceId, type OpeningHoursPeriod } from "@/lib/google/places";
import { saveBusinessWithClient } from "@/app/actions/businesses";
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "@/lib/i18n";
import { findLastKnownWebsiteDate, resolveListingWebsite } from "@/lib/googleListingWebsite";

export interface BusinessRecord extends BusinessScoringRow {
  id: string;
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
  | { status: "ok"; business: BusinessRecord; result: ScoreWithSuggestions }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * Loads a saved business (RLS-scoped to the current user) and scores it
 * live. This never writes to the database — it's just lib/scoring.ts run
 * on whatever the businesses table currently holds, so viewing a
 * business's page is free to do as often as you like.
 */
export async function scoreBusinessById(
  businessId: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<ScoreBusinessResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  return scoreBusinessWithClient(supabase, businessId, locale);
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
  locale: Locale = DEFAULT_LOCALE
): Promise<ScoreBusinessResult> {
  const { data: business, error } = await supabase
    .from("businesses")
    .select(
      "id, name, address, phone, website, rating, review_count, category, categories, opening_hours, opening_hours_periods, photo_count, business_status, https_status, website_analysis_json, google_maps_uri, language, google_listing_missing_website_since, google_listing_website_removed_since, google_listing_last_known_website_at"
    )
    .eq("id", businessId)
    .single();

  if (error || !business) {
    return { status: "not_found" };
  }

  const input = businessRowToScoringInput(business as BusinessScoringRow);
  const result = getScoreWithSuggestions(input, locale);

  return { status: "ok", business: business as BusinessRecord, result };
}

export type SaveScoreSnapshotResult =
  | { status: "saved"; scoreId: string; tasksConfirmed: number; tasksReopened: number; pointsConfirmed: number }
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
  businessId: string
): Promise<SaveScoreSnapshotResult> {
  const scored = await scoreBusinessWithClient(supabase, businessId);
  if (scored.status !== "ok") return scored;

  const { data, error } = await supabase
    .from("scores")
    .insert({
      business_id: businessId,
      total: scored.result.breakdown.total,
      grade: scored.result.breakdown.grade,
      breakdown_json: scored.result.breakdown,
      scoring_version: scored.result.breakdown.scoringVersion,
      profile_snapshot_json: buildProfileSnapshot(scored.business),
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not save this scan." };
  }

  const { toComplete, toReopen, pointsConfirmed } = await reconcileActionPlanTasks(
    supabase,
    businessId,
    scored.result.breakdown,
    data.id
  );

  return {
    status: "saved",
    scoreId: data.id,
    tasksConfirmed: toComplete,
    tasksReopened: toReopen,
    pointsConfirmed,
  };
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
      changes: ProfileChange[];
    }
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
export async function rescanBusiness(businessId: string): Promise<RescanBusinessResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  return rescanBusinessWithClient(supabase, businessId);
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
  skipScreenshots: boolean = false
): Promise<RescanBusinessResult> {
  const { data: before, error: beforeError } = await supabase
    .from("businesses")
    .select(
      "owner_id, place_id, phone, website, opening_hours, categories, photo_count, rating, review_count, business_status, language, google_listing_missing_website_since, google_listing_website_removed_since, google_listing_last_known_website_at"
    )
    .eq("id", businessId)
    .single();

  if (beforeError || !before) {
    return { status: "not_found" };
  }

  const locale = normalizeLocale(before.language);
  const previousSnapshot: ProfileSnapshot = buildProfileSnapshot(before);

  const lookup = await lookupBusinessByPlaceId(before.place_id);

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
  if (!lookup.place.website && before.website) {
    const retry = await lookupBusinessByPlaceId(before.place_id);
    retryLookupWebsite = retry.status === "found" ? retry.place.website : null;
  }
  const resolvedWebsite = resolveListingWebsite(
    before.website,
    lookup.place.website,
    retryLookupWebsite,
    before.google_listing_missing_website_since,
    before.google_listing_website_removed_since,
    new Date().toISOString()
  );
  const placeToSave = { ...lookup.place, website: resolvedWebsite.website };

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
      const { data: history } = await supabase
        .from("scores")
        .select("created_at, profile_snapshot_json")
        .eq("business_id", businessId);
      const snapshots = (history ?? []).map((row) => ({
        website: (row.profile_snapshot_json as { website?: string | null } | null)?.website ?? null,
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

  const scoreResult = await saveScoreSnapshotWithClient(supabase, businessId);
  if (scoreResult.status !== "saved") {
    return scoreResult;
  }

  const currentSnapshot: ProfileSnapshot = buildProfileSnapshot({
    phone: lookup.place.phone,
    // The real, resolved website — never Google's raw empty response
    // when that was overridden by resolveListingWebsite above, so the
    // "what changed" diff never reports a website as removed when it
    // was actually kept.
    website: resolvedWebsite.website,
    opening_hours: lookup.place.openingHours,
    categories: lookup.place.categories,
    photo_count: lookup.place.photoCount,
    rating: lookup.place.rating,
    review_count: lookup.place.userRatingCount,
    business_status: lookup.place.businessStatus,
  });

  return {
    status: "ok",
    scoreId: scoreResult.scoreId,
    tasksConfirmed: scoreResult.tasksConfirmed,
    tasksReopened: scoreResult.tasksReopened,
    pointsConfirmed: scoreResult.pointsConfirmed,
    changes: diffProfileSnapshots(previousSnapshot, currentSnapshot, locale),
  };
}

/** When the business's most recent scan ran, or null if it's never been
 * scanned — used to tell a still-pending action-plan task apart as
 * "hasn't been re-checked since you marked it" vs. "checked, no change
 * yet" (see pendingCheckStatus in lib/actionPlan.ts). A single narrow
 * query rather than reusing getScoreHistory/getRecentScoreSnapshots,
 * since the Growth page needs only this one timestamp. */
export async function getLastScanAt(businessId: string): Promise<string | null> {
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
}

/** Most recent scans for a business, newest first. RLS-scoped to the current user. */
export async function getScoreHistory(businessId: string): Promise<ScoreHistoryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("scores")
    .select("id, total, grade, scoring_version, created_at")
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
    .select("id, total, grade, scoring_version, created_at, breakdown_json, profile_snapshot_json")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as ScoreSnapshot[];
}
