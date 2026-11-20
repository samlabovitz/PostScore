import { describe, expect, test, vi } from "vitest";

// Day 23E: this week's Google post — Google's post rules (EN + ES), the
// button, the owner's photos, the post's state, one a day, the plain
// drafts, and the publish flow on practice mode's fake Google (save first
// → create → read back → "Waiting for Google" → live / not accepted),
// a 401 refreshed once, Undo, and the post's text never saved.

vi.mock("server-only", () => ({}));
const outcome = vi.hoisted(() => ({ value: "accept" as "accept" | "refuse" | "hold" }));
vi.mock("@/lib/gbpProfilePractice.server", () => ({ practiceOutcomeOf: () => outcome.value }));

import { POST_MAX, callToAction, ctaChoices, goodToKnowText, latestPost, postPhotos, postProblems, postStateOf, postTemplate, postedToday, readStoredPost, weekStartOf, type PostFacts, type PostRow } from "@/lib/gbpPosts";
import { publishPost, readPostStatus, undoPost, type PostStore, type PostTarget } from "@/lib/gbpPosts.server";
import { PRACTICE_MEDIA, PRACTICE_POST_PARENT, practicePostFetch } from "@/lib/gbpPostsPractice.server";
import { inSitting } from "@/lib/gbpAttributes";

const FACTS: PostFacts = { name: "Hair Express", category: "Hair salon", city: "Tarrytown", services: ["Haircut", "Color"], prices: [], differentiator: null, hasBooking: true };

describe("Google's post rules", () => {
  test("phone numbers, links, ALL CAPS, '!!!', too long, rewards for reviews — EN and ES", () => {
    expect(postProblems("Fresh color this week at Hair Express. Book online anytime.")).toEqual([]);
    expect(postProblems("Call us at (914) 320-3012 today")).toContain("phone");
    expect(postProblems("Llámenos al 914-320-3012")).toContain("phone");
    expect(postProblems("See hairexpress.com for more")).toContain("link");
    expect(postProblems("Visite https://example.org")).toContain("link");
    expect(postProblems("HUGE SALE THIS WEEKEND ONLY")).toContain("caps");
    expect(postProblems("Come in today!!!")).toContain("caps");
    expect(postProblems("x".repeat(POST_MAX + 1))).toContain("too_long");
    expect(postProblems("Leave us a review and get 10% off your next visit")).toContain("incentive");
    expect(postProblems("Déjenos una reseña y reciba un descuento")).toContain("incentive");
    expect(postProblems("   ")).toEqual(["empty"]);
    // An offer on its own is fine in a post.
    expect(postProblems("20% off color all week.")).toEqual([]);
  });

  test("the button: Book (booking link), Learn more (website), Call (the listing's phone), or none — https only", () => {
    expect(ctaChoices({ booking: "https://book.example/x", website: "https://hairexpress.com", phone: "(914) 320-3012" }).map((c) => c.type)).toEqual(["BOOK", "LEARN_MORE", "CALL", "NONE"]);
    expect(ctaChoices({ booking: "http://insecure.example", website: null, phone: null }).map((c) => c.type)).toEqual(["NONE"]);
    expect(callToAction({ type: "CALL", url: null })).toEqual({ actionType: "CALL" });
    expect(callToAction({ type: "BOOK", url: "https://book.example/x" })).toEqual({ actionType: "BOOK", url: "https://book.example/x" });
    expect(callToAction({ type: "NONE", url: null })).toBeUndefined();
  });

  test("the owner's photos: photos only, not the logo, at least 400×300, newest first", () => {
    const photos = postPhotos([
      { name: "a/media/1", mediaFormat: "PHOTO", googleUrl: "g1", createTime: "2026-09-01T00:00:00Z", dimensions: { widthPixels: 1200, heightPixels: 900 } },
      { name: "a/media/2", mediaFormat: "VIDEO", googleUrl: "g2", createTime: "2026-10-01T00:00:00Z" },
      { name: "a/media/3", mediaFormat: "PHOTO", googleUrl: "g3", createTime: "2026-10-02T00:00:00Z", locationAssociation: { category: "LOGO" } },
      { name: "a/media/4", mediaFormat: "PHOTO", googleUrl: "g4", createTime: "2026-10-03T00:00:00Z", dimensions: { widthPixels: 300, heightPixels: 300 } },
      { name: "a/media/5", mediaFormat: "PHOTO", googleUrl: "g5", thumbnailUrl: "t5", createTime: "2026-11-01T00:00:00Z" },
    ]);
    expect(photos.map((p) => p.name)).toEqual(["a/media/5", "a/media/1"]);
    expect(photos[0].thumb).toBe("t5");
  });

  test("Google's state: PROCESSING is still waiting; LIVE; REJECTED", () => {
    expect(postStateOf("PROCESSING")).toBe("waiting");
    expect(postStateOf(undefined)).toBe("waiting");
    expect(postStateOf("LIVE")).toBe("live");
    expect(postStateOf("REJECTED")).toBe("rejected");
  });

  test("one post a day (the business's day), the latest still up, the week's Monday", () => {
    const row = (approved_at: string, extra: Partial<PostRow> = {}): PostRow => ({ id: "r", batch_id: "b", after_value: JSON.stringify({ name: "p/1", kind: "week", cta: "BOOK", hasPhoto: true, length: 80 }), approved_at, status: "sent", undone_at: null, ...extra });
    const now = Date.parse("2026-11-20T15:00:00Z");
    expect(postedToday([row("2026-11-20T13:00:00Z")], now, "America/New_York")).toBe(true);
    expect(postedToday([row("2026-11-20T03:00:00Z")], now, "America/New_York")).toBe(false); // Nov 19 in New York
    expect(postedToday([row("2026-11-20T13:00:00Z", { undone_at: "2026-11-20T14:00:00Z" })], now, "America/New_York")).toBe(false);
    expect(latestPost([row("2026-11-18T13:00:00Z"), row("2026-11-19T13:00:00Z", { status: "failed" })])?.approved_at).toBe("2026-11-18T13:00:00Z");
    expect(weekStartOf(now, "America/New_York")).toBe("2026-11-16");
    expect(readStoredPost('{"name":"p/1","kind":"good_to_know","cta":"CALL","hasPhoto":false,"length":10}')).toMatchObject({ kind: "good_to_know", cta: "CALL" });
  });

  test("the plain drafts keep Google's rules, EN and ES (usted)", () => {
    for (const topic of ["hair", "barber", "nails", "restaurant", "art", "home", "default"] as const) {
      expect(postProblems(postTemplate(topic, "en", FACTS))).toEqual([]);
      expect(postProblems(postTemplate(topic, "es", FACTS))).toEqual([]);
    }
    expect(postTemplate("hair", "es", FACTS)).toContain("le ayudan");
    expect(postTemplate("hair", "en", FACTS)).toContain("Book online");
  });

  test("'Good to know': only the answers given, nothing invented", () => {
    expect(goodToKnowText("Hair Express", ["free parking lot", "we accept credit cards"], "en")).toBe("Good to know about Hair Express: free parking lot, we accept credit cards. Any other questions? We're happy to help.");
    expect(goodToKnowText("Hair Express", [], "en")).toBeNull();
    expect(goodToKnowText("Hair Express", ["estacionamiento gratis"], "es")).toContain("Bueno saber sobre Hair Express");
  });
});

