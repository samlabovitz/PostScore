// Server-only. Practice mode's fake Google for Day 23E's posts: answers the
// v4 media list (two sample photos) and localPosts calls from memory —
// nothing is ever sent to Google. Refused in production with the rest of
// practice mode (lib/gbpReviewPractice.ts). What Google does with a new
// post follows practice mode's outcome switch (lib/gbpProfilePractice.server.ts):
//   accept → PROCESSING, then LIVE on the second read (with a link);
//   hold   → stays PROCESSING ("Waiting for Google");
//   refuse → REJECTED.
import "server-only";
import { PRACTICE_PHOTO_PARENT } from "@/lib/gbpPhotosPractice.server";
import { practiceOutcomeOf } from "@/lib/gbpProfilePractice.server";

export const PRACTICE_POST_PARENT = PRACTICE_PHOTO_PARENT;

interface PracticePost {
  name: string;
  summary: string;
  outcome: "accept" | "refuse" | "hold";
  reads: number;
}

const g = globalThis as unknown as { __practicePosts?: Map<string, Map<string, PracticePost>> };
const store = (g.__practicePosts ??= new Map());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const swatch = (fill: string, label: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="${fill}"/><text x="320" y="250" font-family="sans-serif" font-size="36" text-anchor="middle" fill="#fff">${label}</text></svg>`)}`;

/** The practice listing's two sample photos. */
export const PRACTICE_MEDIA = [
  { name: `${PRACTICE_PHOTO_PARENT}/media/sample-interior`, mediaFormat: "PHOTO", googleUrl: swatch("#1f2a44", "Sample: inside"), thumbnailUrl: swatch("#1f2a44", "Sample: inside"), createTime: "2026-10-28T15:00:00Z", dimensions: { widthPixels: 1200, heightPixels: 900 }, locationAssociation: { category: "INTERIOR" } },
  { name: `${PRACTICE_PHOTO_PARENT}/media/sample-work`, mediaFormat: "PHOTO", googleUrl: swatch("#9a7b3f", "Sample: work"), thumbnailUrl: swatch("#9a7b3f", "Sample: work"), createTime: "2026-09-12T15:00:00Z", dimensions: { widthPixels: 1200, heightPixels: 900 }, locationAssociation: { category: "AT_WORK" } },
];

/** A fetch that answers like v4 media + localPosts for the practice listing. */
export function practicePostFetch(businessId: string): typeof fetch {
  const posts = store.get(businessId) ?? new Map<string, PracticePost>();
  store.set(businessId, posts);
  let n = 0;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.hostname !== "mybusiness.googleapis.com") return json({ error: { status: "NOT_FOUND" } }, 404);
    const path = decodeURIComponent(url.pathname).replace(/^\/v4\//, "");
    if (path === `${PRACTICE_PHOTO_PARENT}/media` && method === "GET") return json({ mediaItems: PRACTICE_MEDIA });
    const media = PRACTICE_MEDIA.find((m) => m.name === path);
    if (media && method === "GET") return json(media);
    if (path === `${PRACTICE_PHOTO_PARENT}/localPosts` && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { summary?: string };
      if (!body.summary) return json({ error: { status: "INVALID_ARGUMENT" } }, 400);
      const name = `${PRACTICE_PHOTO_PARENT}/localPosts/practice-${Date.now()}-${++n}`;
      const post: PracticePost = { name, summary: body.summary, outcome: practiceOutcomeOf(businessId), reads: 0 };
      posts.set(name, post);
      return json({ name, state: post.outcome === "refuse" ? "REJECTED" : "PROCESSING", summary: post.summary });
    }
    const post = posts.get(path);
    if (post && method === "GET") {
      post.reads++;
      const state = post.outcome === "refuse" ? "REJECTED" : post.outcome === "accept" && post.reads >= 2 ? "LIVE" : "PROCESSING";
      return json({ name: post.name, state, summary: post.summary, ...(state === "LIVE" ? { searchUrl: "https://www.google.com/search?q=practice+post" } : {}) });
    }
    if (method === "DELETE") return posts.delete(path) ? json({}) : json({ error: { status: "NOT_FOUND" } }, 404);
    return json({ error: { status: "NOT_FOUND" } }, 404);
  }) as typeof fetch;
}

export function practicePostCount(businessId: string): number {
  return store.get(businessId)?.size ?? 0;
}
