// Server-only. Google's own edits to the listing (Section 6 "Changes by
// anyone else"): two reads — what the owner entered (locations.get) and
// what Google shows (locations.getGoogleUpdated, whose diffMask names the
// fields Google changed). Only the changed fields are kept, as short text
// (lib/gbpGoogleEdits.ts, supabase/gbp-step3b.sql), plus an Overview
// notification per field. Runs on each scan, once a day for connected
// businesses (app/api/cron/gbp-google-edits) and on "Check now" (at most
// once every 10 minutes per business). Read only, except "Change it back",
// which goes through the normal safety flow (lib/gbpFieldWrite.server.ts):
// saved first, one PATCH, read back, 7-day undo.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessTokenWithClient, markGbpReconnect } from "@/lib/gbpTokens.server";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { call } from "@/lib/gbpAttributes.server";
import type { FieldSpec } from "@/lib/gbpFieldWrite.server";
import { checkNowAllowed, editNotificationKey, isInfoOnly, GOOGLE_EDITS_READ_MASK, googleEditsFrom, syncGoogleEdits, type EditedField, type EditedLocation, type FoundEdit, type GoogleEditRow, type RevertableField } from "@/lib/gbpGoogleEdits";

const BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const COLUMNS = "id, field, owner_value, google_value, detected_at, resolved_at, resolution";

export interface GoogleEditsState {
  /** false: supabase/gbp-step3b.sql hasn't been run yet. */
  available: boolean;
  open: GoogleEditRow[];
  /** Kept / changed back in the last day: shown collapsed ("✓ You kept …"). */
  recent?: GoogleEditRow[];
  checkedAt: string | null;
}

export async function loadGoogleEdits(db: SupabaseClient, businessId: string, practice: boolean): Promise<GoogleEditsState> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [rows, conn, recent] = await Promise.all([
    db.from("gbp_google_edits").select(COLUMNS).eq("business_id", businessId).eq("practice", practice).is("resolved_at", null).order("detected_at", { ascending: false }),
    db.from("gbp_connections").select("google_edits_checked_at").eq("business_id", businessId).maybeSingle(),
    db.from("gbp_google_edits").select(COLUMNS).eq("business_id", businessId).eq("practice", practice).in("resolution", ["kept", "changed_back"]).gte("resolved_at", since).order("resolved_at", { ascending: false }).limit(10),
  ]);
  if (rows.error) return { available: false, open: [], checkedAt: null };
  return { available: true, open: (rows.data ?? []) as GoogleEditRow[], recent: ((recent.error ? [] : recent.data) ?? []) as GoogleEditRow[], checkedAt: ((conn.data as { google_edits_checked_at?: string | null } | null)?.google_edits_checked_at ?? null) as string | null };
}

type Reads = { ok: true; owner: EditedLocation; google: EditedLocation; diffMask: string } | { ok: false; status: number | null };

async function readBoth(f: typeof fetch, token: string, locationName: string): Promise<Reads> {
  const owner = new URL(`${BASE}/${locationName}`);
  owner.searchParams.set("readMask", GOOGLE_EDITS_READ_MASK);
  const google = new URL(`${BASE}/${locationName}:getGoogleUpdated`);
  google.searchParams.set("readMask", GOOGLE_EDITS_READ_MASK);
  const [a, b] = await Promise.all([call<EditedLocation>(f, token, owner.toString()), call<{ location?: EditedLocation; diffMask?: string }>(f, token, google.toString())]);
  if (!a.ok) return { ok: false, status: a.status };
  if (!b.ok) return { ok: false, status: b.status };
  return { ok: true, owner: a.data, google: b.data.location ?? {}, diffMask: b.data.diffMask ?? "" };
}

export type CheckResult = { status: "ok"; open: GoogleEditRow[]; checkedAt: string } | { status: "too_soon"; checkedAt: string } | { status: "unavailable" } | { status: "failed"; error: string };

export interface CheckOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
  /** "Check now": refused within 10 minutes of the last check. */
  rateLimited?: boolean;
  /** Practice mode's fake Google (lib/gbpProfilePractice.server.ts). */
  practice?: { fetchImpl: typeof fetch; locationName: string };
}

/** One check: read both versions, keep the changed fields, open / update /
 * close their rows and notifications. A failed read changes nothing. */