// ---------------------------------------------------------------------------
// Publishing, on practice mode's fake Google.
// ---------------------------------------------------------------------------

function memoryStore(init: { approvals?: string[] } = {}) {
  const rows: Array<Record<string, unknown> & { id: string }> = [];
  const logs: Array<Record<string, unknown>> = [];
  const store: PostStore = {
    approvalsSince: async () => init.approvals ?? rows.map((r) => r.approved_at as string),
    editLogReady: async () => true,
    batchRows: async (_b, batchId) => rows.filter((r) => r.batch_id === batchId) as never,
    insert: async (row) => {
      const id = `row-${rows.length + 1}`;
      rows.push({ ...row, id });
      return id;
    },
    update: async (id, patch) => {
      Object.assign(rows.find((r) => r.id === id)!, patch);
    },
    markUndone: async (_b, batchId, at) => {
      rows.filter((r) => r.batch_id === batchId).forEach((r) => (r.undone_at = at));
    },
    logEdit: async (row) => {
      logs.push(row as never);
    },
    postRows: async () => rows.map((r) => ({ id: r.id, batch_id: r.batch_id as string, after_value: r.after_value as string, approved_at: r.approved_at as string, status: r.status as string, undone_at: (r.undone_at as string) ?? null })),
  };
  return { store, rows, logs };
}

const target = (): PostTarget => ({ businessId: "b-posts", userId: "u1", parent: PRACTICE_POST_PARENT, accessToken: "practice-token", languageCode: "en" });
const TEXT = "Fresh color, fresh start at Hair Express this week. Book online anytime.";
// "Hair Express" is never a typo of "espresso" (running text: 1-letter slips only).
const input = (extra: Partial<Parameters<typeof publishPost>[1]> = {}) => ({ text: TEXT, cta: { type: "BOOK" as const, url: "https://book.example/x" }, photoName: PRACTICE_MEDIA[0].name, kind: "week" as const, timeZone: "America/New_York", ...extra });

