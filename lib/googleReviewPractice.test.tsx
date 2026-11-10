import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// Testing review replies without posting to a real Google listing:
// - practice mode (REVIEW_REPLIES_PRACTICE=1, never in production) runs
//   the real inbox code against a fake, in-memory Google;
// - otherwise Post / Edit / Delete are refused for any business whose
//   place id isn't in REVIEW_REPLIES_LIVE_PLACES (default: none).
// Plus the calmer list: 3 at a time, Show 10 more / Show all, the sort,
// the summary line and the caught-up state.
// NEVER posts to Google: the real fetch throws in this file.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/gbpTokens.server", () => ({ markGbpReconnect: vi.fn() }));
const gbpEditGate = vi.fn();
vi.mock("@/lib/gbpEditGate.server", () => ({ gbpEditGate: (...a: unknown[]) => gbpEditGate(...a) }));
const getUser = vi.fn(async () => ({ data: { user: { id: "owner-1" } } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser }, from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "b1" } }) }) }) }) }) }),
}));
const getPlan = vi.fn(async () => "premium");
vi.mock("@/lib/premium", () => ({ getPlan: () => getPlan() }));
vi.mock("@/lib/businessArchive.server", () => ({ isBusinessArchived: async () => false }));
const logged: Array<Record<string, unknown>> = [];
const admin = {
  from: (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      order: () => chain,
      limit: async () => ({ data: [], error: null }),
      maybeSingle: async () => ({ data: table === "gbp_connections" ? { google_account_id: "accounts/111" } : { place_id: "ChIJ-hair-express" } }),
      insert: async (row: Record<string, unknown>) => (logged.push(row), { error: null }),
    };
    return chain;
  },
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const realFetch = globalThis.fetch;
const networkCalls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  networkCalls.push(String(input));
  throw new Error(`A test tried to reach the network: ${String(input)}`);
}) as typeof fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { livePostingAllowed, livePostingPlaces, reviewRepliesPracticeOn } from "@/lib/gbpReviewPractice";
import { DELAY_MS, DELAYED_REVIEW_ID, practiceFetch, PRACTICE_ACCOUNT, PRACTICE_LOCATION, PRACTICE_TOKEN, REFUSED_REVIEW_ID, resetPracticeReviews } from "@/lib/gbpReviewPractice.server";
import { changeReplyWithClient, fetchInboxPage, type InboxTarget } from "@/lib/gbpReviewInbox.server";
import { changeGoogleReviewReply, listGoogleReviews } from "@/app/actions/googleReviews";
import { inboxSummary, sortReviews, toInboxReview, visibleReviews, type InboxReview } from "@/lib/gbpReviewInbox";
import { InboxBody } from "@/components/reviews/GoogleReviewsInbox";
import { resetGbpQuota } from "@/lib/gbpQuota";
import { LocaleProvider } from "@/lib/i18n";

const PRACTICE: InboxTarget = { businessId: "b1", userId: "owner-1", accountName: PRACTICE_ACCOUNT, locationName: PRACTICE_LOCATION, accessToken: PRACTICE_TOKEN };
const ENV_KEYS = ["REVIEW_REPLIES_PRACTICE", "REVIEW_REPLIES_LIVE_PLACES", "NODE_ENV"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const setEnv = (vars: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) => {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  }
};

beforeEach(() => {
  resetGbpQuota();
  resetPracticeReviews();
  logged.length = 0;
  networkCalls.length = 0;
  gbpEditGate.mockReset();
  getPlan.mockResolvedValue("premium");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => setEnv(savedEnv));

describe("practice mode: on only with REVIEW_REPLIES_PRACTICE=1, never in production", () => {
  test("development: on; unset or anything but 1: off", () => {
    expect(reviewRepliesPracticeOn({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "development" })).toBe(true);
    expect(reviewRepliesPracticeOn({ NODE_ENV: "development" })).toBe(false);
    expect(reviewRepliesPracticeOn({ REVIEW_REPLIES_PRACTICE: "true", NODE_ENV: "development" })).toBe(false);
  });

  test("production refuses it even when the variable is set", () => {
    expect(reviewRepliesPracticeOn({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "production" })).toBe(false);
  });

  test("in production with the variable set, the actions use the real gate and the allow list — never the fake Google", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "production", REVIEW_REPLIES_LIVE_PLACES: undefined });
    gbpEditGate.mockResolvedValue({ ok: false, result: { status: "blocked", reason: "not_connected" } });
    expect(await listGoogleReviews("b1")).toEqual({ status: "blocked", reason: "not_connected" });
    expect(await changeGoogleReviewReply("b1", "practice-maria", "post", "Thank you!")).toEqual({ status: "blocked", reason: "not_connected" });
    expect(gbpEditGate).toHaveBeenCalledTimes(2);
  });
});