export async function checkGoogleEdits(admin: SupabaseClient, businessId: string, options: CheckOptions = {}): Promise<CheckResult> {
  const now = options.now ?? new Date();
  const practice = !!options.practice;
  const { data: conn, error: connError } = await admin.from("gbp_connections").select("status, google_location_id, google_edits_checked_at").eq("business_id", businessId).maybeSingle();
  if (connError) return connError.code === "42703" || connError.code === "PGRST204" ? { status: "unavailable" } : { status: "failed", error: "db" };
  const c = conn as { status?: string; google_location_id?: string | null; google_edits_checked_at?: string | null } | null;
  if (!practice && (c?.status !== "connected" || !c.google_location_id?.startsWith("locations/"))) return { status: "failed", error: "not connected" };
  if (options.rateLimited && !checkNowAllowed(c?.google_edits_checked_at, now.getTime())) return { status: "too_soon", checkedAt: c!.google_edits_checked_at! };

  const stored = await admin.from("gbp_google_edits").select(COLUMNS).eq("business_id", businessId).eq("practice", practice).or(`resolved_at.is.null,resolution.eq.kept`).order("detected_at", { ascending: false }).limit(100);
  if (stored.error) return { status: "unavailable" };

  const counter = { calls: 0 };
  let reads: Reads;
  try {
    if (options.practice) {
      reads = await readBoth(gbpFetch(counter, options.practice.fetchImpl), "practice-token", options.practice.locationName);
    } else {
      const fetchImpl = options.fetchImpl ?? fetch;
      const f = gbpFetch(counter, fetchImpl);
      let token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl, now.getTime());
      if (token.status !== "ok") return { status: "failed", error: `token ${token.reason}` };
      reads = await readBoth(f, token.accessToken, c!.google_location_id!);
      if (!reads.ok && reads.status === 401) {
        const checked = await markGbpReconnect(admin, businessId, fetchImpl);
        if (checked.status === "error" && checked.reason === "reconnect") return { status: "failed", error: "reconnect" };
        token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl);
        if (token.status !== "ok") return { status: "failed", error: "token" };
        reads = await readBoth(f, token.accessToken, c!.google_location_id!);
      }
    }
  } finally {
    logGbpCalls("google-edits", counter);
  }
  if (!reads.ok) {
    console.warn(`[gbp-google-edits] read failed`, JSON.stringify({ status: reads.status }));
    return { status: "failed", error: `read ${reads.status ?? "network"}` };
  }

  const all = (stored.data ?? []) as GoogleEditRow[];
  const open = all.filter((r) => !r.resolved_at);
  const kept = all.filter((r) => r.resolution === "kept");
  const found = googleEditsFrom(reads.diffMask, reads.owner, reads.google);
  const plan = syncGoogleEdits(open, found, kept);
  const at = now.toISOString();
  // What our own scan found (website, phone): a field Google filled in that matches it is info only — no notification.
  const { data: biz } = await admin.from("businesses").select("website, phone").eq("id", businessId).maybeSingle();
  const scan = (biz as { website?: string | null; phone?: string | null } | null) ?? {};
  for (const e of plan.create) {
    // 23505: another check just opened the same field — fine.
    await admin.from("gbp_google_edits").insert({ business_id: businessId, field: e.field, owner_value: e.ownerValue, google_value: e.googleValue, detected_at: at, practice });
    if (!practice && !isInfoOnly({ field: e.field, owner_value: e.ownerValue, google_value: e.googleValue }, scan)) await openNotification(admin, businessId, e, at);
  }
  for (const u of plan.update) await admin.from("gbp_google_edits").update({ owner_value: u.edit.ownerValue, google_value: u.edit.googleValue }).eq("id", u.id);
  // An open one that's only Google filling in what matches our scan: no notification (closes an older one).
  if (!practice) for (const r of open.filter((o) => !plan.gone.includes(o.id) && isInfoOnly(o, scan))) await resolveNotification(admin, businessId, r.field, at);
  if (plan.gone.length > 0) {
    await admin.from("gbp_google_edits").update({ resolved_at: at, resolution: "gone" }).in("id", plan.gone);
    if (!practice) for (const r of open.filter((o) => plan.gone.includes(o.id))) await resolveNotification(admin, businessId, r.field, at);
  }
  await admin.from("gbp_connections").update({ google_edits_checked_at: at }).eq("business_id", businessId);
  const after = await admin.from("gbp_google_edits").select(COLUMNS).eq("business_id", businessId).eq("practice", practice).is("resolved_at", null).order("detected_at", { ascending: false });
  return { status: "ok", open: (after.data ?? []) as GoogleEditRow[], checkedAt: at };
}

