// Server-only. The Google side of Premium "Update on Google" for customer
// details (docs/gbp-actions-plan.md, Step 1), for the owner's OWN matched
// location only. Every call goes through gbpFetch (lib/gbpQuota.ts).
//
// - load: attributes.list (parent=location) + locations.getAttributes —
//   reads only.
// - apply: re-reads both (never trusts the client's "before"), diffs, then
//   ONE locations.updateAttributes PATCH — Google applies all of it or
//   none — then reads metadata.hasPendingEdits for an honest "Pending
//   Google review". Every approval is logged in gbp_changes, failures too.
// - undo: the latest approval, ≤ 7 days, made on the location connected
//   now, only if nothing was changed on Google since; one PATCH restoring
//   the logged "before" (removing what was "not set"), then a read-back —
//   complete only if it matches. An approval Google was still reviewing
//   is always re-sent, and "sent — Google is reviewing" if it still is.
//
// The caller (app/actions/gbpCustomerDetails.ts) has already checked the
// owner, the plan, the archive and the connection.
import "server-only";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import {
  approvalAllowed,
  attributesPatch,
  customerDetailsEditorRows,
  diffCustomerDetails,
  latestUndoable,
  storedValue,
  undoPlan,
  undoReadbackMismatches,
  type AttrValue,
  type AttributeChange,
  type CustomerDetailsEditorRow,
  type GbpAttribute,
  type GbpAttributeMetadata,
  type GbpChangeRow,
  type UndoableChange,
} from "@/lib/gbpAttributes";

const BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const MISSING_TABLE = new Set(["PGRST204", "PGRST205", "42703", "42P01"]);
const DAY_MS = 24 * 60 * 60 * 1000;

/** What the owner is told, in plain words (dashboard.gbpEdit.error.*). */
export type GbpEditError =
  | "reconnect"
  | "permission"
  | "rate_limited"
  | "rejected"
  | "failed"
  | "changed"
  | "wait_minute"
  | "daily_cap"
  | "not_enabled"
  | "changed_since"
  | "undo_expired"
  /** Sent, but Google doesn't show the previous values yet (read back). */
  | "undo_unverified";

type GoogleCall<T> = { ok: true; data: T } | { ok: false; error: GbpEditError; status: number | null; reason: string | null };

export type { GoogleCall };

/** One Business Information API call (shared with lib/gbpWebsiteLink.server.ts). */
export async function call<T>(fetchImpl: typeof fetch, token: string, url: string, init: RequestInit = {}): Promise<GoogleCall<T>> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  } catch {
    return { ok: false, error: "failed", status: null, reason: "network" };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { status?: string; details?: Array<{ reason?: string }> } } | null;
    // Google's machine-readable reason only — never its message text.
    const reason = body?.error?.details?.find((d) => typeof d.reason === "string")?.reason ?? body?.error?.status ?? null;
    const error: GbpEditError = res.status === 401 ? "reconnect" : res.status === 403 ? "permission" : res.status === 429 ? "rate_limited" : res.status === 400 ? "rejected" : "failed";
    return { ok: false, error, status: res.status, reason };
  }
  return { ok: true, data: ((await res.json().catch(() => ({}))) ?? {}) as T };
}

function logFailure(step: string, details: Record<string, unknown>) {
  console.warn(`[gbp-edit] ${step} failed`, JSON.stringify(details));
}

