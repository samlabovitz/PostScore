// Server-only. Reads the listing's photos (v4 media) and Google posts (v4
// localPosts) and keeps only their summaries on gbp_connections
// (lib/gbpMediaPosts.ts, supabase/gbp-step3.sql). Read only. Runs on each
// scan and when the Google Profile tab opens if the last check is over 24
// hours old. A 401 is refreshed once; any failure keeps the stored values.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessTokenWithClient, markGbpReconnect } from "@/lib/gbpTokens.server";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { photoSummary, photoTimesOf, postSummary, type LocalPost, type MediaItem, type MediaPostsState } from "@/lib/gbpMediaPosts";
import type { GbpPhotoTimes } from "@/lib/scanChanges";

const V4 = "https://mybusiness.googleapis.com/v4";
const MAX_PAGES = 10;
const STALE_MS = 24 * 60 * 60 * 1000;

type Page<T> = { ok: true; items: T[]; next: string | null } | { ok: false; status: number | null };

async function page<T>(f: typeof fetch, token: string, url: string, key: string): Promise<Page<T>> {
  try {
    const res = await f(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { ok: false, status: res.status };
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: true, items: (body[key] as T[] | undefined) ?? [], next: (body.nextPageToken as string | undefined) || null };
  } catch {
    return { ok: false, status: null };
  }
}

async function all<T>(f: typeof fetch, token: string, base: string, key: string): Promise<{ ok: true; items: T[]; capped: boolean } | { ok: false; status: number | null }> {
  const items: T[] = [];
  let next: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const url = new URL(base);
    url.searchParams.set("pageSize", "100");
    if (next) url.searchParams.set("pageToken", next);
    const p = await page<T>(f, token, url.toString(), key);
    if (!p.ok) return p;
    items.push(...p.items);
    next = p.next;
    if (!next) break;
  }
  return { ok: true, items, capped: next !== null };
}

export async function refreshPhotosAndPosts(
  admin: SupabaseClient,
  businessId: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date()
): Promise<{ ok: boolean; error?: string; /** When each photo was added, for this scan's "3 photos added" (in memory only). */ photoTimes?: GbpPhotoTimes }> {
  const { data: conn } = await admin.from("gbp_connections").select("status, google_account_id, google_location_id").eq("business_id", businessId).maybeSingle();
  const c = conn as { status?: string; google_account_id?: string | null; google_location_id?: string | null } | null;
  if (c?.status !== "connected" || !c.google_account_id || !c.google_location_id) return { ok: false, error: "not connected" };
  const base = `${V4}/${c.google_account_id}/${c.google_location_id}`;
  const counter = { calls: 0 };
  const f = gbpFetch(counter, fetchImpl);
  try {
    let token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl, now.getTime());
    if (token.status !== "ok") return { ok: false, error: `token ${token.reason}` };
    const read = async (t: string) => Promise.all([all<MediaItem>(f, t, `${base}/media`, "mediaItems"), all<LocalPost>(f, t, `${base}/localPosts`, "localPosts")]);
    let [media, posts] = await read(token.accessToken);
    if ((!media.ok && media.status === 401) || (!posts.ok && posts.status === 401)) {
      const checked = await markGbpReconnect(admin, businessId, fetchImpl);
      if (checked.status === "error" && checked.reason === "reconnect") return { ok: false, error: "reconnect" };
      token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl);
      if (token.status !== "ok") return { ok: false, error: "token" };
      [media, posts] = await read(token.accessToken);
    }
    const update: Record<string, unknown> = {};
    const photoTimes = media.ok ? photoTimesOf(media.items, media.capped) : undefined;
    if (media.ok) {
      const p = photoSummary(media.items);
      Object.assign(update, { photo_count: p.count, newest_photo_at: p.newestAt, photos_checked_at: now.toISOString() });
    }
    if (posts.ok) {
      const p = postSummary(posts.items, now.getTime());
      Object.assign(update, { posts_last_30_days: p.last30, last_post_at: p.lastAt, last_post_type: p.lastType, posts_checked_at: now.toISOString() });
    }
    if (Object.keys(update).length > 0) await admin.from("gbp_connections").update(update).eq("business_id", businessId);
    if (!media.ok || !posts.ok) {
      console.warn(`[gbp-media-posts] read failed`, JSON.stringify({ media: media.ok ? "ok" : media.status, posts: posts.ok ? "ok" : posts.status }));
      return { ok: false, error: `media ${media.ok ? "ok" : media.status} posts ${posts.ok ? "ok" : posts.status}`, photoTimes };
    }
    return { ok: true, photoTimes };
  } finally {
    logGbpCalls("media-posts", counter);
  }
}

export async function loadPhotosAndPosts(db: SupabaseClient, businessId: string): Promise<MediaPostsState & { stale: boolean }> {
  const { data, error } = await db.from("gbp_connections").select("photo_count, newest_photo_at, photos_checked_at, posts_last_30_days, last_post_at, last_post_type, posts_checked_at").eq("business_id", businessId).maybeSingle();
  if (error || !data) return { photos: null, posts: null, checkedAt: null, stale: true };
  const d = data as Record<string, unknown>;
  const checked = [d.photos_checked_at, d.posts_checked_at].filter((x): x is string => typeof x === "string").sort()[0] ?? null;
  return {
    photos: d.photos_checked_at ? { count: Number(d.photo_count) || 0, newestAt: (d.newest_photo_at as string | null) ?? null } : null,
    posts: d.posts_checked_at ? { last30: Number(d.posts_last_30_days) || 0, lastAt: (d.last_post_at as string | null) ?? null, lastType: (d.last_post_type as string | null) ?? null } : null,
    checkedAt: checked,
    stale: !checked || Date.now() - Date.parse(checked) > STALE_MS,
  };
}
