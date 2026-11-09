"use server";

// Premium "Update on Google" for customer details (docs/gbp-actions-plan.md,
// Step 1). Every action checks, on the server: the signed-in owner (RLS),
// Premium or Multi, not archived, Google connected with a matched
// location. Only "Approve and update Google" and "Yes, undo" write to
// Google — opening the panel only reads.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/premium";
import { isPremiumPlan } from "@/lib/plan";
import { markTaskDone } from "@/app/actions/actionPlan";
import { businessRowToScoringInput, type BusinessScoringRow } from "@/lib/scoring";
import type { AttrValue, AttributeChange, CustomerDetailsEditorRow, UndoableChange } from "@/lib/gbpAttributes";

/** Why the panel can't be used (or what went wrong), for plain-words copy
 * (dashboard.gbpEdit.error.*). */
export type GbpEditBlock = import("@/lib/gbpEditGate.server").GbpEditBlock;
type GbpEditErrorCode = import("@/lib/gbpAttributes.server").GbpEditError;

/** The owner's own "doesn't apply" answers (lib/customerDetails.ts):
 * which parts they may remove, and which they have. */
export interface CustomerDetailsOwnerState {
  canRemove: Array<"parking" | "payment">;
  removed: Array<"parking" | "payment">;
}
export type LoadEditorActionResult =
  | { status: "ok"; rows: CustomerDetailsEditorRow[]; owner: CustomerDetailsOwnerState }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: GbpEditErrorCode };
/** `mapsUri`: Google's own link to the live listing (metadata.mapsUri),
 * for "View on Google" — on success, failure and pending alike. */
export type ApplyActionResult =
  | { status: "sent" | "pending_review"; changes: AttributeChange[]; undo: UndoableChange | null; mapsUri?: string | null }
  | { status: "no_changes" }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: GbpEditErrorCode; mapsUri?: string | null };
/** "sent" = read back from Google and verified, or `pending`: sent while
 * Google is reviewing changes to the profile. An error may name the fields
 * that didn't revert (and whether Google is still reviewing). */
export type UndoActionResult =
  | { status: "sent"; pending?: boolean; mapsUri?: string | null }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: GbpEditErrorCode; fields?: string[]; pending?: boolean; mapsUri?: string | null };

/** Google's link to the live listing — a read only. */
async function mapsUriFor(g: Extract<Gate, { ok: true }>): Promise<string | null> {
  const { readGbpMapsUri } = await import("@/lib/gbpMapsUri.server");
  return readGbpMapsUri(g.target);
}

async function server() {
  const [tokens, attrs, admin] = await Promise.all([import("@/lib/gbpTokens.server"), import("@/lib/gbpAttributes.server"), import("@/lib/supabase/admin")]);
  return { tokens, attrs, admin: admin.createAdminClient() };
}

type Gate =
  | { ok: true; target: import("@/lib/gbpAttributes.server").GbpEditTarget; s: Awaited<ReturnType<typeof server>> }
  | { ok: false; result: { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: GbpEditErrorCode } };

/** Premium only (lib/gbpEditGate.server.ts). */
async function gate(businessId: string): Promise<Gate> {
  const { gbpEditGate } = await import("@/lib/gbpEditGate.server");
  const g = await gbpEditGate(businessId, { requirePremium: true });
  if (!g.ok) return g;
  return { ok: true, target: g.target, s: { ...(await server()), admin: g.admin } };
}

/** Google rejected the stored token: show "Reconnect Google". */
async function onError<T extends { status: string; error?: GbpEditErrorCode }>(g: Extract<Gate, { ok: true }>, result: T): Promise<T> {
  if (result.status === "error" && result.error === "reconnect") await g.s.tokens.markGbpReconnect(g.s.admin, g.target.businessId);
  return result;
}

/** Opening the panel: Google's offered accessibility / payment / parking
 * attributes and their current values. Reads only. */
