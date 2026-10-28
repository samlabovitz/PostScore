// Server: whether the owner archived a business ("Yes, we've closed" —
// supabase/business-archive.sql). Archived businesses aren't re-scanned,
// reported on or answered by PostAI. Before the SQL file is run nothing is
// archived.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function isBusinessArchived(supabase: SupabaseClient, businessId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("businesses").select("archived_at").eq("id", businessId).maybeSingle();
    return !error && !!data && typeof (data as { archived_at?: unknown }).archived_at === "string";
  } catch {
    return false;
  }
}
