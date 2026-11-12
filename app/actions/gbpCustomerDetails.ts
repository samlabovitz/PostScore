"use server";

// Premium "Update on Google" for customer details (docs/gbp-actions-plan.md,
// Step 1). Every action checks, on the server: the signed-in owner (RLS),
// Premium or Multi, not archived, Google connected with a matched
// location (lib/gbpWriteContext.server.ts). Only Approve and "Yes, undo"
// write to Google — opening the panel only reads.
//
// Two test switches (lib/gbpReviewPractice.ts), as for every Google write:
// - practice mode (REVIEW_REPLIES_PRACTICE=1, never in production): the
//   same code against a fake Google with a sample listing — no connection
//   needed, nothing ever sent;
// - otherwise the real values load read-only, and Approve / Undo are
//   refused here ("editing_off", nothing sent) unless the business is on
//   GOOGLE_WRITES_LIVE_PLACES (default: none).

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
  /** `undo`: the latest change the owner may still undo (from gbp_changes, so it's there after a reload). */
  | { status: "ok"; rows: CustomerDetailsEditorRow[]; owner: CustomerDetailsOwnerState; practice: boolean; canEdit: boolean; undo: UndoableChange | null }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: GbpEditErrorCode };
/** `mapsUri`: Google's own link to the live listing (metadata.mapsUri),
 * for "View on Google" — on success, failure and pending alike (never in practice mode). */
export type ApplyActionResult =
  /** `verified` false: Google took it but doesn't show every value yet — a neutral wait. */
  | { status: "sent"; verified: boolean; changes: AttributeChange[]; undo: UndoableChange | null; mapsUri?: string | null }
  | { status: "pending_review"; changes: AttributeChange[]; undo: UndoableChange | null; mapsUri?: string | null }
  | { status: "no_changes" }
  /** Not practice mode, and this business isn't on GOOGLE_WRITES_LIVE_PLACES. Nothing sent. */
  | { status: "editing_off" }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: GbpEditErrorCode; mapsUri?: string | null };
/** "sent" = read back from Google and verified, or `pending`: sent while
 * Google is reviewing changes to the profile. An error may name the fields
 * that didn't revert (and whether Google is still reviewing). */
export type UndoActionResult =
  | { status: "sent"; pending?: boolean; mapsUri?: string | null }
  | { status: "editing_off" }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: GbpEditErrorCode; fields?: string[]; pending?: boolean; mapsUri?: string | null };

type Context = import("@/lib/gbpWriteContext.server").GoogleWriteContext;

/** Google's link to the live listing — a read only. None in practice mode. */
async function mapsUriFor(c: Context): Promise<string | null> {
  if (c.practice) return null;
  const { readGbpMapsUri } = await import("@/lib/gbpMapsUri.server");
  return readGbpMapsUri(c.target);
}

async function context(businessId: string) {
  const { googleWriteContext } = await import("@/lib/gbpWriteContext.server");
  return googleWriteContext(businessId);
}

const attrs = () => import("@/lib/gbpAttributes.server");

/** Google rejected the stored token: show "Reconnect Google". */
async function onError<T extends { status: string; error?: GbpEditErrorCode }>(c: Context, result: T): Promise<T> {
  if (result.status === "error" && result.error === "reconnect") await c.markReconnect();
  return result;
}

/** Practice mode: what the fake Google does with this Approve (the panel's choice). */
async function setOutcome(c: Context, outcome: unknown) {
  if (!c.practice) return;
  const practice = await import("@/lib/gbpProfilePractice.server");
  practice.setPracticeOutcome(c.target.businessId, practice.isPracticeOutcome(outcome) ? outcome : "accept");
}

/** Opening the panel: Google's offered accessibility / payment / parking
 * attributes and their current values. Reads only. */
