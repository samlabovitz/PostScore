"use server";

// The business facts a coupon / referral card may print — read from the
// business's own row (RLS-scoped), never typed by the browser: name,
// address, hours, and the real links a card's QR may open. Day 23 2d-3:
// once the owner confirmed their details (lib/ownerDetails.ts) the card
// prints those; until then, the listing as Google shows it now.

import { createClient } from "@/lib/supabase/server";
import { formatOpeningHours } from "@/lib/hours";
import { normalizeLocale, type Locale } from "@/lib/i18n";
import { realWebsite } from "@/lib/printStudio/website";
import { withOwnerWebsite } from "@/lib/ownerWebsite.server";
import { iconForBusiness } from "@/lib/printStudio/icons";
import type { CardBusiness } from "@/lib/printStudio/design";
import type { OpeningHoursPeriod } from "@/lib/google/places";
import { loadOwnerDetails, withOwnerDetailsFor } from "@/lib/ownerDetails.server";
import { ownerHoursLines } from "@/lib/ownerDetails";
import { withLiveListingFor } from "@/lib/ownerListing.server";

export type GetPrintStudioDataResult =
  | { status: "ok"; business: CardBusiness; locale: Locale }
  | { status: "unauthenticated" }
  | { status: "not_found" };

/** `live: false` (Free's locked-tab showroom): no Google call — the
 * owner's confirmed details, else no hours or Maps link. */
export async function getPrintStudioData(businessId: string, options: { live?: boolean } = {}): Promise<GetPrintStudioDataResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };

  const { data, error } = await supabase
    .from("businesses")
    .select("name, address, place_id, google_maps_uri, website, verified_website_url, website_analysis_json, opening_hours, opening_hours_periods, language, category, primary_type, categories, listing_mode")
    .eq("id", businessId)
    .single();
  if (error || !data) return { status: "not_found" };

  const locale = normalizeLocale(data.language);
  const [owner, live] = await Promise.all([loadOwnerDetails(supabase, businessId), options.live === false ? Promise.resolve({ ...data, opening_hours: null, opening_hours_periods: null, google_maps_uri: null }) : withLiveListingFor(supabase, businessId, data)]);
  const ownerDetails = owner?.details ?? null;
  // Before the owner confirms: the listing's name and address as read now.
  const shown = await withOwnerDetailsFor(supabase, businessId, { name: data.name as string | null, address: data.address as string | null }, { live: options.live !== false });
  // The owner's own hours, formatted in their language (lib/ownerDetails.ts).
  const hours = ownerDetails
    ? ownerHoursLines(ownerDetails.hours, locale)
    : formatOpeningHours((live.opening_hours_periods as OpeningHoursPeriod[] | null) ?? null, locale) ?? (live.opening_hours as string[] | null) ?? null;
  return {
    status: "ok",
    locale,
    business: {
      businessName: shown.name,
      placeId: data.place_id,
      googleMapsUri: live.google_maps_uri ?? null,
      // The site PostScore shows, with the owner's confirmed one (null before supabase/owner-website.sql).
      website: realWebsite(await withOwnerWebsite(supabase, businessId, data)),
      address: shown.address,
      hours: hours && hours.length ? hours : null,
      icon: iconForBusiness(data.category, data.primary_type, data.categories as string[] | null, data.name),
    },
  };
}