describe("the fake Google behaves like the real API", () => {
  test("8 sample reviews: 1–5 stars, some replied, one Spanish, one Google-translated (the original shown)", async () => {
    const page = await fetchInboxPage(PRACTICE, null, practiceFetch("b1"));
    expect(page.ok).toBe(true);
    const reviews = page.ok ? page.reviews : [];
    expect(reviews).toHaveLength(8);
    expect(new Set(reviews.map((r) => r.stars))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(reviews.filter((r) => r.reply)).toHaveLength(2);
    expect(reviews.find((r) => r.reviewId === "practice-lucia")?.comment).toMatch(/^Excelente servicio/);
    expect(reviews.find((r) => r.reviewId === "practice-joao")?.comment).toBe("O corte ficou bom, mas a espera foi longa.");
    expect(networkCalls).toEqual([]);
  });

  test("post → read back → ok; logged as “practice” with the outcome, never with the text", async () => {
    const out = await changeReplyWithClient(admin as unknown as SupabaseClient, PRACTICE, { action: "post", reviewId: "practice-maria", text: "Thank you, Maria!" }, practiceFetch("b1"), { practice: true });
    expect(out.status === "ok" && out.review.reply?.comment).toBe("Thank you, Maria!");
    expect(logged).toEqual([{ business_id: "b1", user_id: "owner-1", action: "post", review_id: "practice-maria", reply_length: 17, status: "practice", error_reason: "ok" }]);
    // It stays posted: the list shows it as replied now.
    const page = await fetchInboxPage(PRACTICE, null, practiceFetch("b1"));
    expect(page.ok && page.reviews.find((r) => r.reviewId === "practice-maria")?.reply?.comment).toBe("Thank you, Maria!");
    expect(networkCalls).toEqual([]);
  });

  test("“Google refuses the reply”: refused, nothing posted, logged practice / failed", async () => {
    const out = await changeReplyWithClient(admin as unknown as SupabaseClient, PRACTICE, { action: "post", reviewId: REFUSED_REVIEW_ID, text: "Thank you!" }, practiceFetch("b1"), { practice: true });
    expect(out).toEqual({ status: "error", error: "failed", reason: "INVALID_ARGUMENT" });
    expect(logged).toMatchObject([{ status: "practice", error_reason: "failed:INVALID_ARGUMENT" }]);
    const page = await fetchInboxPage(PRACTICE, null, practiceFetch("b1"));
    expect(page.ok && page.reviews.find((r) => r.reviewId === REFUSED_REVIEW_ID)?.reply).toBeNull();
  });

  test("“accepted, not showing yet”: unconfirmed, then it shows 30 seconds later", async () => {
    let now = Date.parse("2026-11-10T12:00:00Z");
    const fake = practiceFetch("b1", () => now);
    const out = await changeReplyWithClient(admin as unknown as SupabaseClient, PRACTICE, { action: "post", reviewId: DELAYED_REVIEW_ID, text: "Thank you!" }, fake, { practice: true });
    expect(out).toEqual({ status: "unconfirmed" });
    expect(logged).toMatchObject([{ status: "practice", error_reason: "unconfirmed:read_back_differs" }]);
    now += DELAY_MS;
    const page = await fetchInboxPage(PRACTICE, null, fake);
    expect(page.ok && page.reviews.find((r) => r.reviewId === DELAYED_REVIEW_ID)?.reply?.comment).toBe("Thank you!");
  });

  test("edit and delete a sample reply", async () => {
    const fake = practiceFetch("b1");
    expect((await changeReplyWithClient(admin as unknown as SupabaseClient, PRACTICE, { action: "edit", reviewId: "practice-james", text: "Thanks so much, James!" }, fake, { practice: true })).status).toBe("ok");
    const deleted = await changeReplyWithClient(admin as unknown as SupabaseClient, PRACTICE, { action: "delete", reviewId: "practice-james", text: null }, fake, { practice: true });
    expect(deleted.status === "ok" && deleted.review.reply).toBeNull();
    expect(logged.map((r) => [r.action, r.status, r.error_reason])).toEqual([["edit", "practice", "ok"], ["delete", "practice", "ok"]]);
  });

  test("the actions in practice mode: no Google connection needed, posting on, nothing sent to Google", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "development" });
    const list = await listGoogleReviews("b1");
    expect(list).toMatchObject({ status: "ok", practice: true, canPost: true });
    expect((await changeGoogleReviewReply("b1", "practice-kevin", "post", "We're sorry about the wait, Kevin.")).status).toBe("ok");
    expect(gbpEditGate).not.toHaveBeenCalled();
    expect(networkCalls).toEqual([]);
  });

  test("practice mode still needs Premium", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "development" });
    getPlan.mockResolvedValue("grow");
    expect(await listGoogleReviews("b1")).toEqual({ status: "blocked", reason: "not_premium" });
  });
});

