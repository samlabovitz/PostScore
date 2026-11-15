// Server-only. Practice mode's fake Google for "Add photos": answers the
// v4 media calls from memory — nothing is ever sent to Google. Refused in
// production with the rest of practice mode (lib/gbpReviewPractice.ts).
import "server-only";

export const PRACTICE_PHOTO_PARENT = "accounts/practice/locations/practice";

const g = globalThis as unknown as { __practicePhotos?: Map<string, Set<string>> };
const store = (g.__practicePhotos ??= new Map());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A fetch that answers like v4 media for the practice listing. */
export function practicePhotoFetch(businessId: string): typeof fetch {
  const items = store.get(businessId) ?? new Set<string>();
  store.set(businessId, items);
  let n = 0;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.hostname !== "mybusiness.googleapis.com") return json({ error: { status: "NOT_FOUND" } }, 404);
    const path = decodeURIComponent(url.pathname);
    if (path === `/v4/${PRACTICE_PHOTO_PARENT}/media:startUpload` && method === "POST") return json({ resourceName: `practice-ref-${Date.now()}-${++n}` });
    if (path.startsWith("/upload/v1/media/") && method === "POST") return json({});
    if (path === `/v4/${PRACTICE_PHOTO_PARENT}/media` && method === "POST") {
      const name = `${PRACTICE_PHOTO_PARENT}/media/practice-${Date.now()}-${++n}`;
      items.add(name);
      return json({ name, mediaFormat: "PHOTO" });
    }
    const name = path.replace(/^\/v4\//, "");
    if (method === "GET") return items.has(name) ? json({ name }) : json({ error: { status: "NOT_FOUND" } }, 404);
    if (method === "DELETE") return items.delete(name) ? json({}) : json({ error: { status: "NOT_FOUND" } }, 404);
    return json({ error: { status: "INVALID_ARGUMENT" } }, 400);
  }) as typeof fetch;
}

export function practicePhotoCount(businessId: string): number {
  return store.get(businessId)?.size ?? 0;
}
