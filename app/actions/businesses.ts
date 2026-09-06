"use server";

import { createClient } from "@/lib/supabase/server";
import type { PlaceDetails } from "@/lib/google/places";
import { checkWebsiteHttps } from "@/lib/websiteHttps";
import { bizProfileById } from "@/config/bizProfiles";

export type SaveBusinessResult =
  | { status: "saved"; businessId: string }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * Persists a looked-up Google place as a business owned by the current
 * user. Also runs a real HTTPS probe of the site here (see
 * lib/websiteHttps.ts) — this is the one "data collection" moment for
 * that fact, same as every other Google-derived field, so it's cached
 * onto the row rather than re-checked on every score view. When there's
 * no website, https_status stays null (nothing to check).
 */
export async function saveBusiness(
  place: PlaceDetails
): Promise<SaveBusinessResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: "unauthenticated" };
  }

  const httpsStatus = place.website ? await checkWebsiteHttps(place.website) : null;

  const { data, error } = await supabase
    .from("businesses")
    .upsert(
      {
        owner_id: user.id,
        place_id: place.placeId,
        name: place.name,
        address: place.formattedAddress,
        phone: place.phone,
        website: place.website,
        rating: place.rating,
        review_count: place.userRatingCount,
        category: place.primaryCategory,
        primary_type: place.primaryType,
        categories: place.categories,
        opening_hours: place.openingHours,
        business_status: place.businessStatus,
        photo_count: place.photoCount,
        google_maps_uri: place.googleMapsUri,
        price_level: place.priceLevel,
        lat: place.location?.lat ?? null,
        lng: place.location?.lng ?? null,
        https_status: httpsStatus,
        https_checked_at: httpsStatus ? new Date().toISOString() : null,
      },
      { onConflict: "owner_id,place_id" }
    )
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "Save failed." };
  }

  return { status: "saved", businessId: data.id };
}

export interface BusinessSummary {
  id: string;
  name: string | null;
  address: string | null;
  /**
   * Google's human-readable category (e.g. "Hair Salon") and
   * machine-readable type slug (e.g. "hair_salon") — feed
   * bizProfile() resolution. Optional because some callers (the
   * sidebar header, the competitors page) only ever need
   * id/name/address and build this shape without them; getBusinessSummary()
   * itself always populates both.
   */
  category?: string | null;
  primary_type?: string | null;
  /**
   * The owner's manual correction of business type, when Google's own
   * category/primary_type resolves to the wrong (often too-generic)
   * profile — see resolveBizProfile() in config/bizProfiles.ts. Optional
   * for the same reason category/primary_type are: only callers that
   * resolve a business type need it, and getBusinessSummary() always
   * populates it when it does. null = no override, fall back to
   * auto-detection.
   */
  business_type_override?: string | null;
  /** Optional: only the Growth page's coupon share caption needs this,
   * so most callers don't select it. */
  phone?: string | null;
  /** Owner-entered business-memory facts for the assistant's "What I know
   * about your business" panel (see lib/assistant.ts) — optional because
   * only the assistant currently needs them. Empty/null = not entered yet. */
  services?: string[] | null;
  avg_job_value_low?: number | null;
  avg_job_value_high?: number | null;
}

export type GetBusinessSummaryResult =
  | { status: "ok"; business: BusinessSummary }
  | { status: "not_found" }
  | { status: "unauthenticated" };

/**
 * A minimal, RLS-scoped lookup for pages that only need to know which
 * business they're for — the sidebar header and not-yet-built section
 * placeholders — without paying for a full score computation.
 */
export async function getBusinessSummary(businessId: string): Promise<GetBusinessSummaryResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, address, category, primary_type, business_type_override, phone, services, avg_job_value_low, avg_job_value_high"
    )
    .eq("id", businessId)
    .single();

  if (error || !data) {
    return { status: "not_found" };
  }

  return { status: "ok", business: data as BusinessSummary };
}

export type UpdateBusinessProfileResult =
  | { status: "ok"; services: string[]; avgJobValueLow: number | null; avgJobValueHigh: number | null }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * Saves the owner-entered facts behind the assistant's "What I know about
 * your business" panel (see AssistantBusinessProfile in lib/assistant.ts)
 * — editable bits of that memory, everything else there being derived
 * live from real data. RLS (the same owner-scoped update policy every
 * other businesses-table write relies on) is what actually enforces this
 * can only ever touch the caller's own business.
 */
export async function updateBusinessProfile(
  businessId: string,
  fields: { services: string[]; avgJobValueLow: number | null; avgJobValueHigh: number | null }
): Promise<UpdateBusinessProfileResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const services = fields.services.map((s) => s.trim()).filter((s) => s.length > 0);

  // A job-value range is both-or-neither: the low end alone isn't a
  // usable range, and low can never exceed high — mirrors the DB check
  // constraint (businesses_job_value_range_check) so a bad value never
  // even reaches it.
  const { avgJobValueLow, avgJobValueHigh } = fields;
  if ((avgJobValueLow === null) !== (avgJobValueHigh === null)) {
    return { status: "error", message: "Enter both a low and a high job value, or leave both blank." };
  }
  if (avgJobValueLow !== null && avgJobValueHigh !== null) {
    if (Number.isNaN(avgJobValueLow) || Number.isNaN(avgJobValueHigh) || avgJobValueLow < 0 || avgJobValueHigh < 0) {
      return { status: "error", message: "Job values must be positive numbers." };
    }
    if (avgJobValueLow > avgJobValueHigh) {
      return { status: "error", message: "The low value can't be more than the high value." };
    }
  }

  const { data, error } = await supabase
    .from("businesses")
    .update({ services, avg_job_value_low: avgJobValueLow, avg_job_value_high: avgJobValueHigh })
    .eq("id", businessId)
    .select("services, avg_job_value_low, avg_job_value_high")
    .single();

  if (error || !data) {
    return { status: "not_found" };
  }

  return {
    status: "ok",
    services: data.services ?? [],
    avgJobValueLow: data.avg_job_value_low,
    avgJobValueHigh: data.avg_job_value_high,
  };
}

export type UpdateBusinessTypeOverrideResult =
  | { status: "ok"; businessTypeOverride: string | null }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * Sets or clears the owner's manual business-type correction. `overrideId`
 * must be a real, currently-supported profile id (see BIZ_PROFILE_OPTIONS
 * in config/bizProfiles.ts) or null to clear the override and revert to
 * Google-category auto-detection — validated here so a bad id can never
 * reach the database's own check constraint as a confusing raw SQL error.
 */
export async function updateBusinessTypeOverride(
  businessId: string,
  overrideId: string | null
): Promise<UpdateBusinessTypeOverrideResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  if (overrideId !== null && !bizProfileById(overrideId)) {
    return { status: "error", message: `"${overrideId}" isn't a supported business type.` };
  }

  const { data, error } = await supabase
    .from("businesses")
    .update({ business_type_override: overrideId })
    .eq("id", businessId)
    .select("business_type_override")
    .single();

  if (error || !data) {
    return { status: "not_found" };
  }

  return { status: "ok", businessTypeOverride: data.business_type_override };
}