describe("publish → waiting → live (practice mode)", () => {
  test("saved first, created, read back: 'Waiting for Google', then live with its link; the text is never saved", async () => {
    outcome.value = "accept";
    const { store, rows, logs } = memoryStore();
    const f = practicePostFetch("b-posts-1");
    const t = { ...target(), businessId: "b-posts-1" };
    const r = await publishPost(t, input(), store, { fetchImpl: f, practice: true });
    expect(r).toMatchObject({ status: "published", state: "waiting" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "local_post_practice", field: "post", status: "sent" });
    expect(String(rows[0].after_value)).not.toContain("Fresh color");
    expect(JSON.parse(String(rows[0].after_value))).toMatchObject({ kind: "week", cta: "BOOK", hasPhoto: true, length: TEXT.length });
    expect(logs[0]).toMatchObject({ field: "posts", outcome: "ok", practice: true });
    const s = await readPostStatus(t, (r as { name: string }).name, { fetchImpl: f });
    expect(s).toEqual({ status: "ok", state: "live", searchUrl: "https://www.google.com/search?q=practice+post" });
  });

  test("Google holds it (still waiting) or refuses it (not accepted)", async () => {
    outcome.value = "hold";
    const held = await publishPost({ ...target(), businessId: "b-hold" }, input(), memoryStore().store, { fetchImpl: practicePostFetch("b-hold"), practice: true });
    expect(held).toMatchObject({ status: "published", state: "waiting" });
    outcome.value = "refuse";
    const refused = await publishPost({ ...target(), businessId: "b-refuse" }, input(), memoryStore().store, { fetchImpl: practicePostFetch("b-refuse"), practice: true });
    expect(refused).toMatchObject({ status: "published", state: "rejected" });
    outcome.value = "accept";
  });

  test("nothing sent when a rule is broken, a post already went up today, or the photo isn't this listing's", async () => {
    const f = vi.fn(practicePostFetch("b-rules"));
    const m = memoryStore();
    expect(await publishPost(target(), input({ text: "Call 914-320-3012" }), m.store, { fetchImpl: f, practice: true })).toEqual({ status: "invalid", problems: ["phone"] });
    expect(await publishPost(target(), input({ photoName: "accounts/9/locations/9/media/x" }), m.store, { fetchImpl: f, practice: true })).toEqual({ status: "error", error: "photo_gone" });
    expect(f).not.toHaveBeenCalled();
    await publishPost(target(), input(), m.store, { fetchImpl: f, practice: true, now: Date.parse("2026-11-20T15:00:00Z") });
    expect(await publishPost(target(), input(), m.store, { fetchImpl: f, practice: true, now: Date.parse("2026-11-20T18:00:00Z") })).toEqual({ status: "posted_today" });
  });

  test("the approval limits: one a minute — except inside an Approve all sitting", async () => {
    const now = Date.parse("2026-11-20T15:00:00Z");
    const recent = new Date(now - 10_000).toISOString();
    const m = memoryStore({ approvals: [recent] });
    expect(await publishPost(target(), input(), m.store, { fetchImpl: practicePostFetch("b-limit"), practice: true, now })).toEqual({ status: "error", error: "wait_minute" });
    // The sitting started before that approval (made by the sitting itself): not held back.
    const r = await publishPost(target(), input(), inSitting(m.store, now - 20_000), { fetchImpl: practicePostFetch("b-limit"), practice: true, now });
    expect(r.status).toBe("published");
  });

  test("a 401 is refreshed once and tried again", async () => {
    const real = practicePostFetch("b-401");
    let first = true;
    const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (first && String(url).endsWith("/localPosts")) {
        first = false;
        return new Response("{}", { status: 401 });
      }
      return real(url, init);
    }) as typeof fetch;
    const refresh = vi.fn(async () => "fresh-token");
    const r = await publishPost({ ...target(), businessId: "b-401" }, input({ photoName: null }), memoryStore().store, { fetchImpl: f, practice: true, refreshToken: refresh });
    expect(r.status).toBe("published");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("Remove from Google: deletes the post within 7 days", async () => {
    const m = memoryStore();
    const f = practicePostFetch("b-undo");
    const t = { ...target(), businessId: "b-undo" };
    const r = (await publishPost(t, input(), m.store, { fetchImpl: f, practice: true })) as { batchId: string; name: string };
    expect(await undoPost(t, r.batchId, m.store, { fetchImpl: f, practice: true })).toEqual({ status: "undone" });
    expect(await readPostStatus(t, r.name, { fetchImpl: f })).toEqual({ status: "gone" });
    expect(await undoPost(t, r.batchId, m.store, { fetchImpl: f, practice: true })).toEqual({ status: "error", error: "undo_expired" });
  });
});