describe("live posting allow list (practice mode off)", () => {
  const gate = { ok: true, admin, plan: "premium", tokens: {}, business: { id: "b1" }, target: { businessId: "b1", userId: "owner-1", locationName: "locations/222", accessToken: "test-token", locale: "en" } };

  test("REVIEW_REPLIES_LIVE_PLACES: comma-separated place ids; default none", () => {
    expect(livePostingPlaces({})).toEqual([]);
    expect(livePostingAllowed("ChIJ-hair-express", {})).toBe(false);
    expect(livePostingAllowed("ChIJ-hair-express", { REVIEW_REPLIES_LIVE_PLACES: " ChIJ-other , ChIJ-hair-express " })).toBe(true);
    expect(livePostingAllowed(null, { REVIEW_REPLIES_LIVE_PLACES: "ChIJ-hair-express" })).toBe(false);
  });

  test("not on the list: Post, Edit and Delete are refused on the server — nothing sent", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: undefined, REVIEW_REPLIES_LIVE_PLACES: "ChIJ-someone-else" });
    gbpEditGate.mockResolvedValue(gate);
    expect(await changeGoogleReviewReply("b1", "r1", "post", "Thank you!")).toEqual({ status: "posting_off" });
    expect(await changeGoogleReviewReply("b1", "r1", "edit", "Thank you!")).toEqual({ status: "posting_off" });
    expect(await changeGoogleReviewReply("b1", "r1", "delete")).toEqual({ status: "posting_off" });
    expect(networkCalls).toEqual([]);
    expect(logged).toEqual([]);
  });

  test("the real reviews still load read-only (canPost false); on the list, canPost is true", async () => {
    setEnv({ REVIEW_REPLIES_PRACTICE: undefined, REVIEW_REPLIES_LIVE_PLACES: undefined });
    gbpEditGate.mockResolvedValue(gate);
    // A fake Google for the list read only — the real one is never called.
    const fakeList = (async () => new Response(JSON.stringify({ reviews: [], totalReviewCount: 0 }), { status: 200 })) as typeof fetch;
    const throwing = globalThis.fetch;
    globalThis.fetch = fakeList;
    try {
      expect(await listGoogleReviews("b1")).toMatchObject({ status: "ok", practice: false, canPost: false });
      setEnv({ REVIEW_REPLIES_LIVE_PLACES: "ChIJ-hair-express" });
      expect(await listGoogleReviews("b1")).toMatchObject({ status: "ok", canPost: true });
    } finally {
      globalThis.fetch = throwing;
    }
  });
});

