// Server-only. Premium "Edit on Google": the hours, phone and description
// on the owner's OWN connected location — read live (Business Information
// API v1, never stored beyond what scans already save), and changed only
// after the owner clicks Approve (app/actions/gbpProfileEdits.ts). Every
// call goes through gbpFetch (lib/gbpQuota.ts).
//
// An edit, in order:
// 1. the gbp_changes log must exist, the approval limits allow it
//    (approvalAllowed: one a minute, a daily cap), and the edit log exists;
// 2. read the field from Google — the "before" is Google's, never the browser's;
// 3. save before → after in gbp_changes as "sending" BEFORE anything is
//    sent, so the undo always has the previous value;
// 4. ONE locations.patch with an updateMask for that field only;
// 5. locations.getGoogleUpdated: Google holding it for review
//    (pendingMask) is "pending_review" — a neutral wait, not an error;
// 6. read it back: "Updated on Google ✓" only when Google shows it.
// The gbp_changes row then says sent / pending_review / failed, and the
// edit log (gbp_profile_edit_log: who, when, which field, outcome — never
// a value) gets one row. Nothing here touches scores or tasks: only a
// later scan confirms the fix and marks its recommendation done.
import "server-only";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { approvalAllowed, latestUndoable, type GbpChangeRow } from "@/lib/gbpAttributes";
import { call, supabaseChangeStore, type GbpEditError, type GoogleCall } from "@/lib/gbpAttributes.server";
import {
  PROFILE_CHANGE_KIND,
  PROFILE_CHANGE_KIND_PRACTICE,
  PROFILE_FIELD_MASK,
  readStoredValue,
  sameProfileValue,
  storeValue,
  weekFromGoogle,
  weekToGoogle,
  type GooglePeriod,
  type ProfileField,
  type ProfileValue,
} from "@/lib/gbpProfileEdits";

const BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const UNDO_DAYS = 7;
const MISSING = new Set(["PGRST204", "PGRST205", "42703", "42P01"]);
const READ_MASK = "regularHours,phoneNumbers,profile";

export interface ProfileTarget {
  businessId: string;
  userId: string;
  /** "locations/…" */
  locationName: string;
  accessToken: string;
}

interface RawLocation {
  regularHours?: { periods?: GooglePeriod[] };
  phoneNumbers?: { primaryPhone?: string; additionalPhones?: string[] };
  profile?: { description?: string };
}

export interface LiveProfile {
  hours: ProfileValue & { field: "hours" };
  phone: ProfileValue & { field: "phone" };
  description: ProfileValue & { field: "description" };
  /** Fields Google is still reviewing (getGoogleUpdated pendingMask). */
  pending: ProfileField[];
}

function valueOf(field: ProfileField, loc: RawLocation): ProfileValue {
  if (field === "hours") return { field, value: weekFromGoogle(loc.regularHours?.periods) };
  if (field === "phone") return { field, value: loc.phoneNumbers?.primaryPhone?.trim() || null };
  return { field, value: loc.profile?.description?.trim() || null };
}

