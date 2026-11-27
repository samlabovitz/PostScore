// Reviews (Premium): "Approve all replies" — a sticky bar over the reply list, a confirm step, then one by one with
// progress; Grow sees the Premium line instead.
import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1", useParams: () => ({ id: "b1" }) }));
vi.mock("@/app/actions/googleReviews", () => ({ changeGoogleReviewReply: vi.fn(), checkGoogleReview: vi.fn(), listGoogleReviews: vi.fn() }));
vi.mock("@/app/actions/reviewReplies", () => ({ draftReviewReply: vi.fn() }));
vi.mock("@/app/actions/approveAll", () => ({ getSavedReplies: vi.fn(), redraftWeekReply: vi.fn(), saveReplyDraft: vi.fn() }));

import { LocaleProvider, t, tPlural, type Locale } from "@/lib/i18n";
import { toInboxReview, type InboxReview } from "@/lib/gbpReviewInbox";
import { InboxBody, InboxPlanContext, approveAllReplyIds } from "@/components/reviews/GoogleReviewsInbox";

const review = (id: string, reply: string | null = null): InboxReview => toInboxReview({ reviewId: id, reviewer: { displayName: `Person ${id}` }, starRating: "FIVE", comment: "Great", createTime: "2026-11-20T12:00:00Z", ...(reply ? { reviewReply: { comment: reply } } : {}) })!;
const draft = (id: string, extra: Record<string, unknown> = {}) => [id, { reviewId: id, reviewUpdated: null, reply: `Thanks, ${id}!`, include: true, length: "medium" as const, failed: false, ...extra }] as const;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

describe("which replies it sends", () => {
  test("unanswered, not waiting on Google, a draft for this version of the review, left in 'Include in Approve all'", () => {
    const reviews = [review("a"), review("b"), review("c"), review("d", "Already"), review("e"), review("f")];
    const drafts = new Map([draft("a"), draft("b", { include: false }), draft("c", { failed: true, reply: null }), draft("d"), draft("e", { reviewUpdated: "2026-01-01T00:00:00Z" }), draft("f")]);
    expect(approveAllReplyIds(reviews, drafts as never, ["f"])).toEqual(["a"]);
    expect(approveAllReplyIds(reviews, drafts as never)).toEqual(["a", "f"]);
  });
});

describe("the bar", () => {
  const reviews = [review("a"), review("b"), review("c")];
  const drafts = new Map([draft("a"), draft("b"), draft("c", { include: false })]);
  const html = (opts: { grow?: boolean; canPost?: boolean; locale?: Locale } = {}) =>
    renderToStaticMarkup(
      <LocaleProvider locale={opts.locale ?? "en"} timeZone="America/New_York">
        <InboxPlanContext.Provider value={{ grow: !!opts.grow, googleHref: null }}>
          <InboxBody businessId="b1" reviews={reviews} practice={false} canPost={opts.canPost ?? true} hasMore={false} saved={drafts as never} onLoadAll={() => {}} onChanged={() => {}} />
        </InboxPlanContext.Provider>
      </LocaleProvider>
    );
  test("Premium: sticky, '2 replies ready · Approve all replies (2)' — only the ticked ones (EN + ES)", () => {
    const en = html();
    expect(en).toMatch(/data-testid="approve-all-replies" class="sticky/);
    expect(text(en)).toContain("2 replies ready");
    expect(text(en)).toContain("Approve all replies (2)");
    expect(text(html({ locale: "es" }))).toContain("2 respuestas listas");
    expect(text(html({ locale: "es" }))).toContain("Aprobar todas las respuestas (2)");
  });
  test("posting off for this business (not practice, not on the live list): the button is locked, like a single reply", () => {
    expect(html({ canPost: false })).toMatch(/data-testid="approve-all-replies-button" data-locked="true"/);
  });
  test("Grow: 'Premium posts all of these in one click →' instead of the button", () => {
    const grow = html({ grow: true });
    expect(text(grow)).toContain("Premium posts all of these in one click →");
    expect(grow).not.toContain('data-testid="approve-all-replies-button"');
  });
  test("the confirm step, the progress, 'Posted ✓', failures listed and the rest continue — the single reply's own server action", () => {
    const src = readFileSync("components/reviews/GoogleReviewsInbox.tsx", "utf8");
    expect(src).toContain('const r = await changeGoogleReviewReply(businessId, id, "post", text)');
    expect(src).toContain("await new Promise((res) => setTimeout(res, APPROVE_ALL_GAP_MS));");
    expect(src).toContain("failed.push({ name:");
    expect(tPlural("en", "dashboard.googleReviews.all.confirm", 29, { count: 29 })).toBe("Post 29 replies to Google? You can still edit any reply first.");
    expect(t("en", "dashboard.googleReviews.all.posting", { done: 12, count: 29 })).toBe("Posting 12 of 29…");
    expect(t("es", "dashboard.googleReviews.all.posting", { done: 12, count: 29 })).toBe("Publicando 12 de 29…");
    expect(t("en", "dashboard.googleReviews.all.posted")).toBe("Posted ✓");
  });
});
