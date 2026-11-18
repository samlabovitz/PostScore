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
    .select("id, name, place_id, listing_mode, language, category, primary_type, business_type_override, categories, biz_type_resolved")
    .eq("id", businessId)
    .maybeSingle();
  if (error || !row) return { status: "not_found" };
  // No hours on Google: "By appointment only" for types that usually work that way.
  // Classes and workshops by their saved niche ("Art & pottery classes").
  const byAppointment = usuallyByAppointment(
    resolveBizProfile(row.category, row.primary_type, row.business_type_override ?? null, normalizeLocale(row.language), row.categories, row.name, row.biz_type_resolved ?? null).id,
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
