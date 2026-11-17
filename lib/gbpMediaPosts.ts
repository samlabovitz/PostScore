// Photos and Google posts on the listing, summed up from Google's v4 media
// and localPosts lists (lib/gbpMediaPosts.server.ts). Only these summaries
// are kept (gbp_connections: photo_count, newest_photo_at,
// posts_last_30_days, last_post_at, last_post_type) — never the photos or
// the posts. Pure.

const DAY_MS = 86_400_000;
/** A photo or post newer than this is "fresh". */
export const FRESH_DAYS = 30;

export interface MediaItem {
  mediaFormat?: string;
  createTime?: string;
}
export interface LocalPost {
  createTime?: string;
  topicType?: string;
  state?: string;
}

export interface PhotoSummary {
  count: number;
  newestAt: string | null;
}
export interface PostSummary {
  last30: number;
  lastAt: string | null;
  lastType: string | null;
}

export function photoSummary(items: MediaItem[]): PhotoSummary {
  const photos = items.filter((m) => (m.mediaFormat ?? "PHOTO") === "PHOTO");
  const newest = photos.map((m) => m.createTime).filter((t): t is string => !!t && Number.isFinite(Date.parse(t))).sort().pop() ?? null;
  return { count: photos.length, newestAt: newest };
}

/** When each photo was added (photos only, like photoSummary). */
export function photoTimesOf(items: MediaItem[], capped: boolean): { createTimes: string[]; capped: boolean } {
  const photos = items.filter((m) => (m.mediaFormat ?? "PHOTO") === "PHOTO");
  return { createTimes: photos.map((m) => m.createTime).filter((t): t is string => !!t && Number.isFinite(Date.parse(t))), capped };
}

export function postSummary(posts: LocalPost[], now: number): PostSummary {
  const live = posts.filter((p) => p.createTime && Number.isFinite(Date.parse(p.createTime)) && p.state !== "REJECTED");
  const sorted = [...live].sort((a, b) => b.createTime!.localeCompare(a.createTime!));
  return {
    last30: live.filter((p) => now - Date.parse(p.createTime!) <= FRESH_DAYS * DAY_MS).length,
    lastAt: sorted[0]?.createTime ?? null,
    lastType: sorted[0]?.topicType ?? null,
  };
}

/** Whole months since `iso` (0 within the first month). */
export function monthsAgo(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / (30.44 * DAY_MS)));
}

export function isFresh(iso: string | null, now: number): boolean {
  return !!iso && now - Date.parse(iso) <= FRESH_DAYS * DAY_MS;
}

/** What the tab shows: the stored summaries, or null before the first check. */
export interface MediaPostsState {
  photos: PhotoSummary | null;
  posts: PostSummary | null;
  checkedAt: string | null;
}
