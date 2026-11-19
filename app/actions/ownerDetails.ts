"use server";

// Day 23 2d-3: Settings → "Your business details". Reads the card (the
// owner's confirmed details, or a live pre-fill when there are none) and
// saves what the owner confirms to businesses.owner_details
// (supabase/owner-details.sql), as "provided by you". Scoring never reads it.

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { normalizeLocale } from "@/lib/i18n";
import { ownerDetailsPrefill, ownerHoursInput, sanitizeOwnerDetails, usuallyByAppointment, type OwnerDetails } from "@/lib/ownerDetails";
import { resolveBizProfile } from "@/config/bizProfiles";
import { loadBusinessNiche } from "@/lib/businessNiche.server";
import { loadOwnerDetails } from "@/lib/ownerDetails.server";
import { liveListingForRow } from "@/lib/ownerListing.server";
import { logSaveFailure, saveFailureReason } from "@/lib/saveFailure";
import { CONFIRM_DETAILS_NOT_NOW_1, CONFIRM_DETAILS_NOT_NOW_2, confirmDetailsCardShown, confirmDetailsNotNowKey } from "@/lib/confirmDetailsCard";

export type OwnerDetailsCard = {
  details: OwnerDetails;
  /** When the owner last confirmed them; null = the values are the live pre-fill. */
  confirmedAt: string | null;
  /** Not confirmed and the listing couldn't be read: the fields start empty. */
  liveUnavailable: boolean;
  /** No Google listing (website only): no pre-fill and no prompt. */
  noListing: boolean;
  /** Read Google, and it shows no hours: "Google doesn't show hours for you yet." */
  noGoogleHours: boolean;
};

export type GetOwnerDetailsCardResult = { status: "ok"; card: OwnerDetailsCard } | { status: "unauthenticated" } | { status: "not_found" };

/**
 * The card's values. Confirmed: the owner's own, and no Google call. Not
 * confirmed: the listing as Google shows it now (one live read, shared
 * with the visit's other pages — lib/ownerListing.server.ts).
 */
export async function getOwnerDetailsCardWithClient(supabase: SupabaseClient, businessId: string): Promise<GetOwnerDetailsCardResult> {
  const { data: row, error } = await supabase
    .from("businesses")
    .select("id, place_id, listing_mode, language, business_type_override, biz_type_resolved")
    .eq("id", businessId)
    .maybeSingle();
  if (error || !row) return { status: "not_found" };
  // No hours on Google: "By appointment only" for types that usually work that way.
  // Classes and workshops by their saved niche ("Art & pottery classes").
  const byAppointment = usuallyByAppointment(
    resolveBizProfile(null, null, row.business_type_override ?? null, normalizeLocale(row.language), null, null, row.biz_type_resolved ?? null).id,
    (await loadBusinessNiche(supabase, businessId).catch(() => null))?.resolved.nicheId ?? null
  );
  const noListing = !row.place_id || row.listing_mode === "website_only";
  const saved = await loadOwnerDetails(supabase, businessId);
  if (saved) return { status: "ok", card: { details: saved.details, confirmedAt: saved.confirmedAt, liveUnavailable: false, noListing, noGoogleHours: false } };
  if (noListing) return { status: "ok", card: { details: ownerDetailsPrefill(null, { byAppointment }), confirmedAt: null, liveUnavailable: false, noListing, noGoogleHours: false } };
  const live = await liveListingForRow(supabase, businessId, row);
  const values = live.status === "ok" ? live.values : null;
  return {
    status: "ok",
    card: {
      details: ownerDetailsPrefill(values, { byAppointment }),
      confirmedAt: null,
      liveUnavailable: live.status !== "ok",
      noListing,
      noGoogleHours: !!values && !values.openingHoursPeriods?.length,
    },
  };
}

export async function getOwnerDetailsCard(businessId: string): Promise<GetOwnerDetailsCardResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  return getOwnerDetailsCardWithClient(supabase, businessId);
}

export type SaveOwnerDetailsResult =
  | { status: "ok"; details: OwnerDetails; confirmedAt: string }
  | { status: "invalid" }
  /** The hours don't add up (overlaps, a day with no times). */
  | { status: "invalid_hours" }
  /** The columns aren't there yet — supabase/owner-details.sql hasn't been run. */
  | { status: "not_enabled"; reason?: string }
  | { status: "unauthenticated" }
  /** `reason`: a short cause, shown in development only. */
  | { status: "error"; reason?: string };

function isMissingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || /owner_details/.test(error.message ?? ""));
}

export async function saveOwnerDetailsWithClient(supabase: SupabaseClient, businessId: string, input: unknown, now = new Date()): Promise<SaveOwnerDetailsResult> {
  const details = sanitizeOwnerDetails(input);
  if (!details) return { status: "invalid" };
  if (!ownerHoursInput((input as { hours?: unknown }).hours)) return { status: "invalid_hours" };
  const confirmedAt = now.toISOString();
  const { data, error } = await supabase.from("businesses").update({ owner_details: details, owner_details_confirmed_at: confirmedAt }).eq("id", businessId).select("id");
  // Exactly this one business: anything else is a failed save, never "Confirmed".
  if (error || !data || data.length !== 1) {
    const reason = saveFailureReason(error, "owner_details", "supabase/owner-details.sql");
    logSaveFailure("saveOwnerDetails", reason, error);
    return isMissingColumn(error) ? { status: "not_enabled", reason } : { status: "error", reason };
  }
  return { status: "ok", details, confirmedAt };
}

