"use server";

// "Yes, we've closed" → archive the business; "Restore" → bring it back.
// Owner-only (RLS). See lib/businessArchive.server.ts for what stops.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function setArchived(businessId: string, archived: boolean): Promise<{ status: "ok" | "unauthenticated" | "not_enabled" | "error" }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  const { data, error } = await supabase
    .from("businesses")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", businessId)
    .select("id")
    .maybeSingle();
  if (error) return error.code === "PGRST204" || error.code === "42703" ? { status: "not_enabled" } : { status: "error" };
  if (!data) return { status: "error" };
  revalidatePath(`/business/${businessId}`, "layout");
  return { status: "ok" };
}

export async function archiveBusiness(businessId: string) {
  return setArchived(businessId, true);
}

export async function restoreBusiness(businessId: string) {
  return setArchived(businessId, false);
}
