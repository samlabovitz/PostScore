"use server";

// Section 6 "Protection & changes" (Premium): "Check now", "Keep Google's
// version", "Change it back" after Google's own edit, and Undo on "Made
// from PostScore". The owner, plan, practice mode and live allow list
// (GOOGLE_WRITES_LIVE_PLACES) come from googleWriteContext. "Check now" and
// "Keep" only read Google / write our own table; "Change it back" and Undo
// write to Google through the normal safety flow, and off the live list are
// refused ("editing_off") — the tab shows the steps on Google instead.

import { revalidatePath } from "next/cache";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import type { FieldUndo } from "@/lib/gbpFieldWrite.server";
import { canChangeBack, type GoogleEditRow } from "@/lib/gbpGoogleEdits";

type GbpEditErrorCode = import("@/lib/gbpAttributes.server").GbpEditError;
type Blocked = { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: GbpEditErrorCode };

async function context(businessId: string, practiceOutcome: unknown = null) {
  const { googleWriteContext } = await import("@/lib/gbpWriteContext.server");
  const c = await googleWriteContext(businessId);
  if (c.ok && c.practice) {
    const practice = await import("@/lib/gbpProfilePractice.server");
    practice.setPracticeOutcome(businessId, practice.isPracticeOutcome(practiceOutcome) ? practiceOutcome : "accept");
  }
  return c;
}

async function refreshTab(businessId: string) {
  const { forgetRealListing } = await import("@/lib/gbpRealListing.server");
  forgetRealListing(businessId);
  revalidatePath(`/business/${businessId}/growth`);
}

export type CheckNowResult = { status: "ok"; open: GoogleEditRow[]; checkedAt: string } | { status: "too_soon"; checkedAt: string } | { status: "unavailable" } | { status: "failed" } | Blocked;

/** "Check now": Google's edits + a fresh listing read, at most once every 10 minutes. */
export async function checkGoogleEditsNow(businessId: string): Promise<CheckNowResult> {
  const c = await context(businessId);
  if (!c.ok) return c.result;
  const { checkGoogleEdits } = await import("@/lib/gbpGoogleEdits.server");
  // Always the real listing (a read): practice mode never hides Google's own edits.
  const r = await checkGoogleEdits(c.admin, businessId, { rateLimited: true });
  if (r.status === "failed") {
    if (r.error === "reconnect") await c.markReconnect();
    return { status: "failed" };
  }
  if (r.status === "ok") await refreshTab(businessId);
  return r;
}

export type KeepResult = { status: "ok" } | { status: "not_found" } | Blocked;

/** "Keep Google's version": nothing is sent to Google; the row closes. */
export async function keepGoogleVersion(businessId: string, editId: string): Promise<KeepResult> {
  const c = await context(businessId);
  if (!c.ok) return c.result;
  const { resolveGoogleEdit } = await import("@/lib/gbpGoogleEdits.server");
  // Google's edits are always the real ones (never practice rows).
  const row = await resolveGoogleEdit(c.admin, businessId, editId, "kept", false);
  if (!row) return { status: "not_found" };
  revalidatePath(`/business/${businessId}/growth`);
  return { status: "ok" };
}

/** The banner's "I know, that's right": Google's version kept for every
 * change it lists (nothing sent to Google). Never the name or address —
 * those are reviewed one by one. */
export async function keepAllGoogleVersions(businessId: string, editIds: string[]): Promise<{ status: "ok"; kept: number } | Blocked> {
  const c = await context(businessId);
  if (!c.ok) return c.result;
  const ge = await import("@/lib/gbpGoogleEdits.server");
  let kept = 0;
  for (const id of editIds.slice(0, 20)) {
    const row = await ge.openGoogleEdit(c.admin, businessId, id, false);
    if (!row || row.field === "title" || row.field === "address") continue;
    if (await ge.resolveGoogleEdit(c.admin, businessId, id, "kept", false)) kept++;
  }
  revalidatePath(`/business/${businessId}/growth`);
  return { status: "ok", kept };
}

/** "Change" on a kept one: open the choice again. */
export async function reopenGoogleEditAction(businessId: string, editId: string): Promise<KeepResult> {
  const c = await context(businessId);
  if (!c.ok) return c.result;
  const { reopenGoogleEdit } = await import("@/lib/gbpGoogleEdits.server");
  if (!(await reopenGoogleEdit(c.admin, businessId, editId, false))) return { status: "not_found" };
  revalidatePath(`/business/${businessId}/growth`);
  return { status: "ok" };
}

export type ChangeBackResult =
  | { status: "sent"; verified: boolean; undo: FieldUndo | null }
  | { status: "pending_review"; undo: FieldUndo | null }
  | { status: "no_change" }
  | { status: "editing_off" }
  | { status: "on_google" }
  | { status: "google_added" }
  | { status: "not_found" }
  | Blocked;