/** Google's offered attributes for this location, every page. */
async function listOffered(f: typeof fetch, token: string, locationName: string): Promise<GoogleCall<GbpAttributeMetadata[]>> {
  const out: GbpAttributeMetadata[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const url = new URL(`${BASE}/attributes`);
    // Google refuses languageCode alongside parent ("Field must not be set
    // when parent is set") — the panel shows its own EN/ES labels instead.
    url.searchParams.set("parent", locationName);
    url.searchParams.set("pageSize", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await call<{ attributeMetadata?: GbpAttributeMetadata[]; nextPageToken?: string }>(f, token, url.toString());
    if (!res.ok) return res;
    out.push(...(res.data.attributeMetadata ?? []));
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  return { ok: true, data: out };
}

async function currentAttributes(f: typeof fetch, token: string, locationName: string): Promise<GoogleCall<GbpAttribute[]>> {
  const res = await call<{ attributes?: GbpAttribute[] }>(f, token, `${BASE}/${locationName}/attributes`);
  return res.ok ? { ok: true, data: res.data.attributes ?? [] } : res;
}

/** What's live on Maps — the owner's values plus Google's own and
 * customers' info (locations.attributes.getGoogleUpdated). */
async function liveAttributes(f: typeof fetch, token: string, locationName: string): Promise<GoogleCall<GbpAttribute[]>> {
  const res = await call<{ attributes?: GbpAttribute[] }>(f, token, `${BASE}/${locationName}/attributes:getGoogleUpdated`);
  return res.ok ? { ok: true, data: res.data.attributes ?? [] } : res;
}

async function patchAttributes(f: typeof fetch, token: string, locationName: string, changes: Array<Pick<AttributeChange, "id" | "after">>): Promise<GoogleCall<unknown>> {
  const { mask, body } = attributesPatch(locationName, changes);
  const url = new URL(`${BASE}/${locationName}/attributes`);
  url.searchParams.set("attributeMask", mask);
  return call(f, token, url.toString(), { method: "PATCH", body: JSON.stringify(body) });
}

/** metadata.hasPendingEdits — true only when Google says so. A failed
 * read is "don't know", never "pending". */
export async function hasPendingEdits(f: typeof fetch, token: string, locationName: string): Promise<boolean> {
  const url = new URL(`${BASE}/${locationName}`);
  url.searchParams.set("readMask", "metadata");
  const res = await call<{ metadata?: { hasPendingEdits?: boolean } }>(f, token, url.toString());
  return res.ok && res.data.metadata?.hasPendingEdits === true;
}

// ---------------------------------------------------------------------------
// The audit log (supabase/gbp-changes.sql), written only by the server.
// ---------------------------------------------------------------------------

export interface GbpChangeStore {
  /** Approval times (one per batch) since `since`; null = table missing. */
  approvalsSince(businessId: string, since: string): Promise<string[] | null>;
  /** This business's rows of one kind since `since`, for undo ("attributes"
   * by default; "place_action" for Order online links); null = table missing. */
  rowsSince(businessId: string, since: string, kind?: string): Promise<GbpChangeRow[] | null>;
  insert(rows: Array<Record<string, unknown>>): Promise<boolean>;
  markUndone(batchId: string, at: string): Promise<boolean>;
}

export function supabaseChangeStore(db: SupabaseClient): GbpChangeStore {
  return {
    async approvalsSince(businessId, since) {
      const { data, error } = await db.from("gbp_changes").select("batch_id, approved_at").eq("business_id", businessId).gte("approved_at", since);
      if (error) return MISSING_TABLE.has(error.code ?? "") ? null : [];
      const byBatch = new Map<string, string>();
      for (const r of (data ?? []) as Array<{ batch_id: string; approved_at: string }>) byBatch.set(r.batch_id, r.approved_at);
      return Array.from(byBatch.values());
    },
    async rowsSince(businessId, since, kind = "attributes") {
      const { data, error } = await db
        .from("gbp_changes")
        .select("batch_id, field, before_value, after_value, approved_at, status, undo_of, undone_at, location_name, undo_closed_at")
        .eq("business_id", businessId)
        .eq("kind", kind)
        .gte("approved_at", since);
      if (error) return MISSING_TABLE.has(error.code ?? "") ? null : [];
      return (data ?? []) as GbpChangeRow[];
    },
    async insert(rows) {
      let { error } = await db.from("gbp_changes").insert(rows);
      // Before supabase/gbp-changes-location.sql: keep the audit row
      // without its location (never undoable — latestUndoable needs it).
      if (error && MISSING_TABLE.has(error.code ?? "")) {
        ({ error } = await db.from("gbp_changes").insert(rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "location_name")))));
      }
      return !error;
    },
    async markUndone(batchId, at) {
      const { error } = await db.from("gbp_changes").update({ undone_at: at }).eq("batch_id", batchId);
      return !error;
    },
  };
}

// ---------------------------------------------------------------------------
// The three flows.
// ---------------------------------------------------------------------------

export interface GbpEditTarget {
  businessId: string;
  userId: string;
  /** "locations/456" (gbp_connections.google_location_id). */
  locationName: string;
  accessToken: string;
  locale: string;
}

export type LoadEditorResult = { status: "ok"; rows: CustomerDetailsEditorRow[] } | { status: "error"; error: GbpEditError };

