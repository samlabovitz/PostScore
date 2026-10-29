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
export type ApplyActionResult =
  | { status: "sent" | "pending_review"; changes: AttributeChange[]; undo: UndoableChange | null }
  | { status: "no_changes" }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: GbpEditErrorCode };
export type UndoActionResult = { status: "sent" | "pending_review" } | { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: GbpEditErrorCode };

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
  if (result.status === "error") return onError(g, result);
  if (result.status === "no_changes") return result;
  // Points still wait for Google: the step shows "Waiting for the next
  // check" until a scan sees the details on the public listing.
  if (result.changes.some((c) => c.after === true)) await markTaskDone(businessId, "completeness.customer_details").catch(() => null);
  revalidatePath(`/business/${businessId}`, "layout");
  return { status: result.status, changes: result.changes, undo: result.logged ? await g.s.attrs.getUndoableChange(store, businessId) : null };
}

/** "Yes, undo": puts the previous values back, if nothing changed since. */
export async function undoCustomerDetailsAction(businessId: string, batchId: string): Promise<UndoActionResult> {
  if (typeof batchId !== "string" || !batchId) return { status: "error", error: "undo_expired" };
  const g = await gate(businessId);
  if (!g.ok) return g.result;
  const result = await g.s.attrs.undoCustomerDetailsChange(g.target, batchId, g.s.attrs.supabaseChangeStore(g.s.admin));
  if (result.status === "error") return onError(g, { status: "error", error: result.error });
  revalidatePath(`/business/${businessId}`, "layout");
  return result;
}

/** For the page: the latest change the owner may still undo (a database
 * read through RLS — no Google call). Null on Free/Grow or before
 * supabase/gbp-changes.sql has been run. */
export async function getCustomerDetailsUndo(businessId: string): Promise<UndoableChange | null> {
  try {
    if (!isPremiumPlan(await getPlan())) return null;
    const { supabaseChangeStore, getUndoableChange } = await import("@/lib/gbpAttributes.server");
    return await getUndoableChange(supabaseChangeStore(createClient()), businessId);
  } catch {
    return null;
  }
}
