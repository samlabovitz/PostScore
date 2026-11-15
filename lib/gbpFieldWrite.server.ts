// Server-only. One listing field written to Google with the same safety
// flow as Edit on Google (lib/gbpWebsiteLink.server.ts): holiday hours
// (specialHours) and services (serviceItems). The caller
// (app/actions/gbpListingFields.ts) has already checked the owner, the
// plan, practice mode and the live allow list (GOOGLE_WRITES_LIVE_PLACES).
//   1. gbp_changes and the edit log ready, the approval limits allow it;
//   2. re-read the field on Google — the change is MERGED into Google's
//      current value, so every other holiday / service stays as it is;
//   3. save before → after (JSON) in gbp_changes as "sending" first;
//   4. ONE locations.patch with that updateMask;
//   5. held for review (metadata.hasPendingEdits) is a neutral wait;
//   6. read it back: verified only when Google shows it.
// Undo: the latest change, ≤ 7 days, on the location connected now, only
// if Google still shows what we sent (or is still reviewing it).
import "server-only";
import { randomUUID } from "crypto";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { approvalAllowed } from "@/lib/gbpAttributes";
import { call, hasPendingEdits, type GbpChangeStore, type GbpEditError, type GbpEditTarget, type GoogleCall, type GoogleWriteOutcome } from "@/lib/gbpAttributes.server";
import type { GbpChangeRow } from "@/lib/gbpAttributes";

const BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const DAY_MS = 24 * 60 * 60 * 1000;
export const FIELD_UNDO_DAYS = 7;

export interface FieldSpec<T> {
  /** The Business Information field (updateMask). */
  mask: "specialHours" | "serviceItems" | "phoneNumbers" | "websiteUri" | "regularHours";
  /** gbp_profile_edit_log.field */
  logField: "special_hours" | "services" | "phone" | "hours" | "website_link";
  /** ":getGoogleUpdated": read what Google shows (with its own edits), not what the owner entered. */
  readSuffix?: string;
  /** gbp_changes.kind (practice mode's own kind never mixes with real rows). */
  kind: (practice: boolean) => string;
  /** The field's value in a location read (also given the whole location, e.g. its categories). */
  read: (location: Record<string, unknown>) => T;
  body: (value: T) => Record<string, unknown>;
  same: (a: T, b: T) => boolean;
}

export async function readField<T>(f: typeof fetch, target: Pick<GbpEditTarget, "accessToken" | "locationName">, spec: FieldSpec<T>, extraMask = ""): Promise<GoogleCall<{ value: T; location: Record<string, unknown> }>> {
  const url = new URL(`${BASE}/${target.locationName}${spec.readSuffix ?? ""}`);
  url.searchParams.set("readMask", [spec.mask, extraMask].filter(Boolean).join(","));
  const res = await call<Record<string, unknown>>(f, target.accessToken, url.toString());
  // getGoogleUpdated wraps the location: { location, diffMask, pendingMask }.
  const location = spec.readSuffix ? ((res.ok ? (res.data.location as Record<string, unknown> | undefined) : undefined) ?? {}) : res.ok ? res.data : {};
  return res.ok ? { ok: true, data: { value: spec.read(location), location } } : res;
}

export async function readFieldOnce<T>(target: Pick<GbpEditTarget, "accessToken" | "locationName">, spec: FieldSpec<T>, fetchImpl: typeof fetch = fetch, extraMask = "") {
  const counter = { calls: 0 };
  try {
    return await readField(gbpFetch(counter, fetchImpl), target, spec, extraMask);
  } finally {
    logGbpCalls(`${spec.logField}-read`, counter);
  }
}

const reasonOf = (res: Extract<GoogleCall<unknown>, { ok: false }>) => res.reason ?? (res.status ? String(res.status) : res.error);

export type FieldWriteResult<T> =
  | { status: "sent"; verified: boolean; shown?: T }
  | { status: "pending_review" }
  | { status: "no_change" }
  | { status: "error"; error: GbpEditError };

export interface FieldWriteOptions {
  fetchImpl?: typeof fetch;
  now?: number;
  practice?: boolean;
  /** The other fields the merge needs from the same read (e.g. "categories" for services). */
  extraMask?: string;
}

/** Edit: `merge` turns Google's current value into the new one. */
export async function applyField<T>(target: GbpEditTarget, spec: FieldSpec<T>, merge: (current: T, location: Record<string, unknown>) => T, store: GbpChangeStore, options: FieldWriteOptions = {}): Promise<FieldWriteResult<T>> {
  const now = options.now ?? Date.now();
  const approvals = await store.approvalsSince(target.businessId, new Date(now - DAY_MS).toISOString());
  if (approvals === null || !(await store.editLogReady(target.businessId))) return { status: "error", error: "not_enabled" };
  const allowed = approvalAllowed(approvals, now);
  if (allowed !== "ok") return { status: "error", error: allowed };
  return send(target, spec, (current, location) => ({ value: merge(current, location) }), store, { ...options, now, undoOf: null });
}

