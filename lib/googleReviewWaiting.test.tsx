import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// "Accepted, not showing yet": the review waits — no Draft / Write
// buttons — while the page re-checks Google every 15 seconds for up to 2
// minutes, moves to Replied when the reply shows, and otherwise says to
// check Google Maps. The wait survives a refresh (this browser's storage,
// plus the server log's unconfirmed row). Never posts to Google.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/gbpTokens.server", () => ({ markGbpReconnect: vi.fn() }));
vi.mock("@/app/actions/googleReviews", () => ({ changeGoogleReviewReply: vi.fn(), checkGoogleReview: vi.fn(), listGoogleReviews: vi.fn() }));
vi.mock("@/app/actions/reviewReplies", () => ({ draftReviewReply: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mergePending,
  pendingFor,
  pendingPhase,
  pendingResolved,
  pendingStorageKey,
  PENDING_CHECK_MS,
  PENDING_TIMEOUT_MS,
  readPending,
  replyHash,
  watchPending,
  writePending,
} from "@/lib/gbpReviewPending";
import { pendingFromLog } from "@/lib/gbpReviewInbox.server";
import { toInboxReview, type InboxReview } from "@/lib/gbpReviewInbox";
import { changeMessage, InboxBody, messageTone } from "@/components/reviews/GoogleReviewsInbox";
import { LocaleProvider } from "@/lib/i18n";

const T0 = Date.parse("2026-11-10T12:00:00Z");
const review = (id: string, reply: string | null = null, name = `Reviewer ${id}`): InboxReview =>
  toInboxReview({ reviewId: id, reviewer: { displayName: name }, starRating: "FOUR", comment: `Review ${id}`, createTime: new Date(T0 - 86_400_000).toISOString(), ...(reply ? { reviewReply: { comment: reply } } : {}) })!;

afterEach(() => vi.useRealTimers());

describe("when Google is showing the change", () => {
  test("a post or edit: that reply (by its fingerprint, never the text); a delete: no reply", () => {
    const post = pendingFor("post", "r1", "Thank you so much!", T0);
    expect(post).toEqual({ reviewId: "r1", action: "post", since: "2026-11-10T12:00:00.000Z", replyLength: 18, hash: replyHash("Thank you so much!") });
    expect(JSON.stringify(post)).not.toContain("Thank you");
    expect(pendingResolved(post, review("r1"))).toBe(false);
    expect(pendingResolved(post, review("r1", "Thank you  so much!"))).toBe(true);
    const edit = pendingFor("edit", "r1", "New words", T0);
    expect(pendingResolved(edit, review("r1", "Old words"))).toBe(false);
    expect(pendingResolved(edit, review("r1", "New words"))).toBe(true);
    const del = pendingFor("delete", "r1", null, T0);
    expect(pendingResolved(del, review("r1", "Thanks"))).toBe(false);
    expect(pendingResolved(del, review("r1"))).toBe(true);
    // From the server log alone (no fingerprint): its length.
    expect(pendingResolved({ ...post, hash: null }, review("r1", "x".repeat(18)))).toBe(true);
  });

  test("waiting for 2 minutes, then timed out", () => {
    const p = pendingFor("post", "r1", "Thanks!", T0);
    expect(pendingPhase(p, T0 + PENDING_TIMEOUT_MS - 1)).toBe("waiting");
    expect(pendingPhase(p, T0 + PENDING_TIMEOUT_MS)).toBe("timed_out");
  });
});

describe("the automatic re-check: every 15 seconds, for up to 2 minutes", () => {
  test("re-checks at 15 s, 30 s, … and moves it to Replied as soon as Google shows it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const p = pendingFor("post", "r1", "Thanks!", T0);
    const answers = [review("r1"), review("r1"), review("r1", "Thanks!")];
    const check = vi.fn(async () => answers.shift() ?? null);
    const onShown = vi.fn();
    const onTimedOut = vi.fn();
    watchPending(p, { check, onShown, onTimedOut });
    await vi.advanceTimersByTimeAsync(PENDING_CHECK_MS - 1);
    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(PENDING_CHECK_MS * 2);
    expect(check).toHaveBeenCalledTimes(3);
    expect(onShown).toHaveBeenCalledWith(expect.objectContaining({ reviewId: "r1", reply: expect.objectContaining({ comment: "Thanks!" }) }));
    await vi.advanceTimersByTimeAsync(PENDING_TIMEOUT_MS);
    expect(check).toHaveBeenCalledTimes(3);
    expect(onTimedOut).not.toHaveBeenCalled();
  });

  test("never showing: 8 re-checks, then “Google hasn't shown it yet” at 2 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const check = vi.fn(async () => review("r1"));
    const onTimedOut = vi.fn();
    watchPending(pendingFor("post", "r1", "Thanks!", T0), { check, onShown: vi.fn(), onTimedOut });
    await vi.advanceTimersByTimeAsync(PENDING_TIMEOUT_MS - 1);
    expect(onTimedOut).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(8);
    expect(onTimedOut).toHaveBeenCalledTimes(1);
  });

  test("after a refresh 100 s in: only what's left of the 2 minutes; a failed check just tries again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 100_000);
    const check = vi.fn(async () => {
      throw new Error("network");
    });
    const onTimedOut = vi.fn();
    watchPending(pendingFor("post", "r1", "Thanks!", T0), { check, onShown: vi.fn(), onTimedOut });
    await vi.advanceTimersByTimeAsync(PENDING_CHECK_MS);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(check).toHaveBeenCalledTimes(2);
    expect(onTimedOut).toHaveBeenCalledTimes(1);
  });

  test("cancelled (the page closed): no more checks", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const check = vi.fn(async () => review("r1"));
    const stop = watchPending(pendingFor("post", "r1", "Thanks!", T0), { check, onShown: vi.fn(), onTimedOut: vi.fn() });
    stop();
    await vi.advanceTimersByTimeAsync(PENDING_TIMEOUT_MS);
    expect(check).not.toHaveBeenCalled();
  });
});