describe("a calmer list (EN + ES)", () => {
  const day = (n: number) => new Date(Date.parse("2026-11-10T12:00:00Z") - n * 86_400_000).toISOString();
  const review = (id: string, days: number, stars: number | null, reply: string | null = null): InboxReview =>
    toInboxReview({ reviewId: id, reviewer: { displayName: `Reviewer ${id}` }, starRating: stars ? ["", "ONE", "TWO", "THREE", "FOUR", "FIVE"][stars] : undefined, comment: `Review ${id}`, createTime: day(days), ...(reply ? { reviewReply: { comment: reply } } : {}) })!;
  // 29 need a reply (newest 1 day ago), 1 replied.
  const many = [...Array.from({ length: 29 }, (_, i) => review(`n${i}`, i + 1, (i % 5) + 1)), review("r", 0, 5, "Thanks!")];
  const render = (reviews: InboxReview[], opts: { practice?: boolean; canPost?: boolean; locale?: "en" | "es" } = {}) =>
    renderToStaticMarkup(
      <LocaleProvider locale={opts.locale ?? "en"} timeZone="America/New_York">
        <InboxBody businessId="b1" reviews={reviews} practice={opts.practice ?? false} canPost={opts.canPost ?? true} hasMore={false} onLoadAll={() => {}} onChanged={() => {}} />
      </LocaleProvider>
    );

  test("by default: the 3 newest that need a reply, then “Show 10 more” and “Show all (29)”; the counts stay", () => {
    const html = render(many);
    expect((html.match(/data-testid="google-review"/g) ?? []).length).toBe(3);
    expect(Array.from(html.matchAll(/data-review-id="([^"]+)"/g), (m) => m[1])).toEqual(["n0", "n1", "n2"]);
    expect(html).toMatch(/data-testid="show-more"[^>]*>Show 10 more</);
    expect(html).toMatch(/data-testid="show-all"[^>]*>Show all \(29\)</);
    expect(html).toMatch(/Needs a reply<span[^>]*>29</);
    expect(html).toMatch(/Replied<span[^>]*>1</);
    expect(html).toMatch(/All<span[^>]*>30</);
  });

  test("Show 10 more shows 13, then all; Show all shows every one", () => {
    expect(visibleReviews(many, "needs_reply", "newest", 3 + 10).shown).toHaveLength(13);
    expect(visibleReviews(many, "needs_reply", "newest", 13 + 10).shown).toHaveLength(23);
    expect(visibleReviews(many, "needs_reply", "newest", null)).toMatchObject({ total: 29 });
    expect(visibleReviews(many, "needs_reply", "newest", null).shown).toHaveLength(29);
    // Fewer than 3: no buttons.
    expect(render(many.slice(0, 2))).not.toContain("show-more");
  });

  test("sort: newest first, lowest rating first (unrated last, ties newest), oldest first", () => {
    const list = [review("a", 5, 4), review("b", 1, 2), review("c", 9, 2), review("d", 3, null), review("e", 7, 5)];
    expect(sortReviews(list, "newest").map((r) => r.reviewId)).toEqual(["b", "d", "a", "e", "c"]);
    expect(sortReviews(list, "lowest").map((r) => r.reviewId)).toEqual(["b", "c", "a", "e", "d"]);
    expect(sortReviews(list, "oldest").map((r) => r.reviewId)).toEqual(["c", "e", "a", "d", "b"]);
    // The choice is kept per browser, with storage errors caught.
    const component = readFileSync("components/reviews/GoogleReviewsInbox.tsx", "utf8");
    expect(component).toMatch(/try \{\n\s+const saved = window\.localStorage\.getItem\(SORT_STORAGE_KEY\)/);
    expect(component).toMatch(/try \{\n\s+window\.localStorage\.setItem\(SORT_STORAGE_KEY, sort\)/);
  });

  test("the summary line: “29 reviews need a reply · newest from Nov 9, 2026”, and in Spanish", () => {
    expect(inboxSummary(many)).toEqual({ kind: "needs_reply", count: 29, newestAt: day(1) });
    expect(render(many)).toContain("29 reviews need a reply · newest from Nov 9, 2026");
    expect(render(many, { locale: "es" })).toContain("29 reseñas necesitan respuesta · la más reciente del 9 nov 2026");
    expect(render([review("x", 2, 3)])).toContain("1 review needs a reply · from Nov 8, 2026");
  });

  test("caught up: “You're all caught up ✓” (EN + ES), and the empty Needs a reply list says so", () => {
    const replied = [review("a", 1, 5, "Thanks!"), review("b", 2, 4, "Thank you!")];
    expect(inboxSummary(replied)).toEqual({ kind: "caught_up" });
    const html = render(replied);
    expect(html).toContain("You&#x27;re all caught up ✓");
    expect(html).toContain("Every review shown here has a reply.");
    expect(render(replied, { locale: "es" })).toContain("Está al día ✓");
  });

  test("after a reply is posted, that review leaves Needs a reply and the next one moves up (still 3)", () => {
    const after = many.map((r) => (r.reviewId === "n0" ? { ...r, reply: { comment: "Thank you!", updateTime: null } } : r));
    expect(visibleReviews(after, "needs_reply", "newest", 3).shown.map((r) => r.reviewId)).toEqual(["n1", "n2", "n3"]);
  });

  test("long review text is clamped to 2 lines with “Read more”", () => {
    const long = { ...review("long", 1, 5), comment: "Wonderful. ".repeat(30) };
    const html = render([long]);
    expect(html).toMatch(/data-testid="review-text" class="[^"]*line-clamp-2/);
    expect(html).toContain("Read more");
    expect(render([review("short", 1, 5)])).not.toContain("Read more");
    expect(render([long], { locale: "es" })).toContain("Leer más");
  });

  test("practice banner; read-only note when posting is off; the post button says Beta", () => {
    expect(render(many, { practice: true })).toContain("Practice mode — nothing is sent to Google.");
    expect(render(many, { practice: true, locale: "es" })).toContain("Modo de práctica: no se envía nada a Google.");
    const readOnly = render(many, { canPost: false });
    expect(readOnly).toContain('data-testid="read-only-note"');
    expect(render(many)).not.toContain("read-only-note");
    expect(render(many, { practice: true, canPost: true })).not.toContain("read-only-note");
    const component = readFileSync("components/reviews/GoogleReviewsInbox.tsx", "utf8");
    // Read-only: Approve, Edit and Delete are all the same locked button (lib/googleReviewInboxLayout.test.tsx).
    expect(component).toContain('<LockedAction testId="approve-reply"');
    expect(component).toContain('<span data-testid="beta-label"');
  });
});