export async function saveOwnerDetails(businessId: string, input: unknown): Promise<SaveOwnerDetailsResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  const result = await saveOwnerDetailsWithClient(supabase, businessId, input);
  // The header and the Overview's prompt read them.
  if (result.status === "ok") revalidatePath(`/business/${businessId}`, "layout");
  return result;
}

// ---------------------------------------------------------------------------
// Day 23 2d-5: the Overview's "Confirm your business details" card
// (lib/confirmDetailsCard.ts) — after the first scan, until confirmed.
// ---------------------------------------------------------------------------

async function notNowState(supabase: SupabaseClient, businessId: string): Promise<{ firstNotNowAt: string | null; secondNotNow: boolean }> {
  try {
    const { data, error } = await supabase.from("promo_dismissals").select("promo_key, hidden_until").eq("business_id", businessId).in("promo_key", [CONFIRM_DETAILS_NOT_NOW_1, CONFIRM_DETAILS_NOT_NOW_2]);
    if (error) return { firstNotNowAt: null, secondNotNow: false };
    const rows = (data ?? []) as Array<{ promo_key: string; hidden_until: string }>;
    return { firstNotNowAt: rows.find((r) => r.promo_key === CONFIRM_DETAILS_NOT_NOW_1)?.hidden_until ?? null, secondNotNow: rows.some((r) => r.promo_key === CONFIRM_DETAILS_NOT_NOW_2) };
  } catch {
    return { firstNotNowAt: null, secondNotNow: false };
  }
}

/** The newest real scan — never a scoring update (it isn't a scan). */
async function lastScanAt(supabase: SupabaseClient, businessId: string): Promise<string | null> {
  const { data } = await supabase.from("scores").select("created_at, scan_kind:breakdown_json->>scanKind").eq("business_id", businessId).order("created_at", { ascending: false }).limit(10);
  const row = ((data ?? []) as Array<{ created_at: string; scan_kind: string | null }>).find((r) => r.scan_kind !== "scoring_update");
  return row?.created_at ?? null;
}

export type ConfirmDetailsCardResult = { shown: false } | { shown: true; card: OwnerDetailsCard };

/** Whether the Overview shows the card, and its pre-filled details. The
 * live read is the visit's own (shared with the page — one per 10 minutes). */
export async function getConfirmDetailsCardWithClient(supabase: SupabaseClient, businessId: string): Promise<ConfirmDetailsCardResult> {
  // The card never breaks the Overview: anything unreadable shows no card.
  return confirmDetailsCard(supabase, businessId).catch((): ConfirmDetailsCardResult => ({ shown: false }));
}

async function confirmDetailsCard(supabase: SupabaseClient, businessId: string): Promise<ConfirmDetailsCardResult> {
  const [owner, listing, notNow, scanAt] = await Promise.all([
    loadOwnerDetails(supabase, businessId),
    supabase.from("businesses").select("place_id, listing_mode").eq("id", businessId).maybeSingle(),
    notNowState(supabase, businessId),
    lastScanAt(supabase, businessId),
  ]);
  const row = listing.data as { place_id: string | null; listing_mode: string | null } | null;
  if (!row) return { shown: false };
  const shown = confirmDetailsCardShown({ confirmed: owner !== null, noListing: !row.place_id || row.listing_mode === "website_only", ...notNow, lastScanAt: scanAt });
  if (!shown) return { shown: false };
  const card = await getOwnerDetailsCardWithClient(supabase, businessId);
  return card.status === "ok" ? { shown: true, card: card.card } : { shown: false };
}

export async function getConfirmDetailsCard(businessId: string): Promise<ConfirmDetailsCardResult> {
  return getConfirmDetailsCardWithClient(createClient(), businessId);
}

export type DismissConfirmDetailsResult = { status: "ok" | "unauthenticated" | "error" };

/** "Not now": hidden until the next scan the first time, for good the second. */
export async function dismissConfirmDetailsWithClient(supabase: SupabaseClient, userId: string, businessId: string, now = new Date()): Promise<DismissConfirmDetailsResult> {
  const { firstNotNowAt } = await notNowState(supabase, businessId);
  const key = confirmDetailsNotNowKey(firstNotNowAt);
  const { error } = await supabase
    .from("promo_dismissals")
    .upsert({ user_id: userId, business_id: businessId, promo_key: key, hidden_until: key === CONFIRM_DETAILS_NOT_NOW_1 ? now.toISOString() : "2100-01-01T00:00:00Z" }, { onConflict: "user_id,business_id,promo_key" });
  return { status: error ? "error" : "ok" };
}

export async function dismissConfirmDetails(businessId: string): Promise<DismissConfirmDetailsResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  const result = await dismissConfirmDetailsWithClient(supabase, user.id, businessId);
  if (result.status === "ok") revalidatePath(`/business/${businessId}`);
  return result;
}
