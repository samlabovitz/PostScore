import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// Premium "Reply to your Google reviews": reviews read live from Google
// (shown, never stored), a reply posted ONLY on the owner's click, read
// back before "Posted to Google ✓", edits and deletes, and a log of each
// (who, when, which review id, the reply's length — never the text).
// NEVER posts to Google: every Google call here goes to a fake fetch, and
// the real one throws.

vi.mock("server-only", () => ({}));
const markGbpReconnect = vi.fn(async () => ({ status: "error", reason: "reconnect" }));
vi.mock("@/lib/gbpTokens.server", () => ({ markGbpReconnect: (...a: unknown[]) => markGbpReconnect(...(a as [])) }));
const gbpEditGate = vi.fn();
vi.mock("@/lib/gbpEditGate.server", () => ({ gbpEditGate: (...a: unknown[]) => gbpEditGate(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/business/b1/website-reviews", useSearchParams: () => new URLSearchParams() }));

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  throw new Error(`A test tried to reach the network: ${String(input)}`);
}) as typeof fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanPostedReply, filterReviews, isReviewId, newestFirst, originalReviewText, reviewLanguage, sameReply, toInboxReview, type InboxReview } from "@/lib/gbpReviewInbox";
import { changeReplyWithClient, fetchInboxPage, type InboxTarget } from "@/lib/gbpReviewInbox.server";
import { changeGoogleReviewReply, listGoogleReviews } from "@/app/actions/googleReviews";
import { changeMessage, GoogleReviewsInbox } from "@/components/reviews/GoogleReviewsInbox";
import { resetGbpQuota } from "@/lib/gbpQuota";
import { replySystemPrompt } from "@/lib/reviewReplies";
import { LocaleProvider } from "@/lib/i18n";
import { UpgradeProvider } from "@/components/upgrade/UpgradeContext";
import { NO_FACTS } from "@/lib/upgradePromos";
import { ReviewsView } from "@/app/business/[id]/website-reviews/ReviewsView";
import { scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { stepLinks } from "@/lib/actionPlan";
import type { Plan } from "@/lib/plan";

const TARGET: InboxTarget = { businessId: "b1", userId: "owner-1", accountName: "accounts/111", locationName: "locations/222", accessToken: "test-token" };
const REVIEW_URL = "https://mybusiness.googleapis.com/v4/accounts/111/locations/222/reviews/r1";
const raw = (reply: string | null, extra: Record<string, unknown> = {}) => ({
  name: "accounts/111/locations/222/reviews/r1",
  reviewId: "r1",
  reviewer: { displayName: "Maria P." },
  starRating: "FIVE",
  comment: "Angelica did a great job with my color.",
  createTime: "2026-11-01T15:00:00Z",
  updateTime: "2026-11-01T15:00:00Z",
  ...(reply ? { reviewReply: { comment: reply, updateTime: "2026-11-10T15:00:00Z" } } : {}),
  ...extra,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A fake Google: answers GET with the review as it is, PUT / DELETE change it. */
function fakeGoogle(opts: { reply?: string | null; put?: (body: { comment: string }) => Response | "network"; del?: () => Response; readBack?: (reply: string | null) => Response } = {}) {
  let reply = opts.reply ?? null;
  const calls: Array<{ method: string; url: string; body: string | null }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = String(input);
    calls.push({ method, url, body: typeof init?.body === "string" ? init.body : null });
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    if (method === "PUT") {
      const body = JSON.parse(String(init!.body)) as { comment: string };
      const res = opts.put ? opts.put(body) : json({ comment: body.comment });
      if (res === "network") {
        reply = body.comment;
        throw new TypeError("fetch failed");
      }
      if (res.ok) reply = body.comment;
      return res;
    }
    if (method === "DELETE") {
      const res = opts.del ? opts.del() : json({});
      if (res.ok) reply = null;
      return res;
    }
    const gets = calls.filter((c) => c.method === "GET").length;
    if (gets > 1 && opts.readBack) return opts.readBack(reply);
    return json(raw(reply));
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function fakeAdmin(opts: { logMissing?: boolean } = {}) {
  const logged: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      expect(table).toBe("gbp_review_reply_log");
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: async () => ({ data: [], error: opts.logMissing ? { code: "42P01", message: "relation does not exist" } : null }),
        insert: async (row: Record<string, unknown>) => (logged.push(row), { error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { admin, logged };
}

beforeEach(() => {
  resetGbpQuota();
  markGbpReconnect.mockClear();
  gbpEditGate.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Google's reviews, as the page shows them (pure)", () => {
  test("stars, the reviewer, the reviewer's own words (Google's translation removed), the reply", () => {
    expect(toInboxReview(raw("Thank you, Maria!"))).toEqual({
      reviewId: "r1", reviewer: "Maria P.", stars: 5, comment: "Angelica did a great job with my color.", createTime: "2026-11-01T15:00:00Z", updateTime: "2026-11-01T15:00:00Z",
      reply: { comment: "Thank you, Maria!", updateTime: "2026-11-10T15:00:00Z" },
    });
    expect(originalReviewText("(Translated by Google) Excellent service\n\n(Original)\nExcelente servicio")).toBe("Excelente servicio");
    expect(toInboxReview(raw(null, { reviewer: { displayName: "x", isAnonymous: true }, comment: undefined }))).toMatchObject({ reviewer: null, comment: null, reply: null });
    expect(toInboxReview(raw(null, { reviewId: "../../evil", name: "x/../../evil" }))).toBeNull();
  });

  test("Needs a reply / Replied / All, newest first", () => {
    const a = toInboxReview(raw(null, { reviewId: "a", createTime: "2026-10-01T00:00:00Z" }))!;
    const b = toInboxReview(raw("Thanks!", { reviewId: "b", createTime: "2026-11-05T00:00:00Z" }))!;
    const c = toInboxReview(raw(null, { reviewId: "c", createTime: "2026-11-08T00:00:00Z" }))!;
    const all = newestFirst([a, b, c]);
    expect(all.map((r) => r.reviewId)).toEqual(["c", "b", "a"]);
    expect(filterReviews(all, "needs_reply").map((r) => r.reviewId)).toEqual(["c", "a"]);
    expect(filterReviews(all, "replied").map((r) => r.reviewId)).toEqual(["b"]);
    expect(filterReviews(all, "all")).toHaveLength(3);
  });

  test("the reply: trimmed, never empty or over 1,200 characters; the read-back compares spacing aside; review ids are checked", () => {
    expect(cleanPostedReply("  Thank you!\r\n\r\n\r\nSee you soon.  ")).toBe("Thank you!\n\nSee you soon.");
    expect(cleanPostedReply("   ")).toBeNull();
    expect(cleanPostedReply("x".repeat(1201))).toBeNull();
    expect(sameReply("Thank you!\n\nSee you", "Thank you! See you")).toBe(true);
    expect(sameReply("", "")).toBe(false);
    expect(isReviewId("AbC_12-x")).toBe(true);
    expect(isReviewId("r1/reply")).toBe(false);
  });

  test("the draft matches the review's language (EN or ES)", () => {
    expect(reviewLanguage("Excelente servicio, muy amable y siempre puntual. Gracias!")).toBe("es");
    expect(reviewLanguage("Great service, the staff is very friendly and I always recommend them.")).toBe("en");
    expect(reviewLanguage("👍")).toBeNull();
    expect(replySystemPrompt("es", "Hair express")).toContain("Spanish, addressing the reviewer formally (usted)");
    // draftReviewReply uses the review's language first, the business's when it can't tell.
    expect(readFileSync("app/actions/reviewReplies.ts", "utf8")).toContain("replySystemPrompt(reviewLanguage(input.review) ?? normalizeLocale(business.language)");
  });
});

describe("listing reviews: one page, live from Google, never stored", () => {
  test("GET only, newest-updated first, 50 a page", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", url: String(input) });
      return json({ reviews: [raw(null)], nextPageToken: "next", totalReviewCount: 30 });
    }) as typeof fetch;
    const page = await fetchInboxPage(TARGET, null, fetchImpl);
    expect(page).toMatchObject({ ok: true, nextPageToken: "next", total: 30 });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://mybusiness.googleapis.com/v4/accounts/111/locations/222/reviews?pageSize=50&orderBy=updateTime+desc");
  });

  test("the review inbox never saves anything about a review (only a scan saves reply counts)", () => {
    const server = readFileSync("lib/gbpReviewInbox.server.ts", "utf8");
    expect(server).not.toContain("gbp_connections");
    expect(server).not.toMatch(/setGbpScoringCounts|runGbpReplyCheck|reconcile/);
    expect(server).not.toContain('from("businesses")');
  });
});

describe("posting: only the owner's click, read back from Google, logged without the text", () => {
  test("post: read → PUT the reply → read back → ok, and one log row (who, which review, length — no text)", async () => {
    const { fetchImpl, calls } = fakeGoogle();
    const { admin, logged } = fakeAdmin();
    const out = await changeReplyWithClient(admin, TARGET, { action: "post", reviewId: "r1", text: "Thank you, Maria — we're so glad you love it!" }, fetchImpl);
    expect(out.status).toBe("ok");
    expect(out.status === "ok" && out.review.reply?.comment).toBe("Thank you, Maria — we're so glad you love it!");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET ${REVIEW_URL}`, `PUT ${REVIEW_URL}/reply`, `GET ${REVIEW_URL}`]);
    expect(JSON.parse(calls[1].body!)).toEqual({ comment: "Thank you, Maria — we're so glad you love it!" });
    expect(logged).toEqual([{ business_id: "b1", user_id: "owner-1", action: "post", review_id: "r1", reply_length: 45, status: "ok", error_reason: null }]);
    expect(JSON.stringify(logged)).not.toMatch(/Maria|Angelica|color/);
  });

  test("a review that already has a reply is never overwritten by “post” — nothing sent", async () => {
    const { fetchImpl, calls } = fakeGoogle({ reply: "Thanks!" });
    const { admin, logged } = fakeAdmin();
    const out = await changeReplyWithClient(admin, TARGET, { action: "post", reviewId: "r1", text: "Another reply" }, fetchImpl);
    expect(out.status).toBe("already_replied");
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
    expect(logged).toEqual([]);
  });

  test("Google refuses the reply: an error, nothing posted, no read-back, logged as failed", async () => {
    const { fetchImpl, calls } = fakeGoogle({ put: () => json({ error: { status: "INVALID_ARGUMENT" } }, 400) });
    const { admin, logged } = fakeAdmin();
    expect(await changeReplyWithClient(admin, TARGET, { action: "post", reviewId: "r1", text: "Thank you!" }, fetchImpl)).toEqual({ status: "error", error: "failed", reason: "INVALID_ARGUMENT" });
    expect(calls.map((c) => c.method)).toEqual(["GET", "PUT"]);
    expect(logged).toMatchObject([{ action: "post", status: "failed", error_reason: "INVALID_ARGUMENT" }]);
  });

  test("Google rejects the token: “reconnect”, and the connection is marked for reconnecting", async () => {
    const { fetchImpl } = fakeGoogle({ put: () => json({ error: { status: "UNAUTHENTICATED" } }, 401) });
    const { admin } = fakeAdmin();
    expect(await changeReplyWithClient(admin, TARGET, { action: "post", reviewId: "r1", text: "Thank you!" }, fetchImpl)).toMatchObject({ status: "error", error: "reconnect" });
    expect(markGbpReconnect).toHaveBeenCalledWith(admin, "b1");
  });

  test("the read-back doesn't show it yet: “unconfirmed”, never “Posted ✓”", async () => {
    const { fetchImpl } = fakeGoogle({ readBack: () => json(raw(null)) });
    const { admin, logged } = fakeAdmin();
    expect(await changeReplyWithClient(admin, TARGET, { action: "post", reviewId: "r1", text: "Thank you!" }, fetchImpl)).toEqual({ status: "unconfirmed" });
    expect(logged).toMatchObject([{ status: "unconfirmed", error_reason: "read_back_differs" }]);
  });

  test("a network error after sending: the read-back decides (here it was posted)", async () => {
    const { fetchImpl } = fakeGoogle({ put: () => "network" });
    const { admin } = fakeAdmin();
    expect((await changeReplyWithClient(admin, TARGET, { action: "post", reviewId: "r1", text: "Thank you!" }, fetchImpl)).status).toBe("ok");
  });

  test("edit: PUT over the existing reply, logged as an edit", async () => {
    const { fetchImpl, calls } = fakeGoogle({ reply: "Thanks!" });
    const { admin, logged } = fakeAdmin();
    expect((await changeReplyWithClient(admin, TARGET, { action: "edit", reviewId: "r1", text: "Thank you so much!" }, fetchImpl)).status).toBe("ok");
    expect(calls.map((c) => c.method)).toEqual(["GET", "PUT", "GET"]);
    expect(logged).toMatchObject([{ action: "edit", reply_length: 18, status: "ok" }]);
  });

  test("delete: DELETE the reply → read back with no reply → ok, logged with no length", async () => {
    const { fetchImpl, calls } = fakeGoogle({ reply: "Thanks!" });
    const { admin, logged } = fakeAdmin();
    const out = await changeReplyWithClient(admin, TARGET, { action: "delete", reviewId: "r1", text: null }, fetchImpl);
    expect(out.status === "ok" && out.review.reply).toBeNull();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET ${REVIEW_URL}`, `DELETE ${REVIEW_URL}/reply`, `GET ${REVIEW_URL}`]);
    expect(logged).toMatchObject([{ action: "delete", reply_length: null, status: "ok" }]);
  });

  test("no log table yet (supabase/gbp-review-reply-log.sql): nothing is sent to Google", async () => {
    const { fetchImpl, calls } = fakeGoogle();
    expect(await changeReplyWithClient(fakeAdmin({ logMissing: true }).admin, TARGET, { action: "post", reviewId: "r1", text: "Thank you!" }, fetchImpl)).toEqual({ status: "not_set_up" });
    expect(calls).toEqual([]);
  });
});

describe("the server actions: checked before anything reaches Google", () => {
  const gate = (plan: Plan) => ({
    ok: true,
    plan,
    admin: fakeAdmin().admin,
    tokens: {},
    business: { id: "b1", language: "en", website: null, verified_website_url: null },
    target: { businessId: "b1", userId: "owner-1", locationName: "locations/222", accessToken: "test-token", locale: "en" },
  });

  test("not Premium / not connected: blocked, nothing sent", async () => {
    gbpEditGate.mockResolvedValue({ ok: false, result: { status: "blocked", reason: "not_premium" } });
    expect(await changeGoogleReviewReply("b1", "r1", "post", "Thank you!")).toEqual({ status: "blocked", reason: "not_premium" });
    expect(await listGoogleReviews("b1")).toEqual({ status: "blocked", reason: "not_premium" });
    expect(gbpEditGate).toHaveBeenCalledWith("b1", { requirePremium: true });
  });

  test("a reply offering an incentive or asking to change the review is refused before the gate", async () => {
    expect(await changeGoogleReviewReply("b1", "r1", "post", "Thanks! Here's 20% off your next visit.")).toEqual({ status: "rules" });
    expect(await changeGoogleReviewReply("b1", "r1", "post", "Could you update your review to 5 stars?")).toEqual({ status: "rules" });
    expect(await changeGoogleReviewReply("b1", "r1", "post", "   ")).toEqual({ status: "invalid" });
    expect(await changeGoogleReviewReply("b1", "../x", "delete")).toEqual({ status: "invalid" });
    expect(gbpEditGate).not.toHaveBeenCalled();
  });

  test("connected without a Google account id: blocked as not connected", async () => {
    const g = gate("premium");
    const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { google_account_id: null } }) }) }) }) } as unknown as SupabaseClient;
    gbpEditGate.mockResolvedValue({ ...g, admin });
    expect(await changeGoogleReviewReply("b1", "r1", "post", "Thank you!")).toEqual({ status: "blocked", reason: "not_connected" });
  });
});

