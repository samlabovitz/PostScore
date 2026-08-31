"use server";

import { createClient } from "@/lib/supabase/server";

export interface WebsitePageData {
  businessName: string | null;
  address: string | null;
  category: string | null;
  primaryType: string | null;
  phone: string | null;
  openingHours: string[] | null;
  rating: number | null;
  reviewCount: number | null;
  /** Real Google-listed website, if any — used only to detect whether
   * this business already has one; never overwritten by this page. */
  website: string | null;
  googleMapsUri: string | null;
}

export type GetWebsitePageDataResult =
  | { status: "ok"; data: WebsitePageData }
  | { status: "not_found" }
  | { status: "unauthenticated" };

/**
 * A dedicated, RLS-scoped fetch for the Website page — the starter
 * site generator needs several real fields getBusinessSummary()
 * deliberately doesn't select (it stays minimal for pages that don't
 * need them). Never writes to the database: generating or downloading
 * a starter site here has no effect on the saved business row or on
 * scoring — see StarterSiteBuilder's own doc comment for why.
 */
export async function getWebsitePageData(businessId: string): Promise<GetWebsitePageDataResult> {
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
      "name, address, category, primary_type, phone, opening_hours, rating, review_count, website, google_maps_uri"
    )
    .eq("id", businessId)
    .single();

  if (error || !data) {
    return { status: "not_found" };
  }

  return {
    status: "ok",
    data: {
      businessName: data.name,
      address: data.address,
      category: data.category,
      primaryType: data.primary_type,
      phone: data.phone,
      openingHours: data.opening_hours,
      rating: data.rating,
      reviewCount: data.review_count,
      website: data.website,
      googleMapsUri: data.google_maps_uri,
    },
  };
}
