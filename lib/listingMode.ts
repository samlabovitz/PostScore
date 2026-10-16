// Day 2b: a business is either backed by a Google listing (the normal
// case) or "website only" — the owner has no Google Business Profile, so
// only the website is scored, clearly labeled, and never as a PostScore.
// Stored in businesses.listing_mode (see ~/Desktop/day2b-constraint.sql /
// supabase/schema.sql). Until that column exists, every business reads
// as "google", so nothing changes before the database update.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ListingMode = "google" | "website_only";

export function parseListingMode(value: unknown): ListingMode {
  return value === "website_only" ? "website_only" : "google";
}

/** True for Postgres "column does not exist" — the database update
 * hasn't been run yet. */
export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === "42703" || (/listing_mode/.test(error.message ?? "") && /does not exist|schema cache/i.test(error.message ?? "")));
}

export async function getListingMode(supabase: SupabaseClient, businessId: string): Promise<ListingMode> {
  const { data, error } = await supabase.from("businesses").select("listing_mode").eq("id", businessId).maybeSingle();
  if (error || !data) return "google";
  return parseListingMode((data as { listing_mode?: unknown }).listing_mode);
}
