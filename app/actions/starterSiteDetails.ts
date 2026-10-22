"use server";

// Saves the business details an owner confirmed or edited for their
// starter website (businesses.starter_site_details —
// supabase/starter-site-details.sql), as "provided by you". Website only:
// scoring never reads this column.

import { createClient } from "@/lib/supabase/server";
import { sanitizeDetailFields, type StarterSiteDetails } from "@/lib/starterSiteDetails";
import { logSaveFailure, saveFailureReason } from "@/lib/saveFailure";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SaveStarterSiteDetailsResult =
  | { status: "ok"; details: StarterSiteDetails }
  | { status: "invalid" }
  /** The column isn't there yet — supabase/starter-site-details.sql hasn't been run. */
  | { status: "not_enabled"; reason?: string }
  | { status: "unauthenticated" }
  /** `reason`: a short cause, shown in development only. */
  | { status: "error"; message: string; reason?: string };

function isMissingDetailsColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || /starter_site_details/.test(error.message ?? ""));
}

export async function saveStarterSiteDetailsWithClient(supabase: SupabaseClient, businessId: string, fields: unknown, now = new Date()): Promise<SaveStarterSiteDetailsResult> {
  const clean = sanitizeDetailFields(fields);
  if (!clean) return { status: "invalid" };
  const details: StarterSiteDetails = { ...clean, confirmedAt: now.toISOString() };
  const { data, error } = await supabase.from("businesses").update({ starter_site_details: details }).eq("id", businessId).select("id");
  if (error || !data || data.length === 0) {
    const reason = saveFailureReason(error, "starter_site_details", "supabase/starter-site-details.sql");
    logSaveFailure("saveStarterSiteDetails", reason, error);
    if (isMissingDetailsColumn(error)) return { status: "not_enabled", reason };
    return { status: "error", message: error?.message ?? "Business not found.", reason };
  }
  return { status: "ok", details };
}

export async function saveStarterSiteDetails(businessId: string, fields: unknown): Promise<SaveStarterSiteDetailsResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  return saveStarterSiteDetailsWithClient(supabase, businessId, fields);
}