export async function loadCustomerDetailsEditorAction(businessId: string): Promise<LoadEditorActionResult> {
  const c = await context(businessId);
  if (!c.ok) return c.result;
  const a = await attrs();
  const loaded = await a.loadCustomerDetailsEditor(c.target, c.fetchImpl);
  if (loaded.status !== "ok") return onError(c, loaded);
  const undo = await a.getUndoableChange(a.supabaseChangeStore(c.admin), businessId, c.target.locationName, Date.now(), c.practice).catch(() => null);
  return { ...loaded, owner: await ownerState(businessId), practice: c.practice, canEdit: c.canEdit, undo };
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

/** Approve (Beta): the owner's picks, by attribute ID. */
export async function applyCustomerDetailsAction(businessId: string, picks: Record<string, AttrValue>, practiceOutcome: unknown = null): Promise<ApplyActionResult> {
  if (!picks || typeof picks !== "object") return { status: "error", error: "changed" };
  const c = await context(businessId);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  await setOutcome(c, practiceOutcome);
  const a = await attrs();
  const store = a.supabaseChangeStore(c.admin);
  const result = await a.applyCustomerDetailsChange(c.target, picks, store, { fetchImpl: c.fetchImpl, practice: c.practice });
  if (result.status === "error") return onError(c, { ...result, mapsUri: await mapsUriFor(c) });
  if (result.status === "no_changes") return result;
  const undo = await a.getUndoableChange(store, businessId, c.target.locationName, Date.now(), c.practice);
  if (c.practice) return result.status === "sent" ? { status: "sent", verified: result.verified, changes: result.changes, undo } : { status: "pending_review", changes: result.changes, undo };
  // Points still wait for Google: the step shows "Waiting for the next
  // check" until a scan sees the details on the public listing.
  // Service options (takeout / delivery / curbside) are information only — no task.
  if (result.changes.some((change) => change.after === true && change.part !== "service")) await markTaskDone(businessId, "completeness.customer_details").catch(() => null);
  revalidatePath(`/business/${businessId}`, "layout");
  const mapsUri = await mapsUriFor(c);
  return result.status === "sent" ? { status: "sent", verified: result.verified, changes: result.changes, undo, mapsUri } : { status: "pending_review", changes: result.changes, undo, mapsUri };
}

/** "Yes, undo": puts the previous values back, if nothing changed since. */
export async function undoCustomerDetailsAction(businessId: string, batchId: string, practiceOutcome: unknown = null): Promise<UndoActionResult> {
  if (typeof batchId !== "string" || !batchId) return { status: "error", error: "undo_expired" };
  const c = await context(businessId);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  await setOutcome(c, practiceOutcome);
  const a = await attrs();
  const result = await a.undoCustomerDetailsChange(c.target, batchId, a.supabaseChangeStore(c.admin), { fetchImpl: c.fetchImpl, practice: c.practice });
  if (result.status === "error")
    return onError(c, { status: "error", error: result.error, ...(result.fields ? { fields: result.fields } : {}), ...(result.pending ? { pending: true } : {}), mapsUri: await mapsUriFor(c) });
  if (!c.practice) revalidatePath(`/business/${businessId}`, "layout");
  return { ...result, mapsUri: await mapsUriFor(c) };
}

/** For the page: the latest change the owner may still undo (a database
 * read through RLS — no Google call). Null on Free/Grow or before
 * supabase/gbp-changes.sql has been run. */
export async function getCustomerDetailsUndo(businessId: string): Promise<UndoableChange | null> {
  try {
    if (!isPremiumPlan(await getPlan())) return null;
    const db = createClient();
    const { reviewRepliesPracticeOn } = await import("@/lib/gbpReviewPractice");
    const practice = reviewRepliesPracticeOn();
    // Only changes made on the location connected now (RLS: the owner's own row) — or practice mode's sample listing.
    let locationName: string | null | undefined;
    if (practice) locationName = (await import("@/lib/gbpProfilePractice.server")).PRACTICE_PROFILE_LOCATION;
    else {
      const { data: connection } = await db.from("gbp_connections").select("google_location_id").eq("business_id", businessId).maybeSingle();
      locationName = (connection as { google_location_id?: string | null } | null)?.google_location_id;
    }
    if (!locationName) return null;
    const { supabaseChangeStore, getUndoableChange } = await attrs();
    return await getUndoableChange(supabaseChangeStore(db), businessId, locationName, Date.now(), practice);
  } catch {
    return null;
  }
}