async function openNotification(admin: SupabaseClient, businessId: string, e: FoundEdit, at: string) {
  await admin.from("notifications").insert({ business_id: businessId, type: "google", key: editNotificationKey(e.field), severity: "high", payload: { field: e.field }, created_at: at });
}

async function resolveNotification(admin: SupabaseClient, businessId: string, field: EditedField, at: string) {
  await admin.from("notifications").update({ resolved_at: at }).eq("business_id", businessId).eq("type", "google").eq("key", editNotificationKey(field)).is("resolved_at", null);
}

/** "Keep Google's version" (or "Change it back" done): the row closes and
 * its notification with it. Only an open row of this business. */
export async function resolveGoogleEdit(admin: SupabaseClient, businessId: string, id: string, resolution: "kept" | "changed_back", practice: boolean, now: Date = new Date()): Promise<GoogleEditRow | null> {
  const { data } = await admin.from("gbp_google_edits").select(COLUMNS).eq("id", id).eq("business_id", businessId).eq("practice", practice).is("resolved_at", null).maybeSingle();
  const row = data as GoogleEditRow | null;
  if (!row) return null;
  const at = now.toISOString();
  await admin.from("gbp_google_edits").update({ resolved_at: at, resolution }).eq("id", id);
  if (!practice) await resolveNotification(admin, businessId, row.field, at);
  return row;
}

/** "Change" after "Keep Google's version": the row is open again (until the next check decides). */
export async function reopenGoogleEdit(admin: SupabaseClient, businessId: string, id: string, practice: boolean): Promise<boolean> {
  const { data } = await admin.from("gbp_google_edits").select("id, field").eq("id", id).eq("business_id", businessId).eq("practice", practice).eq("resolution", "kept").maybeSingle();
  const row = data as { id: string; field: EditedField } | null;
  if (!row) return false;
  // Another open row for the field (a newer edit) wins; this one stays closed.
  const { data: other } = await admin.from("gbp_google_edits").select("id").eq("business_id", businessId).eq("field", row.field).eq("practice", practice).is("resolved_at", null).maybeSingle();
  if (other) return false;
  await admin.from("gbp_google_edits").update({ resolved_at: null, resolution: null }).eq("id", id);
  return true;
}

export async function openGoogleEdit(db: SupabaseClient, businessId: string, id: string, practice: boolean): Promise<GoogleEditRow | null> {
  const { data } = await db.from("gbp_google_edits").select(COLUMNS).eq("id", id).eq("business_id", businessId).eq("practice", practice).is("resolved_at", null).maybeSingle();
  return (data as GoogleEditRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// "Change it back": the field as Google shows it is the "before"; the
// owner's own value (locations.get) is sent again.
// ---------------------------------------------------------------------------

export const GOOGLE_REVERT_KIND = "google_revert";
const kind = (practice: boolean) => (practice ? `${GOOGLE_REVERT_KIND}_practice` : GOOGLE_REVERT_KIND);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

type Phone = { primaryPhone?: string; additionalPhones?: string[] };
type Hours = { periods?: unknown[] };

export const REVERT_SPECS: { phone: FieldSpec<Phone>; website: FieldSpec<string | null>; hours: FieldSpec<Hours> } = {
  phone: { mask: "phoneNumbers", logField: "phone", kind, readSuffix: ":getGoogleUpdated", read: (l) => (l.phoneNumbers as Phone | undefined) ?? {}, body: (v) => ({ phoneNumbers: v }), same: (a, b) => (a.primaryPhone ?? "") === (b.primaryPhone ?? "") },
  website: { mask: "websiteUri", logField: "website_link", kind, readSuffix: ":getGoogleUpdated", read: (l) => (l.websiteUri as string | undefined) ?? null, body: (v) => ({ websiteUri: v ?? "" }), same: (a, b) => (a ?? "") === (b ?? "") },
  hours: { mask: "regularHours", logField: "hours", kind, readSuffix: ":getGoogleUpdated", read: (l) => (l.regularHours as Hours | undefined) ?? {}, body: (v) => ({ regularHours: v }), same: (a, b) => same(a.periods ?? [], b.periods ?? []) },
};

/** The owner's own value of a field (what they entered; Google's edit not applied). */
export async function readOwnerValue(f: typeof fetch, token: string, locationName: string, field: RevertableField): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const spec = REVERT_SPECS[field] as FieldSpec<unknown>;
  const url = new URL(`${BASE}/${locationName}`);
  url.searchParams.set("readMask", spec.mask);
  const res = await call<Record<string, unknown>>(f, token, url.toString());
  return res.ok ? { ok: true, value: spec.read(res.data) } : { ok: false, error: res.error };
}