export async function loadCustomerDetailsEditorAction(businessId: string): Promise<LoadEditorActionResult> {
  const g = await gate(businessId);
  if (!g.ok) return g.result;
  const loaded = await g.s.attrs.loadCustomerDetailsEditor(g.target);
  if (loaded.status !== "ok") return onError(g, loaded);
  return { ...loaded, owner: await ownerState(businessId) };
}

/** Which parts the owner may say don't apply (parking, payment), from the
 * same rule scoring uses. Empty when the row can't be read. */
async function ownerState(businessId: string): Promise<CustomerDetailsOwnerState> {
  const { data } = await createClient()
    .from("businesses")
    .select("name, category, primary_type, categories, business_type_override, pure_service_area_business, owner_no_parking, owner_no_payment")
    .eq("id", businessId)
    .maybeSingle();
  if (!data) return { canRemove: [], removed: [] };
  const rule = businessRowToScoringInput(data as unknown as BusinessScoringRow).customerDetailsRule;
  const owned = (parts: string[] | undefined) => (parts ?? []).filter((p): p is "parking" | "payment" => p === "parking" || p === "payment");
  return { canRemove: owned(rule?.ownerCanRemove), removed: owned(rule?.ownerRemoved) };
}

/** "Approve and update Google": the owner's picks, by attribute ID. */
export async function applyCustomerDetailsAction(businessId: string, picks: Record<string, AttrValue>): Promise<ApplyActionResult> {
  if (!picks || typeof picks !== "object") return { status: "error", error: "changed" };
  const g = await gate(businessId);
  if (!g.ok) return g.result;
  const store = g.s.attrs.supabaseChangeStore(g.s.admin);
  const result = await g.s.attrs.applyCustomerDetailsChange(g.target, picks, store);
  if (result.status === "error") return onError(g, { ...result, mapsUri: await mapsUriFor(g) });
  if (result.status === "no_changes") return result;
  // Points still wait for Google: the step shows "Waiting for the next
  // check" until a scan sees the details on the public listing.
  if (result.changes.some((c) => c.after === true)) await markTaskDone(businessId, "completeness.customer_details").catch(() => null);
  revalidatePath(`/business/${businessId}`, "layout");
  return { status: result.status, changes: result.changes, undo: result.logged ? await g.s.attrs.getUndoableChange(store, businessId, g.target.locationName) : null, mapsUri: await mapsUriFor(g) };
}

/** "Yes, undo": puts the previous values back, if nothing changed since. */
export async function undoCustomerDetailsAction(businessId: string, batchId: string): Promise<UndoActionResult> {
  if (typeof batchId !== "string" || !batchId) return { status: "error", error: "undo_expired" };
  const g = await gate(businessId);
  if (!g.ok) return g.result;
  const result = await g.s.attrs.undoCustomerDetailsChange(g.target, batchId, g.s.attrs.supabaseChangeStore(g.s.admin));
  if (result.status === "error")
    return onError(g, { status: "error", error: result.error, ...(result.fields ? { fields: result.fields } : {}), ...(result.pending ? { pending: true } : {}), mapsUri: await mapsUriFor(g) });
  revalidatePath(`/business/${businessId}`, "layout");
  return { ...result, mapsUri: await mapsUriFor(g) };
}

/** For the page: the latest change the owner may still undo (a database
 * read through RLS — no Google call). Null on Free/Grow or before
 * supabase/gbp-changes.sql has been run. */
export async function getCustomerDetailsUndo(businessId: string): Promise<UndoableChange | null> {
  try {
    if (!isPremiumPlan(await getPlan())) return null;
    const db = createClient();
    // Only changes made on the location connected now (RLS: the owner's own row).
    const { data: connection } = await db.from("gbp_connections").select("google_location_id").eq("business_id", businessId).maybeSingle();
    const locationName = (connection as { google_location_id?: string | null } | null)?.google_location_id;
    if (!locationName) return null;
    const { supabaseChangeStore, getUndoableChange } = await import("@/lib/gbpAttributes.server");
    return await getUndoableChange(supabaseChangeStore(db), businessId, locationName);
  } catch {
    return null;
  }
}