export async function loadCustomerDetailsEditor(target: GbpEditTarget, fetchImpl: typeof fetch = fetch): Promise<LoadEditorResult> {
  const counter = { calls: 0 };
  const f = gbpFetch(counter, fetchImpl);
  const offered = await listOffered(f, target.accessToken, target.locationName);
  const current = offered.ok ? await currentAttributes(f, target.accessToken, target.locationName) : null;
  const live = current?.ok ? await liveAttributes(f, target.accessToken, target.locationName) : null;
  logGbpCalls("customer-details-load", counter);
  // All three or nothing: without the current values the panel can't
  // show what's there, so it doesn't open (never a blank "before").
  if (!offered.ok) return logAndFail("load offered", offered);
  if (!current!.ok) return logAndFail("load current", current!);
  if (!live!.ok) return logAndFail("load live", live!);
  return { status: "ok", rows: customerDetailsEditorRows(offered.data, current!.data, live!.data) };
}

function logAndFail(step: string, res: Extract<GoogleCall<unknown>, { ok: false }>): { status: "error"; error: GbpEditError } {
  logFailure(step, { status: res.status, reason: res.reason });
  return { status: "error", error: res.error };
}

export type ApplyResult =
  /** `logged`: false only if Google took the change but the log write
   * failed — the owner is told it was sent, and no undo is offered. */
  | { status: "sent" | "pending_review"; batchId: string; changes: AttributeChange[]; logged: boolean }
  | { status: "no_changes" }
  | { status: "error"; error: GbpEditError };

export async function applyCustomerDetailsChange(
  target: GbpEditTarget,
  picks: Record<string, AttrValue>,
  store: GbpChangeStore,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now()
): Promise<ApplyResult> {
  // The log must exist before anything is sent.
  const approvals = await store.approvalsSince(target.businessId, new Date(now - DAY_MS).toISOString());
  if (approvals === null) return { status: "error", error: "not_enabled" };
  const allowed = approvalAllowed(approvals, now);
  if (allowed !== "ok") return { status: "error", error: allowed };

  const counter = { calls: 0 };
  const f = gbpFetch(counter, fetchImpl);
  try {
    // Google's offer and values right now — the only "before" we trust.
    const offered = await listOffered(f, target.accessToken, target.locationName);
    if (!offered.ok) return logAndFail("apply offered", offered);
    const current = await currentAttributes(f, target.accessToken, target.locationName);
    if (!current.ok) return logAndFail("apply current", current);
    const live = await liveAttributes(f, target.accessToken, target.locationName);
    if (!live.ok) return logAndFail("apply live", live);
    // The same "before" the owner saw: a pick equal to what customers see
    // now is no change, so nothing they didn't touch is ever sent.
    const diff = diffCustomerDetails(customerDetailsEditorRows(offered.data, current.data, live.data), picks);
    // Google's list changed while the panel was open, or a forged pick.
    if (!diff.ok) return { status: "error", error: "changed" };
    if (diff.changes.length === 0) return { status: "no_changes" };

    const batchId = randomUUID();
    const approvedAt = new Date(now).toISOString();
    const patched = await patchAttributes(f, target.accessToken, target.locationName, diff.changes);
    const pending = patched.ok ? await hasPendingEdits(f, target.accessToken, target.locationName) : false;
    const status = !patched.ok ? "failed" : pending ? "pending_review" : "sent";
    const logged = await store.insert(
      diff.changes.map((c) => ({
        business_id: target.businessId,
        batch_id: batchId,
        kind: "attributes",
        field: c.id,
        // Undo puts back the owner's own value (null = Google's info shows again).
        before_value: storedValue(c.merchantBefore ?? null),
        after_value: storedValue(c.after),
        approved_by: target.userId,
        approved_at: approvedAt,
        location_name: target.locationName,
        status,
        error_reason: patched.ok ? null : (patched.reason ?? (patched.status ? String(patched.status) : null)),
      }))
    );
    if (!patched.ok) return logAndFail("patch", patched);
    if (!logged) logFailure("log", { batchId });
    return { status: pending ? "pending_review" : "sent", batchId, changes: diff.changes, logged };
  } finally {
    logGbpCalls("customer-details-apply", counter);
  }
}

/** The latest approval the owner may undo on `locationName` (the location
 * connected now) — a database read, no Google call. Null before the SQL is run. */
export async function getUndoableChange(store: GbpChangeStore, businessId: string, locationName: string, now: number = Date.now()): Promise<UndoableChange | null> {
  const rows = await store.rowsSince(businessId, new Date(now - 8 * DAY_MS).toISOString());
  return rows ? latestUndoable(rows, now, locationName) : null;
}