describe("the wait survives a refresh", () => {
  const memory = () => {
    const store = new Map<string, string>();
    return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), store };
  };

  test("kept in this browser, per business; cleared when done", () => {
    const storage = memory();
    const p = pendingFor("post", "r1", "Thanks!", T0);
    writePending(storage, "b1", [p]);
    expect(storage.store.has(pendingStorageKey("b1"))).toBe(true);
    expect(readPending(storage, "b1", T0 + 60_000)).toEqual([p]);
    expect(readPending(storage, "b2", T0)).toEqual([]);
    writePending(storage, "b1", []);
    expect(storage.store.size).toBe(0);
  });

  test("blocked storage, junk or a day-old wait: never an error, nothing kept", () => {
    const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); }, removeItem: () => {} };
    expect(readPending(blocked, "b1", T0)).toEqual([]);
    expect(() => writePending(blocked, "b1", [pendingFor("post", "r1", "Hi", T0)])).not.toThrow();
    expect(readPending(null, "b1", T0)).toEqual([]);
    const junk = memory();
    junk.setItem(pendingStorageKey("b1"), "{not json");
    expect(readPending(junk, "b1", T0)).toEqual([]);
    junk.setItem(pendingStorageKey("b1"), JSON.stringify([{ reviewId: "r1", action: "hack" }, pendingFor("post", "r2", "Hi", T0 - 25 * 3_600_000)]));
    expect(readPending(junk, "b1", T0)).toEqual([]);
  });

  test("the server log's unconfirmed row (any browser): each review's latest row in the last day", async () => {
    const rows = [
      { review_id: "r1", action: "post", status: "unconfirmed", error_reason: "read_back_differs", reply_length: 7, created_at: "2026-11-10T11:59:00Z" },
      { review_id: "r2", action: "post", status: "ok", error_reason: null, reply_length: 9, created_at: "2026-11-10T11:58:00Z" },
      { review_id: "r2", action: "post", status: "unconfirmed", error_reason: null, reply_length: 9, created_at: "2026-11-10T11:50:00Z" },
      { review_id: "p1", action: "delete", status: "practice", error_reason: "unconfirmed:read_back_differs", reply_length: null, created_at: "2026-11-10T11:57:00Z" },
      { review_id: "p2", action: "post", status: "practice", error_reason: "ok", reply_length: 5, created_at: "2026-11-10T11:56:00Z" },
    ];
    const chain = { select: () => chain, eq: () => chain, gte: () => chain, order: () => chain, limit: async () => ({ data: rows, error: null }) };
    const admin = { from: (table: string) => (expect(table).toBe("gbp_review_reply_log"), chain) } as unknown as SupabaseClient;
    expect(await pendingFromLog(admin, "b1", T0)).toEqual([
      { reviewId: "r1", action: "post", since: "2026-11-10T11:59:00Z", replyLength: 7, hash: null },
      { reviewId: "p1", action: "delete", since: "2026-11-10T11:57:00Z", replyLength: null, hash: null },
    ]);
  });

  test("the browser's wait and the log's row for the same post merge (the fingerprint kept)", () => {
    const browser = pendingFor("post", "r1", "Thanks!", T0);
    const server = { ...browser, since: new Date(T0 + 400).toISOString(), hash: null };
    expect(mergePending([browser], [server])).toEqual([{ ...server, hash: browser.hash }]);
  });
});

