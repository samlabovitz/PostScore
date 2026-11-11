// Server-only. The owner's own Google "Order online" / "Reservations" /
// "Appointments" links (My Business Place Actions API): the shared call
// and the read. Adding, changing, removing and undoing a link (always
// after the owner approves, behind practice mode and the live allow list)
// are lib/gbpOrderLink.server.ts. Every call through gbpFetch.
// Docs: https://developers.google.com/my-business/reference/placeactions/rest/v1/locations.placeActionLinks
import "server-only";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import type { GbpEditError, GbpEditTarget } from "@/lib/gbpAttributes.server";
import type { PlaceActionLink } from "@/lib/gbpPlaceActions";

export const PLACE_ACTIONS_BASE = "https://mybusinessplaceactions.googleapis.com/v1";
const BASE = PLACE_ACTIONS_BASE;
/** "not_enabled_google": the Place Actions API isn't enabled on our Google Cloud project. */
export type PlaceActionError = GbpEditError | "not_enabled_google";

export type Call<T> = { ok: true; data: T } | { ok: false; error: PlaceActionError; status: number | null; reason: string | null };

export async function call<T>(f: typeof fetch, token: string, url: string, init: RequestInit = {}): Promise<Call<T>> {
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