describe("the page (EN + ES)", () => {
  const visibility = scoreBusiness(scoringInput()).categories.find((c) => c.id === "visibility")!;
  const view = (plan: Plan, gbpConnected: boolean, locale: "en" | "es" = "en") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale} timeZone="America/New_York">
        <UpgradeProvider value={{ businessId: "b1", plan, facts: NO_FACTS, cards: [] }}>
          <ReviewsView
            businessId="b1"
            plan={plan}
            reviews={{ businessName: "Hair express", address: null, category: null, primaryType: null, language: locale, timeZone: "America/New_York", placeId: "p1", rating: 4.6, reviewCount: 30, visibilityCategory: visibility, gbpConnected, verifiedSocials: [] }}
          />
        </UpgradeProvider>
      </LocaleProvider>
    );

  test("Premium + Google connected: the inbox, loading Google's reviews; never the preview", () => {
    const html = view("premium", true);
    expect(html).toContain('data-testid="google-reviews-inbox"');
    expect(html).toContain("Loading your Google reviews…");
    expect(html).toContain("Nothing is posted to Google until you click Approve.");
    expect(html).not.toContain("Reply to your Google reviews");
  });

  test("Grow: a Premium preview, no inbox; Premium not connected: the connect card", () => {
    const grow = view("grow", true);
    expect(grow).not.toContain("google-reviews-inbox");
    expect(grow).toContain("Reply to your Google reviews");
    expect(grow).toContain("post it to Google once you approve it");
    expect(view("premium", false)).not.toContain("google-reviews-inbox");
    expect(view("grow", false, "es")).toContain("Responda a sus reseñas de Google");
  });

  test("the inbox in Spanish", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="es" timeZone="America/New_York">
        <GoogleReviewsInbox businessId="b1" />
      </LocaleProvider>
    );
    expect(html).toContain("Sus reseñas de Google");
    expect(html).toContain("Cargando sus reseñas de Google…");
  });

  test("the real reason under a review, in both languages", () => {
    const review = toInboxReview(raw("Thanks!"))! as InboxReview;
    expect(changeMessage({ status: "rules" }, "en")).toMatch(/which Google doesn't allow/);
    expect(changeMessage({ status: "already_replied", review }, "en")).toMatch(/already has a reply on Google/);
    expect(changeMessage({ status: "error", error: "failed" }, "en")).toBe("Google didn't accept this reply, so nothing changed. Try changing the wording, or reply from Google Maps.");
    expect(changeMessage({ status: "error", error: "failed" }, "es")).toBe("Google no aceptó esta respuesta, así que no cambió nada. Pruebe a cambiar la redacción o responda desde Google Maps.");
    expect(changeMessage({ status: "error", error: "failed" }, "en", "delete")).toMatch(/^Google didn't remove this reply/);
    expect(changeMessage({ status: "error", error: "reconnect" }, "es")).toMatch(/vuelva a conectar su Perfil de Empresa/);
    // Accepted, not showing yet: no message — the review waits instead (lib/googleReviewWaiting.test.tsx).
    expect(changeMessage({ status: "unconfirmed" }, "en")).toBeNull();
    expect(changeMessage({ status: "invalid" }, "en")).toBe("Write a reply first (up to 1,200 characters).");
    expect(changeMessage({ status: "ok", review }, "en")).toBeNull();
  });

  test("“Reply to your reviews” links to the replies section; only a later scan marks it done (posting never saves counts)", () => {
    expect(stepLinks("visibility.review_replies", "b1")[0].href).toBe("/business/b1/website-reviews#reply-to-reviews");
    const action = readFileSync("app/actions/googleReviews.ts", "utf8");
    expect(action).not.toMatch(/runGbpReplyCheck|setGbpScoringCounts|reconcile|saveScoreSnapshot/);
  });
});