function pendingFields(pendingMask: string | undefined): ProfileField[] {
  const masks = (pendingMask ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return (Object.keys(PROFILE_FIELD_MASK) as ProfileField[]).filter((f) => masks.some((m) => m === PROFILE_FIELD_MASK[f] || m.startsWith(`${PROFILE_FIELD_MASK[f]}.`)));
}

async function readLocation(f: typeof fetch, target: ProfileTarget): Promise<GoogleCall<RawLocation>> {
  const url = new URL(`${BASE}/${target.locationName}`);
  url.searchParams.set("readMask", READ_MASK);
  return call<RawLocation>(f, target.accessToken, url.toString());
}

/** locations.getGoogleUpdated: which fields Google is still reviewing. A failed read is "don't know", never "pending". */
async function readPending(f: typeof fetch, target: ProfileTarget): Promise<ProfileField[]> {
  const url = new URL(`${BASE}/${target.locationName}:getGoogleUpdated`);
  url.searchParams.set("readMask", READ_MASK);
  const res = await call<{ pendingMask?: string }>(f, target.accessToken, url.toString());
  return res.ok ? pendingFields(res.data.pendingMask) : [];
}

/** What Google has now for the three fields, and what it's still reviewing. Reads only. */
export async function readLiveProfile(target: ProfileTarget, fetchImpl: typeof fetch = fetch): Promise<GoogleCall<LiveProfile>> {
  const counter = { calls: 0 };
  const f = gbpFetch(counter, fetchImpl);
  try {
    const loc = await readLocation(f, target);
    if (!loc.ok) return loc;
    return {
      ok: true,
      data: {
        hours: valueOf("hours", loc.data) as LiveProfile["hours"],
        phone: valueOf("phone", loc.data) as LiveProfile["phone"],
        description: valueOf("description", loc.data) as LiveProfile["description"],
        pending: await readPending(f, target),
      },
    };
  } finally {
    logGbpCalls("profile-read", counter);
  }
}

function patchBody(v: ProfileValue, current: RawLocation): Record<string, unknown> {
  if (v.field === "hours") return { regularHours: { periods: v.value ? weekToGoogle(v.value) : [] } };
  // The whole phoneNumbers: the additional phones exactly as Google has them.
  if (v.field === "phone") return { phoneNumbers: { primaryPhone: v.value ?? "", ...(current.phoneNumbers?.additionalPhones?.length ? { additionalPhones: current.phoneNumbers.additionalPhones } : {}) } };
  return { profile: { description: v.value ?? "" } };
}

async function patchField(f: typeof fetch, target: ProfileTarget, v: ProfileValue, current: RawLocation): Promise<GoogleCall<unknown>> {
  const url = new URL(`${BASE}/${target.locationName}`);
  url.searchParams.set("updateMask", PROFILE_FIELD_MASK[v.field]);
  return call(f, target.accessToken, url.toString(), { method: "PATCH", body: JSON.stringify(patchBody(v, current)) });
}

// ---------------------------------------------------------------------------
// The two logs.
// ---------------------------------------------------------------------------

export type EditOutcome = "ok" | "pending_review" | "unconfirmed" | "failed";

export interface ProfileEditStore {
  /** Approval times (one per batch) since `since`; null = gbp_changes missing. */
  approvalsSince(businessId: string, since: string): Promise<string[] | null>;
  /** This business's profile edits of one kind (undo); null = table missing. */
  rowsSince(businessId: string, since: string, kind: string): Promise<GbpChangeRow[] | null>;
  /** Saves before → after as "sending" (before the edit is sent). false = not saved: nothing is sent. */
  insertSending(row: Record<string, unknown>): Promise<boolean>;
  setStatus(batchId: string, status: "sent" | "pending_review" | "failed", reason: string | null): Promise<void>;
  markUndone(batchId: string, at: string): Promise<void>;
  /** Is gbp_profile_edit_log there? */
  editLogReady(businessId: string): Promise<boolean>;
  logEdit(row: { business_id: string; user_id: string; field: ProfileField; action: "edit" | "undo"; outcome: EditOutcome; practice: boolean; error_reason: string | null }): Promise<void>;
}

export function supabaseProfileEditStore(db: SupabaseClient): ProfileEditStore {
  const changes = supabaseChangeStore(db);
  return {
    approvalsSince: (businessId, since) => changes.approvalsSince(businessId, since),
    rowsSince: (businessId, since, kind) => changes.rowsSince(businessId, since, kind),
    async insertSending(row) {
      const { error } = await db.from("gbp_changes").insert({ ...row, status: "sending" });
      return !error;
    },
    async setStatus(batchId, status, reason) {
      await db.from("gbp_changes").update({ status, error_reason: reason }).eq("batch_id", batchId);
    },
    async markUndone(batchId, at) {
      await changes.markUndone(batchId, at);
    },
    async editLogReady(businessId) {
      // A plain select: a head request hides a missing table's error code.
      const { error } = await db.from("gbp_profile_edit_log").select("id").eq("business_id", businessId).limit(1);
      // Only a missing table means "not set up"; another read error doesn't block the edit.
      return !error || !MISSING.has(error.code ?? "");
    },
    async logEdit(row) {
      const { error } = await db.from("gbp_profile_edit_log").insert({ ...row, error_reason: row.error_reason ? row.error_reason.slice(0, 120) : null });
      if (error) console.error(`[gbp-profile] edit log failed for ${row.business_id}: ${error.code ?? "unknown"}`);
    },
  };
}

function reasonOf(res: Extract<GoogleCall<unknown>, { ok: false }>): string | null {
  return res.reason ?? (res.status ? String(res.status) : res.error);
}

export type ProfileEditError = GbpEditError | "not_set_up";

export type ApplyProfileEditResult =
  /** Google shows the new value. `undoBatchId`: the change can be undone. */
  | { status: "updated"; value: ProfileValue; undoBatchId: string }
  /** Google is reviewing it (can take days) — a neutral wait. */
  | { status: "pending_review"; undoBatchId: string }
  /** Google accepted it but doesn't show it yet. */
  | { status: "unconfirmed"; undoBatchId: string }
  | { status: "no_change" }
  | { status: "error"; error: ProfileEditError; reason?: string | null };

export async function applyProfileEdit(
  target: ProfileTarget,
  next: ProfileValue,
  store: ProfileEditStore,
  options: { fetchImpl?: typeof fetch; now?: number; practice?: boolean; undoOf?: string | null } = {}
): Promise<ApplyProfileEditResult> {
  const now = options.now ?? Date.now();
  const practice = options.practice === true;
  const action = options.undoOf ? "undo" : "edit";
  // 1. Both logs must exist, and the approval limits allow it — before any Google call.
  const approvals = await store.approvalsSince(target.businessId, new Date(now - DAY_MS).toISOString());
  if (approvals === null || !(await store.editLogReady(target.businessId))) return { status: "error", error: "not_set_up" };
  // An undo is never held back by the one-a-minute limit (the owner just approved the edit).
  const allowed = options.undoOf ? "ok" : approvalAllowed(approvals, now);
  if (allowed !== "ok") return { status: "error", error: allowed };

  const counter = { calls: 0 };
  const f = gbpFetch(counter, options.fetchImpl ?? fetch);
  const log = (outcome: EditOutcome, reason: string | null = null) =>
    store.logEdit({ business_id: target.businessId, user_id: target.userId, field: next.field, action, outcome, practice, error_reason: reason });
  try {
    // 2. What Google has now.
    const current = await readLocation(f, target);
    if (!current.ok) return { status: "error", error: current.error, reason: current.reason };
    const before = valueOf(next.field, current.data);
    if (sameProfileValue(before, next)) return { status: "no_change" };

    // 3. The previous value, saved before anything is sent.
    const batchId = randomUUID();
    const saved = await store.insertSending({
      business_id: target.businessId,
      batch_id: batchId,
      kind: practice ? PROFILE_CHANGE_KIND_PRACTICE : PROFILE_CHANGE_KIND,
      field: next.field,
      before_value: storeValue(before),
      after_value: storeValue(next),
      approved_by: target.userId,
      approved_at: new Date(now).toISOString(),
      location_name: target.locationName,
      undo_of: options.undoOf ?? null,
    });
    if (!saved) return { status: "error", error: "not_set_up" };

    // 4. The one change.
    const patched = await patchField(f, target, next, current.data);
    if (!patched.ok) {
      await store.setStatus(batchId, "failed", reasonOf(patched));
      await log("failed", reasonOf(patched));
      return { status: "error", error: patched.error, reason: patched.reason };
    }
    // 5. Held for review?
    if ((await readPending(f, target)).includes(next.field)) {
      await store.setStatus(batchId, "pending_review", null);
      await log("pending_review");
      return { status: "pending_review", undoBatchId: batchId };
    }
    // 6. Read it back.
    const after = await readLocation(f, target);
    await store.setStatus(batchId, "sent", null);
    if (after.ok && sameProfileValue(valueOf(next.field, after.data), next)) {
      await log("ok");
      return { status: "updated", value: valueOf(next.field, after.data), undoBatchId: batchId };
    }
    await log("unconfirmed", after.ok ? "read_back_differs" : `read_back_failed:${reasonOf(after)}`);
    return { status: "unconfirmed", undoBatchId: batchId };
  } finally {
    logGbpCalls(`profile-${action}`, counter);
  }
}

export interface ProfileUndo {
  field: ProfileField;
  batchId: string;
  approvedAt: string;
  undoUntil: string;
  status: "sent" | "pending_review";
  before: ProfileValue;
  after: ProfileValue;
}

/** The latest edit of this field the owner may still undo — the same rules
 * as every Google edit (latestUndoable: 7 days, not failed, not an undo,
 * not undone, made on the location connected now). A database read. */
export async function getProfileUndo(store: ProfileEditStore, businessId: string, locationName: string, field: ProfileField, practice: boolean, now: number = Date.now()): Promise<ProfileUndo | null> {
  const rows = await store.rowsSince(businessId, new Date(now - (UNDO_DAYS + 1) * DAY_MS).toISOString(), practice ? PROFILE_CHANGE_KIND_PRACTICE : PROFILE_CHANGE_KIND);
  if (!rows) return null;
  const mine = rows.filter((r) => r.field === field && r.location_name === locationName && r.status !== "sending");
  const undoable = latestUndoable(mine, now, locationName);
  if (!undoable) return null;
  const row = mine.find((r) => r.batch_id === undoable.batchId);
  if (!row) return null;
  return { field, batchId: undoable.batchId, approvedAt: undoable.approvedAt, undoUntil: undoable.undoUntil, status: undoable.status, before: readStoredValue(field, row.before_value), after: readStoredValue(field, row.after_value) };
}

export type UndoProfileEditResult = ApplyProfileEditResult | { status: "error"; error: "undo_expired" | "changed_since" };

/** Puts the previous value back — never over a value someone changed on
 * Google since (unless Google is still reviewing ours). Logged like an edit. */
export async function undoProfileEdit(
  target: ProfileTarget,
  field: ProfileField,
  batchId: string,
  store: ProfileEditStore,
  options: { fetchImpl?: typeof fetch; now?: number; practice?: boolean } = {}
): Promise<UndoProfileEditResult> {
  const now = options.now ?? Date.now();
  const undo = await getProfileUndo(store, target.businessId, target.locationName, field, options.practice === true, now);
  if (!undo || undo.batchId !== batchId) return { status: "error", error: "undo_expired" };
  const counter = { calls: 0 };
  const current = await readLocation(gbpFetch(counter, options.fetchImpl ?? fetch), target);
  logGbpCalls("profile-undo-check", counter);
  if (!current.ok) return { status: "error", error: current.error, reason: current.reason };
  const live = valueOf(field, current.data);
  if (!sameProfileValue(live, undo.after) && !(undo.status === "pending_review" && sameProfileValue(live, undo.before))) return { status: "error", error: "changed_since" };
  const result = await applyProfileEdit(target, undo.before, store, { ...options, undoOf: batchId });
  if (result.status === "updated" || result.status === "pending_review" || result.status === "unconfirmed" || result.status === "no_change") await store.markUndone(batchId, new Date(now).toISOString());
  return result;
}
