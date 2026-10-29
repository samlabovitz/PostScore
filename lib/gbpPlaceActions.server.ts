// Server-only. The owner's own Google "Order online" / "Reservations" /
// "Appointments" links (My Business Place Actions API): read them, add the
// platform link that sits in the website spot (after the owner approves),
// and undo that within 7 days. Every call through gbpFetch.
// Docs: https://developers.google.com/my-business/reference/placeactions/rest/v1/locations.placeActionLinks
import "server-only";
import { randomUUID } from "crypto";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { approvalAllowed } from "@/lib/gbpAttributes";
import type { GbpChangeStore, GbpEditError, GbpEditTarget } from "@/lib/gbpAttributes.server";
import { existingLinkFor, type PlaceActionLink, type WebsitePlatform } from "@/lib/gbpPlaceActions";
import { placeActionTypeFor } from "@/lib/socialLinkCheck";

const BASE = "https://mybusinessplaceactions.googleapis.com/v1";
const DAY_MS = 24 * 60 * 60 * 1000;
/** "not_enabled_google": the Place Actions API isn't enabled on our Google Cloud project. */
export type PlaceActionError = GbpEditError | "not_enabled_google";

type Call<T> = { ok: true; data: T } | { ok: false; error: PlaceActionError; status: number | null; reason: string | null };

async function call<T>(f: typeof fetch, token: string, url: string, init: RequestInit = {}): Promise<Call<T>> {
  let res: Response;
  try {
    res = await f(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  } catch {
    return { ok: false, error: "failed", status: null, reason: "network" };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { status?: string; details?: Array<{ reason?: string }> } } | null;
    const reason = body?.error?.details?.find((d) => typeof d.reason === "string")?.reason ?? body?.error?.status ?? null;
    const error: PlaceActionError =
      reason === "SERVICE_DISABLED" ? "not_enabled_google" : res.status === 401 ? "reconnect" : res.status === 403 ? "permission" : res.status === 429 ? "rate_limited" : res.status === 400 ? "rejected" : "failed";
    return { ok: false, error, status: res.status, reason };
  }
  return { ok: true, data: ((await res.json().catch(() => ({}))) ?? {}) as T };
}

/** Every ordering / booking link on the location (read-only). */
export async function listPlaceActionLinks(target: Pick<GbpEditTarget, "accessToken" | "locationName">, fetchImpl: typeof fetch = fetch): Promise<Call<PlaceActionLink[]>> {
  const counter = { calls: 0 };
  const f = gbpFetch(counter, fetchImpl);
  const out: PlaceActionLink[] = [];
  let pageToken: string | undefined;
  try {
    for (let page = 0; page < 5; page++) {
      const url = new URL(`${BASE}/${target.locationName}/placeActionLinks`);
      url.searchParams.set("pageSize", "50");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await call<{ placeActionLinks?: PlaceActionLink[]; nextPageToken?: string }>(f, target.accessToken, url.toString());
      if (!res.ok) return res;
      out.push(...(res.data.placeActionLinks ?? []));
      pageToken = res.data.nextPageToken;
      if (!pageToken) break;
    }
    return { ok: true, data: out };
  } finally {
    logGbpCalls("place-actions-list", counter);
  }
}

export type AddLinkResult =
  | { status: "sent"; batchId: string; link: PlaceActionLink }
  /** Google already has it (added on Google, or by someone else). */
  | { status: "already" }
  | { status: "error"; error: PlaceActionError };

/** "Add to 'Order online' on Google": ONE create, logged, undoable. */
export async function addPlatformLink(target: GbpEditTarget, platform: WebsitePlatform, store: GbpChangeStore, fetchImpl: typeof fetch = fetch, now: number = Date.now()): Promise<AddLinkResult> {
  const type = placeActionTypeFor(platform.kind);
  if (!type) return { status: "error", error: "rejected" };
  const approvals = await store.approvalsSince(target.businessId, new Date(now - DAY_MS).toISOString());
  if (approvals === null) return { status: "error", error: "not_enabled" };
  const allowed = approvalAllowed(approvals, now);
  if (allowed !== "ok") return { status: "error", error: allowed };

  const current = await listPlaceActionLinks(target, fetchImpl);
  if (!current.ok) return { status: "error", error: current.error };
  if (existingLinkFor(platform, current.data)) return { status: "already" };

  const counter = { calls: 0 };
  const f = gbpFetch(counter, fetchImpl);
  const created = await call<PlaceActionLink>(f, target.accessToken, `${BASE}/${target.locationName}/placeActionLinks`, {
    method: "POST",
    body: JSON.stringify({ uri: platform.url, placeActionType: type }),
  });
  logGbpCalls("place-actions-create", counter);
  const batchId = randomUUID();
  await store.insert([
    {
      business_id: target.businessId,
      batch_id: batchId,
      kind: "place_action",
      field: created.ok && created.data.name ? created.data.name : `${target.locationName}/placeActionLinks/(not created)`,
      before_value: null,
      after_value: platform.url,
      approved_by: target.userId,
      approved_at: new Date(now).toISOString(),
      status: created.ok ? "sent" : "failed",
      error_reason: created.ok ? null : (created.reason ?? (created.status ? String(created.status) : null)),
    },
  ]);
  if (!created.ok) return { status: "error", error: created.error };
  return { status: "sent", batchId, link: created.data };
}

/** Undo: delete the link we created — only if it's still there. */
export async function removeAddedLink(target: GbpEditTarget, linkName: string, batchId: string, store: GbpChangeStore, fetchImpl: typeof fetch = fetch, now: number = Date.now()): Promise<{ status: "sent" } | { status: "error"; error: PlaceActionError | "changed_since" }> {
  if (!linkName.startsWith(`${target.locationName}/placeActionLinks/`)) return { status: "error", error: "rejected" };
  const current = await listPlaceActionLinks(target, fetchImpl);
  if (!current.ok) return { status: "error", error: current.error };
  if (!current.data.some((l) => l.name === linkName)) return { status: "error", error: "changed_since" };
  const counter = { calls: 0 };
  const res = await call(gbpFetch(counter, fetchImpl), target.accessToken, `${BASE}/${linkName}`, { method: "DELETE" });
  logGbpCalls("place-actions-delete", counter);
  const at = new Date(now).toISOString();
  await store.insert([
    { business_id: target.businessId, batch_id: randomUUID(), kind: "place_action", field: linkName, before_value: null, after_value: null, approved_by: target.userId, approved_at: at, status: res.ok ? "sent" : "failed", error_reason: res.ok ? null : res.reason, undo_of: batchId },
  ]);
  if (!res.ok) return { status: "error", error: res.error };
  await store.markUndone(batchId, at);
  return { status: "sent" };
}
