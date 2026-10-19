"use server";

// Saves the hours an owner enters for their starter website
// (businesses.starter_site_hours — supabase/hours.sql). Website only:
// scoring never reads this column.

import { createClient } from "@/lib/supabase/server";
import { isValidOwnerHours, sanitizeOwnerHours } from "@/lib/ownerHours";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SaveStarterSiteHoursResult =
  | { status: "ok" }
  | { status: "invalid" }
  /** The column isn't there yet — supabase/hours.sql hasn't been run. */
  | { status: "not_enabled" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/** A select/update on a column that doesn't exist yet. */
function isMissingHoursColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || /starter_site_hours/.test(error.message ?? ""));
}

export async function saveStarterSiteHoursWithClient(supabase: SupabaseClient, businessId: string, hours: unknown): Promise<SaveStarterSiteHoursResult> {
  // null clears them (back to Google's hours).
  const clean = hours === null ? null : sanitizeOwnerHours(hours);
  if (hours !== null && (!clean || !isValidOwnerHours(clean))) return { status: "invalid" };
  const { data, error } = await supabase.from("businesses").update({ starter_site_hours: clean }).eq("id", businessId).select("id");
  if (isMissingHoursColumn(error)) return { status: "not_enabled" };
  if (error) return { status: "error", message: error.message };
  if (!data || data.length === 0) return { status: "error", message: "Business not found." };
  return { status: "ok" };
}

export async function saveStarterSiteHours(businessId: string, hours: unknown): Promise<SaveStarterSiteHoursResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  return saveStarterSiteHoursWithClient(supabase, businessId, hours);
}