async function send<T>(
  target: GbpEditTarget,
  spec: FieldSpec<T>,
  next: (current: T, location: Record<string, unknown>) => { value: T } | { refuse: GbpEditError },
  store: GbpChangeStore,
  options: FieldWriteOptions & { now: number; undoOf: string | null }
): Promise<FieldWriteResult<T>> {
  const practice = options.practice === true;
  const action = options.undoOf ? "undo" : "edit";
  const log = (outcome: GoogleWriteOutcome, reason: string | null = null) =>
    store.logEdit({ business_id: target.businessId, user_id: target.userId, field: spec.logField, action, outcome, practice, error_reason: reason, changed_count: 1 });
  const counter = { calls: 0 };
  const f = gbpFetch(counter, options.fetchImpl ?? fetch);
  try {
    // 2. Google's current value — the "before", and what the change merges into.
    const current = await readField(f, target, spec, options.extraMask);
    if (!current.ok) {
      await log("failed", `read:${reasonOf(current)}`);
      return { status: "error", error: current.error };
    }
    const computed = next(current.data.value, current.data.location);
    if ("refuse" in computed) {
      await log("failed", computed.refuse);
      return { status: "error", error: computed.refuse };
    }
    if (spec.same(current.data.value, computed.value)) return { status: "no_change" };

    // 3. Saved before anything is sent.
    const batchId = randomUUID();
    const saved = await store.insert([
      {
        business_id: target.businessId,
        batch_id: batchId,
        kind: spec.kind(practice),
        field: spec.mask,
        before_value: JSON.stringify(current.data.value),
        after_value: JSON.stringify(computed.value),
        approved_by: target.userId,
        approved_at: new Date(options.now).toISOString(),
        location_name: target.locationName,
        status: "sending",
        undo_of: options.undoOf,
      },
    ]);
    if (!saved) return { status: "error", error: "not_enabled" };

    // 4. The one change.
    const url = new URL(`${BASE}/${target.locationName}`);
    url.searchParams.set("updateMask", spec.mask);
    const patched = await call(f, target.accessToken, url.toString(), { method: "PATCH", body: JSON.stringify(spec.body(computed.value)) });
    if (!patched.ok) {
      await store.setStatus(batchId, "failed", reasonOf(patched));
      await log("failed", reasonOf(patched));
      console.warn(`[gbp-${spec.logField}] patch failed`, JSON.stringify({ status: patched.status, reason: patched.reason }));
      return { status: "error", error: patched.error };
    }
    // 5. Held for review?
    if (await hasPendingEdits(f, target.accessToken, target.locationName)) {
      await store.setStatus(batchId, "pending_review", null);
      await log("pending_review");
      return { status: "pending_review" };
    }
    // 6. Read it back.
    const readback = await readField(f, target, spec, options.extraMask);
    const verified = readback.ok && spec.same(readback.data.value, computed.value);
    await store.setStatus(batchId, "sent", verified ? null : readback.ok ? "read_back_differs" : `read_back_failed:${reasonOf(readback)}`);
    await log(verified ? "ok" : "unconfirmed", verified ? null : readback.ok ? "read_back_differs" : `read_back_failed:${reasonOf(readback)}`);
    return { status: "sent", verified, ...(readback.ok ? { shown: readback.data.value } : {}) };
  } finally {
    logGbpCalls(`${spec.logField}-${action}`, counter);
  }
}

export interface FieldUndo {
  batchId: string;
  undoUntil: string;
}

/** The latest change of this field the owner may still undo (a database read). */
export function latestFieldUndo(rows: GbpChangeRow[], now: number, locationName: string): FieldUndo | null {
  const edits = rows.filter((r) => !r.undo_of && (r.status === "sent" || r.status === "pending_review")).sort((a, b) => b.approved_at.localeCompare(a.approved_at));
  const last = edits[0];
  if (!last || last.undone_at || last.undo_closed_at) return null;
  if (last.location_name && last.location_name !== locationName) return null;
  const at = Date.parse(last.approved_at);
  if (!Number.isFinite(at) || now - at > FIELD_UNDO_DAYS * DAY_MS) return null;
  return { batchId: last.batch_id, undoUntil: new Date(at + FIELD_UNDO_DAYS * DAY_MS).toISOString() };
}

export async function getFieldUndo<T>(store: GbpChangeStore, spec: FieldSpec<T>, businessId: string, locationName: string, practice: boolean, now: number = Date.now()): Promise<FieldUndo | null> {
  const rows = await store.rowsSince(businessId, new Date(now - (FIELD_UNDO_DAYS + 1) * DAY_MS).toISOString(), spec.kind(practice));
  return rows ? latestFieldUndo(rows, now, locationName) : null;
}

/** "Yes, undo": the value from before our change, only if Google still
 * shows what we sent (or is still reviewing it); never someone else's. */
export async function undoField<T>(target: GbpEditTarget, spec: FieldSpec<T>, batchId: string, store: GbpChangeStore, options: FieldWriteOptions = {}): Promise<FieldWriteResult<T>> {
  const now = options.now ?? Date.now();
  const practice = options.practice === true;
  const rows = await store.rowsSince(target.businessId, new Date(now - (FIELD_UNDO_DAYS + 1) * DAY_MS).toISOString(), spec.kind(practice));
  const undo = rows ? latestFieldUndo(rows, now, target.locationName) : null;
  const row = rows?.find((r) => r.batch_id === batchId);
  if (!undo || undo.batchId !== batchId || !row) return { status: "error", error: "undo_expired" };
  const before = JSON.parse(row.before_value ?? "null") as T;
  const after = JSON.parse(row.after_value ?? "null") as T;
  const result = await send(target, spec, (current) => (row.status === "pending_review" || spec.same(current, after) ? { value: before } : { refuse: "changed_since" }), store, { ...options, now, undoOf: batchId });
  if (result.status === "sent" || result.status === "pending_review" || result.status === "no_change") await store.markUndone(batchId, new Date(now).toISOString());
  return result;
}
