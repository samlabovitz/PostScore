"use server";

// The business facts a coupon / referral card may print — read from the
// business's own row (RLS-scoped), never typed by the browser: name,
// address, hours, and the real links a card's QR may open.

import { createClient } from "@/lib/supabase/server";
import { formatOpeningHours } from "@/lib/hours";
import { normalizeLocale, type Locale } from "@/lib/i18n";
import { realWebsite } from "@/lib/printStudio/website";
import { iconForBusiness } from "@/lib/printStudio/icons";
import type { CardBusiness } from "@/lib/printStudio/design";
import type { OpeningHoursPeriod } from "@/lib/google/places";

export type GetPrintStudioDataResult =
  | { status: "ok"; business: CardBusiness; locale: Locale }
  | { status: "unauthenticated" }
  | { status: "not_found" };

export async function getPrintStudioData(businessId: string): Promise<GetPrintStudioDataResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };

  const { data, error } = await supabase
    .from("businesses")
    .select("name, address, place_id, google_maps_uri, website, verified_website_url, opening_hours, opening_hours_periods, language, category, primary_type, categories")
    .eq("id", businessId)
    .single();
  if (error || !data) return { status: "not_found" };

  const locale = normalizeLocale(data.language);
  const hours = formatOpeningHours((data.opening_hours_periods as OpeningHoursPeriod[] | null) ?? null, locale) ?? (data.opening_hours as string[] | null) ?? null;
  return {
    status: "ok",
    locale,
    business: {
      businessName: data.name,
      placeId: data.place_id,
      googleMapsUri: data.google_maps_uri,
      website: realWebsite(data),
      address: data.address,
      hours: hours && hours.length ? hours : null,
      icon: iconForBusiness(data.category, data.primary_type, data.categories as string[] | null, data.name),
    },
  };
}
