"use server";

// The owner's own answers for "Customer details on your listing"
// (scoring v1.12.0): "No parking available" and "We take no payments on
// site". Owner-entered ("Added by you") — each removes that part from the
// check (lib/customerDetails.ts). Stored on the business's own row
// (supabase/scoring-v1-12-recency-details.sql); RLS keeps it to the owner.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CustomerDetailsOwnerPart = "parking" | "payment";

const COLUMN: Record<CustomerDetailsOwnerPart, string> = { parking: "owner_no_parking", payment: "owner_no_payment" };

export async function setCustomerDetailsOwnerAnswer(
  businessId: string,
  part: CustomerDetailsOwnerPart,
  notAvailable: boolean
): Promise<{ status: "ok" | "unauthenticated" | "not_enabled" | "error" }> {
  if (!(part in COLUMN)) return { status: "error" };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  const { data, error } = await supabase
    .from("businesses")
    .update({ [COLUMN[part]]: notAvailable === true })
    .eq("id", businessId)
    .select("id")
    .maybeSingle();
  // Before the SQL file has been run: say so, never pretend it saved.
  if (error) return error.code === "PGRST204" || error.code === "42703" ? { status: "not_enabled" } : { status: "error" };
  if (!data) return { status: "error" };
  // Our own scoring input changed: save the score now (a page load saves
  // only for a scoring update — Day 23 2d-4).
  await (await import("@/app/actions/scoring")).syncScoreSnapshotWithClient(supabase, businessId, "data_update");
  revalidatePath(`/business/${businessId}`, "layout");
  return { status: "ok" };
}
