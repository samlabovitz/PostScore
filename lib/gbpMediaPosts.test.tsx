import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { isFresh, monthsAgo, photoSummary, postSummary, type LocalPost, type MediaItem } from "./gbpMediaPosts";
import { levers, listingGroups } from "./googleProfileTab";
import { t } from "./i18n";

// Phase E: photos and Google posts from Google's v4 lists — only the
// summaries are kept. Saved sample JSON, no live calls.

const F = JSON.parse(readFileSync("lib/fixtures/gbp-v4/media-and-posts.json", "utf8")) as { media: { mediaItems: MediaItem[] }; posts: { localPosts: LocalPost[] } };
const NOW = Date.parse("2026-11-15T12:00:00Z");

describe("photo and post summaries", () => {
  test("photos: the count (videos left out) and the newest one's date", () => {
    expect(photoSummary(F.media.mediaItems)).toEqual({ count: 4, newestAt: "2026-09-09T15:45:23Z" });
    expect(photoSummary([])).toEqual({ count: 0, newestAt: null });
    expect(monthsAgo("2026-09-09T15:45:23Z", NOW)).toBe(2);
    expect(isFresh("2026-09-09T15:45:23Z", NOW)).toBe(false);
    expect(isFresh("2026-11-01T00:00:00Z", NOW)).toBe(true);
  });

  test("posts: how many in the last 30 days (rejected ones left out), the last one's date and type", () => {
    expect(postSummary(F.posts.localPosts, NOW)).toEqual({ last30: 2, lastAt: "2026-11-10T12:00:00Z", lastType: "STANDARD" });
    expect(postSummary([], NOW)).toEqual({ last30: 0, lastAt: null, lastType: null });
  });
});

describe("the levers and rows from real photos and posts", () => {
  const lever = (media: Parameters<typeof levers>[0]["media"], id: "photos" | "posts") => levers({ businessId: "b1", replies: null, couponsRunning: 0, website: null, media, now: NOW }).find((l) => l.id === id)!;
  test("photos lever: “newest N mo ago” → Add 3 (amber) / Done (green within 30 days)", () => {
    const old = lever({ photos: { count: 4, newestAt: "2026-09-09T15:45:23Z" }, posts: null, checkedAt: null }, "photos");
    expect([old.status, old.pill, old.tone, old.params.months]).toEqual(["newest", "add3", "warn", 2]);
    expect(t("en", `dashboard.googleTab.lever.photos.status.${old.status}` as never, old.params)).toBe("newest 2 mo ago");
    expect(lever({ photos: { count: 9, newestAt: "2026-11-01T00:00:00Z" }, posts: null, checkedAt: null }, "photos")).toMatchObject({ pill: "done", tone: "ok" });
    expect(lever(null, "photos")).toMatchObject({ status: "soon", tone: "neutral" });
  });

  test("posts lever: “{N} in 30 days” / “none in 30 days” → Post (red at 0, amber at 1) / Done (green at 2+), to the post ideas", () => {
    const none = lever({ photos: null, posts: { last30: 0, lastAt: null, lastType: null }, checkedAt: null }, "posts");
    expect([none.status, none.pill, none.tone, none.href]).toEqual(["none", "post", "bad", "/business/b1/growth#ways-to-grow"]);
    expect(lever({ photos: null, posts: { last30: 1, lastAt: "2026-11-10T00:00:00Z", lastType: "STANDARD" }, checkedAt: null }, "posts")).toMatchObject({ pill: "post", tone: "warn" });
    expect(lever({ photos: null, posts: { last30: 2, lastAt: "2026-11-10T00:00:00Z", lastType: "STANDARD" }, checkedAt: null }, "posts")).toMatchObject({ pill: "done", tone: "ok" });
  });

  test("rows: photos ✓ within 30 days / ! older; posts ✓ with one in 30 days / ! with none", () => {
    const rows = (media: Parameters<typeof levers>[0]["media"]) => listingGroups({ businessId: "b1", checks: [], phone: null, website: null, category: null, openingHours: null, photoCount: 10, rating: null, reviewCount: null, messagingOn: null, replies: null, media, now: NOW }).flatMap((g) => g.rows);
    const hx = rows({ photos: { count: 4, newestAt: "2026-09-09T15:45:23Z" }, posts: { last30: 0, lastAt: null, lastType: null }, checkedAt: null });
    expect(hx.find((r) => r.id === "photos")).toMatchObject({ status: "warn", value: "4", meta: { kind: "read", months: "2" } });
    expect(hx.find((r) => r.id === "posts")).toMatchObject({ status: "warn", meta: { kind: "none" } });
    const fresh = rows({ photos: { count: 12, newestAt: "2026-11-01T00:00:00Z" }, posts: { last30: 2, lastAt: "2026-11-10T00:00:00Z", lastType: "STANDARD" }, checkedAt: null });
    expect(fresh.find((r) => r.id === "photos")!.status).toBe("ok");
    expect(fresh.find((r) => r.id === "posts")).toMatchObject({ status: "ok", value: "2" });
    // Before the first read: the scan's count, posts “coming soon”.
    expect(rows(null).find((r) => r.id === "posts")!.status).toBe("soon");
  });
});
