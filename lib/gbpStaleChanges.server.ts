// Server-only. A REAL change Google still showed as "Google reviewing" more
// than 3 days after it was sent is read again (getGoogleUpdated: what
// searchers see, and which fields are still pending): still pending → left
// as it is; Google shows our value → Live ✓; Google shows something else →
// "Google rejected it". Practice rows are never read or touched. One read
// per business per hour at most; a failed read changes nothing.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessTokenWithClient } from "@/lib/gbpTokens.server";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { call } from "@/lib/gbpAttributes.server";
import { isPracticeRow, REJECTED_BY_GOOGLE, STALE_REVIEW_DAYS, type ChangeRow } from "@/lib/googleProfileTab";
import { readStoredValue, sameProfileValue, weekFromGoogle, type GooglePeriod, type ProfileField } from "@/lib/gbpProfileEdits";
import { sameServices, sameSpecialHours, type ServiceItem, type SpecialHourPeriod } from "@/lib/gbpListingFields";

const BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const DAY_MS = 86_400_000;
const READ_MASK = "regularHours,phoneNumbers,profile,websiteUri,specialHours,serviceItems";

type Shown = {
  regularHours?: { periods?: GooglePeriod[] };
  phoneNumbers?: { primaryPhone?: string };
  profile?: { description?: string };
  websiteUri?: string;
  specialHours?: { specialHourPeriods?: SpecialHourPeriod[] };
  serviceItems?: ServiceItem[];
};

/** The location field a change wrote (its updateMask), or null: not re-read here. */
export function maskOf(r: Pick<ChangeRow, "kind" | "field">): string | null {
  const k = r.kind.replace(/_practice$/, "");
  if (k === "profile_info") return r.field === "hours" ? "regularHours" : r.field === "phone" ? "phoneNumbers" : r.field === "description" ? "profile" : null;
  if (k === "website_uri") return "websiteUri";
  if (k === "special_hours") return "specialHours";
  if (k === "services") return "serviceItems";
  if (k === "google_revert") return r.field;
  return null;
}

const json = (v: string | null | undefined): unknown => {
  try {
    return JSON.parse(v ?? "null");
  } catch {
    return v ?? null;
  }
};
const url = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\/+$/, "").toLowerCase() : "");

/** Does Google now show what this change sent? */
export function showsSentValue(r: Pick<ChangeRow, "kind" | "field" | "after_value">, shown: Shown): boolean {
  const k = r.kind.replace(/_practice$/, "");
  if (k === "profile_info") {
    const field = r.field as ProfileField;
    const now =
      field === "hours"
        ? { field, value: weekFromGoogle(shown.regularHours?.periods) }
        : field === "phone"
          ? { field, value: shown.phoneNumbers?.primaryPhone?.trim() || null }
          : { field, value: shown.profile?.description?.trim() || null };
    return sameProfileValue(readStoredValue(field, r.after_value ?? null), now as never);
  }
  if (k === "website_uri") return url(json(r.after_value)) === url(shown.websiteUri);
  if (k === "special_hours") return sameSpecialHours((json(r.after_value) as SpecialHourPeriod[]) ?? [], shown.specialHours?.specialHourPeriods ?? []);
  if (k === "services") return sameServices((json(r.after_value) as ServiceItem[]) ?? [], shown.serviceItems ?? []);
  if (k === "google_revert") {
    const after = json(r.after_value) as Record<string, unknown> | string | null;
    if (r.field === "websiteUri") return url(after) === url(shown.websiteUri);
    if (r.field === "phoneNumbers") return ((after as { primaryPhone?: string } | null)?.primaryPhone ?? "") === (shown.phoneNumbers?.primaryPhone ?? "");
    if (r.field === "regularHours") return JSON.stringify((after as { periods?: unknown[] } | null)?.periods ?? []) === JSON.stringify(shown.regularHours?.periods ?? []);
  }
  return false;
}

/** What each stale row becomes: null = still pending (left as it is). */
export function staleOutcome(r: ChangeRow, shown: Shown, pendingMask: string): { status: "sent"; error_reason: null } | { status: "failed"; error_reason: string } | null {
  const mask = maskOf(r);
  if (!mask) return null;
  const pending = pendingMask.split(",").map((s) => s.trim()).some((m) => m === mask || m.startsWith(`${mask}.`));
  if (pending) return null;
  return showsSentValue(r, shown) ? { status: "sent", error_reason: null } : { status: "failed", error_reason: REJECTED_BY_GOOGLE };
}

export function staleRows(rows: ChangeRow[], now: number): ChangeRow[] {
  return rows.filter((r) => !isPracticeRow(r) && r.status === "pending_review" && !r.undone_at && now - Date.parse(r.approved_at) > STALE_REVIEW_DAYS * DAY_MS && maskOf(r) !== null);
}

const g = globalThis as unknown as { __staleChecked?: Map<string, number> };
const checked = (g.__staleChecked ??= new Map());

export async function refreshStaleReviews(admin: SupabaseClient, businessId: string, options: { fetchImpl?: typeof fetch; now?: number } = {}): Promise<{ updated: number }> {
  const now = options.now ?? Date.now();
  const last = checked.get(businessId);
  if (last && now - last < 60 * 60 * 1000) return { updated: 0 };
  const { data, error } = await admin
    .from("gbp_changes")
    .select("id, batch_id, kind, field, status, approved_at, undone_at, undo_of, after_value, location_name, error_reason")
    .eq("business_id", businessId)
    .eq("status", "pending_review")
    .lt("approved_at", new Date(now - STALE_REVIEW_DAYS * DAY_MS).toISOString());
  if (error) return { updated: 0 };
  const rows = staleRows((data ?? []) as Array<ChangeRow & { id: string }>, now) as Array<ChangeRow & { id: string }>;
  checked.set(businessId, now);
  if (rows.length === 0) return { updated: 0 };
  const { data: conn } = await admin.from("gbp_connections").select("status, google_location_id").eq("business_id", businessId).maybeSingle();
  const location = (conn as { status?: string; google_location_id?: string | null } | null)?.google_location_id;
  if ((conn as { status?: string } | null)?.status !== "connected" || !location?.startsWith("locations/")) return { updated: 0 };
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl);
  if (token.status !== "ok") return { updated: 0 };
  const counter = { calls: 0 };
  let res;
  try {
    const u = new URL(`${BASE}/${location}:getGoogleUpdated`);
    u.searchParams.set("readMask", READ_MASK);
    res = await call<{ location?: Shown; pendingMask?: string }>(gbpFetch(counter, fetchImpl), token.accessToken, u.toString());
  } finally {
    logGbpCalls("stale-reviews", counter);
  }
  if (!res.ok) return { updated: 0 };
  let updated = 0;
  for (const r of rows) {
    // Only rows for the listing connected now.
    if (r.location_name && r.location_name !== location) continue;
    const outcome = staleOutcome(r, res.data.location ?? {}, res.data.pendingMask ?? "");
    if (!outcome) continue;
    await admin.from("gbp_changes").update(outcome).eq("id", r.id);
    updated++;
  }
  return { updated };
}
