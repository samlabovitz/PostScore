// Server-only. Reads the website the owner confirmed with "Wrong site?"
// (supabase/owner-website.sql). Read on its own, never inside a page's
// main select, so every page keeps working before the SQL is run (null).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OwnerWebsite {
  url: string | null;
  confirmedAt: string | null;
  /** What "Undo" puts back (null = no owner choice before). */
  previousUrl: string | null;
  previousAt: string | null;
}

/** The owner's confirmed site for this business, or null when there's
 * none or the columns aren't there yet. */
export async function readOwnerWebsite(supabase: SupabaseClient, businessId: string): Promise<OwnerWebsite | null> {
  try {
    const { data, error } = await supabase
      .from("businesses")
      .select("owner_website_url, owner_website_confirmed_at, owner_website_previous_url, owner_website_previous_at")
      .eq("id", businessId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { owner_website_url: string | null; owner_website_confirmed_at: string | null; owner_website_previous_url: string | null; owner_website_previous_at: string | null };
    return { url: row.owner_website_url?.trim() || null, confirmedAt: row.owner_website_confirmed_at, previousUrl: row.owner_website_previous_url?.trim() || null, previousAt: row.owner_website_previous_at };
  } catch {
    return null;
  }
}

/** `row` plus owner_website_url, for lib/businessWebsite.ts. */
export async function withOwnerWebsite<T extends object>(supabase: SupabaseClient, businessId: string, row: T): Promise<T & { owner_website_url: string | null }> {
  const owner = await readOwnerWebsite(supabase, businessId);
  return { ...row, owner_website_url: owner?.url ?? null };
}
