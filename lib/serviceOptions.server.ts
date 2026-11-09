// Server-only. Reads a business's saved Google service options
// (supabase/service-options.sql) on their own, so a page keeps working
// before the SQL is run (null).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceOptions } from "@/lib/google/places";
import { parseServiceOptions } from "@/lib/serviceOptions";

/** null = never fetched, or the column isn't there yet. */
export async function readServiceOptions(supabase: SupabaseClient, businessId: string): Promise<ServiceOptions | null> {
  try {
    const { data, error } = await supabase.from("businesses").select("google_service_options").eq("id", businessId).maybeSingle();
    if (error || !data) return null;
    return parseServiceOptions((data as { google_service_options?: unknown }).google_service_options);
  } catch {
    return null;
  }
}