describe("on the page (EN + ES)", () => {
  const render = (reviews: InboxReview[], pending: ReturnType<typeof pendingFor>[], locale: "en" | "es" = "en", filter: "needs_reply" | "replied" | "all" = "needs_reply") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale} timeZone="America/New_York">
        <InboxBody businessId="b1" reviews={reviews} practice={false} canPost hasMore={false} initialPending={pending} initialFilter={filter} onLoadAll={() => {}} onChanged={() => {}} />
      </LocaleProvider>
    );
  const rowOf = (html: string, id: string) => html.slice(html.indexOf(`data-review-id="${id}"`), html.indexOf("</li>", html.indexOf(`data-review-id="${id}"`)));

  test("waiting: “Waiting for Google to show your reply…” (neutral), and no Draft / Write buttons on that review", () => {
    const html = render([review("a"), review("b")], [pendingFor("post", "a", "Thanks!", Date.now())]);
    const a = rowOf(html, "a");
    expect(a).toContain('data-testid="reply-waiting"');
    expect(a).toContain("Waiting for Google to show your reply…");
    expect(a).not.toContain("text-red");
    expect(a).not.toContain("draft-google-reply");
    expect(a).not.toContain("Write my own");
    // The other review keeps its buttons.
    expect(rowOf(html, "b")).toContain("draft-google-reply");
    expect(render([review("a")], [pendingFor("post", "a", "Thanks!", Date.now())], "es")).toContain("Esperando a que Google muestre su respuesta…");
  });

  test("a delete waiting: “Waiting for Google to remove your reply…”, no Edit / Delete", () => {
    const html = render([review("a", "Old reply")], [pendingFor("delete", "a", null, Date.now())], "en", "replied");
    expect(html).toContain("Waiting for Google to remove your reply…");
    expect(html).not.toContain("delete-reply");
  });

  test("after 2 minutes: amber “Google hasn't shown it yet. Check Google Maps before trying again.”, and the buttons back", () => {
    const html = render([review("a")], [pendingFor("post", "a", "Thanks!", Date.now() - PENDING_TIMEOUT_MS - 1000)]);
    const a = rowOf(html, "a");
    expect(a).toContain('data-testid="reply-timed-out"');
    expect(a).toContain("Google hasn&#x27;t shown it yet. Check Google Maps before trying again.");
    expect(a).toContain("--color-amber");
    expect(a).toContain("draft-google-reply");
    expect(render([review("a")], [pendingFor("post", "a", "Thanks!", Date.now() - PENDING_TIMEOUT_MS - 1000)], "es")).toContain("Google aún no la muestra. Revise Google Maps antes de intentarlo de nuevo.");
  });

  test("colors: red only for a real failure; a refused reply keeps the draft in the box", () => {
    const r = review("a", "Hi");
    expect(messageTone({ status: "error", error: "failed" })).toBe("failure");
    expect(messageTone({ status: "rules" })).toBe("failure");
    expect(messageTone({ status: "already_replied", review: r })).toBe("neutral");
    expect(messageTone({ status: "unconfirmed" })).toBeNull();
    expect(changeMessage({ status: "error", error: "failed" }, "en")).toBe("Google didn't accept this reply, so nothing changed. Try changing the wording, or reply from Google Maps.");
    const component = readFileSync("components/reviews/GoogleReviewsInbox.tsx", "utf8");
    // A refused post or edit returns to the editor with the same text.
    expect(component).toContain('setState(action === "delete" || result.status === "already_replied" || result.status === "no_reply" ? { kind: "idle" } : { kind: "editing", text: text ?? "", action });');
    expect(component).toContain('message.tone === "failure" ? "text-red" : "text-ink-soft"');
    // Posted and shown: green.
    expect(component).toMatch(/data-testid="google-reply-done" className="[^"]*text-green/);
  });
});