/** "Change it back": the owner's own value is sent again (approve → read back → 7-day undo). */
export async function changeGoogleEditBack(businessId: string, editId: string, practiceOutcome: unknown = null): Promise<ChangeBackResult> {
  const c = await context(businessId, practiceOutcome);
  if (!c.ok) return c.result;
  const ge = await import("@/lib/gbpGoogleEdits.server");
  const row = await ge.openGoogleEdit(c.admin, businessId, editId, false);
  if (!row) return { status: "not_found" };
  if (!canChangeBack(row.field)) return { status: "on_google" };
  // Google filled in a field the owner left empty: "changing it back" would
  // clear it on Google, so that's never sent from here.
  if (!row.owner_value) return { status: "google_added" };
  if (!c.canEdit) return { status: "editing_off" };
  const [write, attrs, quota] = await Promise.all([import("@/lib/gbpFieldWrite.server"), import("@/lib/gbpAttributes.server"), import("@/lib/gbpQuota")]);
  const counter = { calls: 0 };
  const owner = await ge.readOwnerValue(quota.gbpFetch(counter, c.fetchImpl), c.target.accessToken, c.target.locationName, row.field);
  quota.logGbpCalls("google-revert-read", counter);
  if (!owner.ok) {
    if (owner.error === "reconnect") await c.markReconnect();
    return { status: "error", error: owner.error as GbpEditErrorCode };
  }
  const spec = ge.REVERT_SPECS[row.field] as import("@/lib/gbpFieldWrite.server").FieldSpec<unknown>;
  const store = attrs.supabaseChangeStore(c.admin);
  const r = await write.applyField(c.target, spec, () => owner.value, store, { fetchImpl: c.fetchImpl, practice: c.practice });
  if (r.status === "error") {
    if (r.error === "reconnect") await c.markReconnect();
    return { status: "error", error: r.error };
  }
  // Sent (or Google already shows the owner's value): the row closes — only
  // for a real write; practice mode's fake changed nothing on Google.
  if (!c.practice) await ge.resolveGoogleEdit(c.admin, businessId, editId, "changed_back", false);
  await refreshTab(businessId);
  const undo = r.status === "no_change" ? null : await write.getFieldUndo(store, spec, businessId, c.target.locationName, c.practice).catch(() => null);
  if (r.status === "no_change") return { status: "no_change" };
  if (r.status === "pending_review") return { status: "pending_review", undo };
  return { status: "sent", verified: r.verified, undo };
}

export type UndoMadeResult = { status: "ok" } | { status: "failed" } | { status: "editing_off" } | { status: "not_found" } | Blocked;

const UNDONE = new Set(["sent", "pending_review", "no_change", "ok", "undone", "updated"]);

/** Undo on "Made from PostScore": the change's own undo, by its kind. */
export async function undoMadeChange(businessId: string, batchId: string, practiceOutcome: unknown = null): Promise<UndoMadeResult> {
  const c = await context(businessId, practiceOutcome);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  const { data } = await c.admin.from("gbp_changes").select("kind, field").eq("business_id", businessId).eq("batch_id", batchId).is("undo_of", null).limit(1).maybeSingle();
  const row = data as { kind: string; field: string } | null;
  if (!row) return { status: "not_found" };
  const k = row.kind.replace(/_practice$/, "");
  const outcome = c.practice ? practiceOutcome : null;
  let r: { status: string };
  if (k === "profile_info" && (row.field === "hours" || row.field === "phone" || row.field === "description")) r = await (await import("@/app/actions/gbpProfileEdits")).undoProfileEditAction(businessId, row.field, batchId, outcome);
  else if (k === "attributes") r = await (await import("@/app/actions/gbpCustomerDetails")).undoCustomerDetailsAction(businessId, batchId, outcome);
  else if (k === "website_uri") r = await (await import("@/app/actions/gbpWebsiteLink")).undoWebsiteLinkAction(businessId, batchId, outcome);
  else if (k === "order_link") r = await (await import("@/app/actions/gbpOrderLink")).undoOrderLinkAction(businessId, batchId, outcome);
  else if (k === "special_hours") r = await (await import("@/app/actions/gbpListingFields")).undoHolidayHours(businessId, batchId, outcome);
  else if (k === "services") r = await (await import("@/app/actions/gbpListingFields")).undoServices(businessId, batchId, outcome);
  else if (k === "photos") r = await (await import("@/app/actions/gbpPhotos")).undoPhotosAction(businessId, batchId);
  else if (k === "google_revert") {
    const [write, attrs, ge] = await Promise.all([import("@/lib/gbpFieldWrite.server"), import("@/lib/gbpAttributes.server"), import("@/lib/gbpGoogleEdits.server")]);
    const field = row.field === "phoneNumbers" ? "phone" : row.field === "websiteUri" ? "website" : "hours";
    r = await write.undoField(c.target, ge.REVERT_SPECS[field] as import("@/lib/gbpFieldWrite.server").FieldSpec<unknown>, batchId, attrs.supabaseChangeStore(c.admin), { fetchImpl: c.fetchImpl, practice: c.practice });
  } else return { status: "not_found" };
  await refreshTab(businessId);
  return UNDONE.has(r.status) ? { status: "ok" } : { status: "failed" };
}