export type UndoResult =
  /** `pending`: the restore was sent while Google is reviewing changes to
   * the profile — it can't be read back yet (dashboard.gbpEdit.undo.donePending). */
  | { status: "sent"; pending?: boolean }
  | { status: "error"; error: GbpEditError; fields?: string[]; pending?: boolean };

/**
 * Undo puts back exactly the logged "before" of the latest approval —
 * including REMOVING an attribute that was "not set" (in the mask, left
 * out of the body) — then reads the location back from Google. "Undo
 * complete" only when every field reads back at its "before"; otherwise
 * "Undo didn't finish" with which fields (and whether Google is still
 * reviewing it). Never overwrites a value someone changed on Google since.
 * Every attempt is logged in gbp_changes (undo_of = the approval), a
 * refusal too — the real Hair express case had no trace of its undo.
 * Not held to the one-minute wait between approvals: undoing a mistake
 * right away is the point.
 */
export async function undoCustomerDetailsChange(
  target: GbpEditTarget,
  batchId: string,
  store: GbpChangeStore,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now()
): Promise<UndoResult> {
  const undoable = await getUndoableChange(store, target.businessId, target.locationName, now);
  if (!undoable || undoable.batchId !== batchId) return { status: "error", error: "undo_expired" };

  const at = new Date(now).toISOString();
  const undoBatchId = randomUUID();
  const log = (rows: Array<{ id: string; before: AttrValue; after: AttrValue }>, status: "sent" | "pending_review" | "failed", reason: string | null) =>
    store.insert(
      rows.map((c) => ({
        business_id: target.businessId,
        batch_id: undoBatchId,
        kind: "attributes",
        field: c.id,
        before_value: storedValue(c.before),
        after_value: storedValue(c.after),
        approved_by: target.userId,
        approved_at: at,
        location_name: target.locationName,
        status,
        error_reason: reason,
        undo_of: batchId,
      }))
    );
  // Logged the way undo would write it: before = what we set, after = what we restore.
  const reversed = undoable.changes.map((c) => ({ id: c.id, before: c.after, after: c.before }));

  const counter = { calls: 0 };
  const f = gbpFetch(counter, fetchImpl);
  try {
    const current = await currentAttributes(f, target.accessToken, target.locationName);
    if (!current.ok) {
      await log(reversed, "failed", `read:${current.reason ?? current.status ?? current.error}`);
      return logAndFail("undo current", current);
    }
    // Still under review when approved: Google may show the old value now
    // and apply our edit later — so the restore is always sent.
    const wasPending = undoable.status === "pending_review";
    const plan = undoPlan(undoable.changes, current.data, { resendRestored: wasPending });
    if (plan.conflicts.length > 0) {
      await log(reversed, "failed", `changed_since:${plan.conflicts.join(",")}`);
      return { status: "error", error: "changed_since", fields: plan.conflicts };
    }
    if (plan.send.length > 0) {
      const patched = await patchAttributes(f, target.accessToken, target.locationName, plan.send);
      if (!patched.ok) {
        await log(reversed, "failed", patched.reason ?? (patched.status ? String(patched.status) : patched.error));
        return logAndFail("undo patch", patched);
      }
    }
    if (wasPending && (await hasPendingEdits(f, target.accessToken, target.locationName))) {
      // Can't be read back while Google reviews: sent, and said so.
      await log(reversed, "pending_review", null);
      await store.markUndone(batchId, at);
      return { status: "sent", pending: true };
    }
    // Read back: done only when Google shows every "before" again.
    const readback = await currentAttributes(f, target.accessToken, target.locationName);
    const mismatches = readback.ok ? undoReadbackMismatches(undoable.changes, readback.data) : undoable.changes.map((c) => c.id);
    if (mismatches.length > 0) {
      const pending = await hasPendingEdits(f, target.accessToken, target.locationName);
      const reason = readback.ok ? `readback:${mismatches.join(",")}${pending ? ":pending_review" : ""}` : `readback_failed:${readback.reason ?? readback.status ?? readback.error}`;
      await log(reversed, "failed", reason);
      logFailure("undo readback", { mismatches, pending });
      return { status: "error", error: "undo_unverified", fields: mismatches, pending };
    }
    await log(reversed, "sent", null);
    await store.markUndone(batchId, at);
    return { status: "sent" };
  } finally {
    logGbpCalls("customer-details-undo", counter);
  }
}
