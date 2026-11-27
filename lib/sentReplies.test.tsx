// Nov 27 (Hair Express): Christine and Laurel Weaver got real replies at 5:31 PM, but Google's read-back didn't show
// them yet, so they fell back under "Needs a reply" with "Draft it now" — inviting a duplicate. A reply PostScore sent
// (the log: a real post Google accepted, not deleted since) now counts as Replied everywhere.
import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1", useParams: () => ({ id: "b1" }) }));
vi.mock("@/app/actions/googleReviews", () => ({ changeGoogleReviewReply: vi.fn(), checkGoogleReview: vi.fn(), listGoogleReviews: vi.fn() }));
vi.mock("@/app/actions/reviewReplies", () => ({ draftReviewReply: vi.fn() }));
vi.mock("@/app/actions/approveAll", () => ({ getSavedReplies: vi.fn(), redraftWeekReply: vi.fn(), saveReplyDraft: vi.fn() }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { filterReviews, inboxSummary, isReplied, sentNotShown, SENT_NOT_SHOWN_MS, toInboxReview, type InboxReview } from "@/lib/gbpReviewInbox";
import { sentFromLog, withSent } from "@/lib/gbpReviewInbox.server";
import { InboxBody, InboxPlanContext, approveAllReplyIds } from "@/components/reviews/GoogleReviewsInbox";

const AT = "2026-11-27T22:31:35Z";
const review = (id: string, reply: string | null = null): InboxReview => toInboxReview({ reviewId: id, reviewer: { displayName: id }, starRating: "FIVE", comment: "Great", createTime: "2026-09-14T12:00:00Z", ...(reply ? { reviewReply: { comment: reply } } : {}) })!;
const sent = (r: InboxReview, text: string | null = "Thank you, Christine!", at = AT): InboxReview => ({ ...r, sent: { at, text } });
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

describe("a reply PostScore sent counts as Replied", () => {
  const reviews = [sent(review("Christine")), sent(review("Laurel")), review("Brandon"), review("Anita", "Thanks!")];
  test("the filters and the summary: Needs a reply 1, Replied 3", () => {
    expect(filterReviews(reviews, "needs_reply").map((r) => r.reviewId)).toEqual(["Brandon"]);
    expect(filterReviews(reviews, "replied").map((r) => r.reviewId)).toEqual(["Christine", "Laurel", "Anita"]);
    expect(inboxSummary(reviews)).toMatchObject({ kind: "needs_reply", count: 1 });
    expect(isReplied(reviews[0])).toBe(true);
  });
  test("never in Approve all replies, even with a draft left in", () => {
    const draft = (id: string) => [id, { reviewId: id, reviewUpdated: null, reply: "x", include: true, length: "medium", failed: false }] as const;
    const drafts = new Map([draft("Christine"), draft("Laurel"), draft("Brandon")]);
    expect(approveAllReplyIds(reviews, drafts as never)).toEqual(["Brandon"]);
  });
  test("Fix plan's set and the background drafting skip them too", () => {
    expect(readFileSync("app/actions/approveAll.ts", "utf8")).toContain("!r.reply && !r.sent && !pendingIds.has(r.reviewId)");
    expect(readFileSync("lib/replyBatch.server.ts", "utf8")).toContain("...Array.from((await sentFromLog(admin, businessId).catch(() => new Map())).keys())");
  });
  test("only after 48 h with Google still not showing it: 'Post it again?'", () => {
    const now = Date.parse(AT);
    expect(SENT_NOT_SHOWN_MS).toBe(48 * 60 * 60 * 1000);
    expect(sentNotShown(reviews[0], now + 47 * 3600_000)).toBe(false);
    expect(sentNotShown(reviews[0], now + 49 * 3600_000)).toBe(true);
    expect(sentNotShown(review("Anita", "Thanks!"), now + 49 * 3600_000)).toBe(false);
  });
});

describe("which reviews are marked (the log, real sends only)", () => {
  // A tiny stand-in for the two reads: the log, newest first, and our own saved drafts.
  const fake = (log: unknown[], drafts: unknown[]) => ({
    from: (table: string) => {
      const rows = table === "gbp_review_reply_log" ? log : drafts;
      const q = { select: () => q, eq: () => q, order: () => q, in: () => Promise.resolve({ data: rows, error: null }), limit: () => Promise.resolve({ data: rows, error: null }) };
      return q;
    },
  });
  test("a real post Google accepted (ok or unconfirmed) counts; failed, practice and deleted-after don't; our text when its length matches", async () => {
    const log = [
      { review_id: "Laurel", action: "post", status: "unconfirmed", reply_length: 9, created_at: AT },
      { review_id: "Christine", action: "post", status: "ok", reply_length: 21, created_at: AT },
      { review_id: "Deleted", action: "delete", status: "ok", reply_length: null, created_at: "2026-11-27T23:00:00Z" },
      { review_id: "Deleted", action: "post", status: "ok", reply_length: 5, created_at: AT },
      { review_id: "Failed", action: "post", status: "failed", reply_length: 5, created_at: AT },
      { review_id: "Practice", action: "post", status: "practice", reply_length: 5, created_at: AT },
    ];
    const map = await sentFromLog(fake(log, [{ review_id: "Christine", reply: "Thank you, Christine!" }, { review_id: "Laurel", reply: "Too long for its log length" }]) as never, "b1");
    expect(Array.from(map.keys()).sort()).toEqual(["Christine", "Laurel"]);
    expect(map.get("Christine")).toEqual({ at: AT, text: "Thank you, Christine!" });
    expect(map.get("Laurel")?.text).toBeNull();
    // Only where Google shows no reply yet.
    const marked = withSent([review("Christine"), review("Laurel", "Shown now")], map);
    expect(marked[0].sent?.at).toBe(AT);
    expect(marked[1].sent).toBeUndefined();
  });
});

describe("the row: 'Posted · waiting for Google to show it', the text we sent, no draft or post buttons (EN + ES)", () => {
  const html = (locale: Locale) =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale} timeZone="America/New_York">
        <InboxPlanContext.Provider value={{ grow: false, googleHref: null }}>
          <InboxBody businessId="b1" reviews={[sent(review("Christine")), review("Brandon")]} practice={false} canPost hasMore={false} saved={new Map()} onLoadAll={() => {}} onChanged={() => {}} initialFilter="all" />
        </InboxPlanContext.Provider>
      </LocaleProvider>
    );
  test("Christine: Replied, with our reply; Brandon still needs one", () => {
    const en = html("en");
    const christine = en.slice(en.indexOf('data-review-id="Christine"'), en.indexOf('data-review-id="Brandon"'));
    expect(text(christine)).toContain("Posted · waiting for Google to show it");
    expect(text(christine)).toContain("Thank you, Christine!");
    expect(christine).not.toContain('data-testid="no-draft-box"');
    expect(text(christine)).not.toContain("Draft it now");
    // The filter counts follow the same rule.
    expect(text(en)).toMatch(/Needs a reply\s*1/);
    expect(text(en)).toMatch(/Replied\s*1/);
    expect(text(html("es"))).toContain("Publicada · esperando a que Google la muestre");
  });
});
