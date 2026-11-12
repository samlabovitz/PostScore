import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// The review replies inbox, collapsed and calm:
// - "Show fewer" at the bottom once more than 3 show, and next to the
//   summary line when the full list is open — both back to the 3 newest,
//   scrolling the top of "Your Google reviews" into view;
// - changing the filter or the sort also goes back to 3;
// - with the inbox on the page, the old paste box is one line;
// - read-only: Approve, Edit reply and Delete reply look the same — grey,
//   a lock, "Changes to Google are off for this business".

vi.mock("server-only", () => ({}));
vi.mock("@/app/actions/googleReviews", () => ({ changeGoogleReviewReply: vi.fn(), checkGoogleReview: vi.fn(), listGoogleReviews: vi.fn() }));
vi.mock("@/app/actions/reviewReplies", () => ({ draftReviewReply: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/business/b1/website-reviews", useSearchParams: () => new URLSearchParams() }));

import { toInboxReview, type InboxReview } from "@/lib/gbpReviewInbox";
import { InboxBody } from "@/components/reviews/GoogleReviewsInbox";
import { ReviewsView } from "@/app/business/[id]/website-reviews/ReviewsView";
import { LocaleProvider } from "@/lib/i18n";
import { UpgradeProvider } from "@/components/upgrade/UpgradeContext";
import { NO_FACTS } from "@/lib/upgradePromos";
import { scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import type { Plan } from "@/lib/plan";

const day = (n: number) => new Date(Date.parse("2026-11-10T12:00:00Z") - n * 86_400_000).toISOString();
const review = (id: string, days: number, reply: string | null = null): InboxReview =>
  toInboxReview({ reviewId: id, reviewer: { displayName: `Reviewer ${id}` }, starRating: "FOUR", comment: `Review ${id}`, createTime: day(days), ...(reply ? { reviewReply: { comment: reply } } : {}) })!;
const many = Array.from({ length: 20 }, (_, i) => review(`n${i}`, i + 1));
const COMPONENT = readFileSync("components/reviews/GoogleReviewsInbox.tsx", "utf8");

const inbox = (opts: { reviews?: InboxReview[]; limit?: number | null; canPost?: boolean; filter?: "needs_reply" | "replied" | "all"; locale?: "en" | "es" } = {}) =>
  renderToStaticMarkup(
    <LocaleProvider locale={opts.locale ?? "en"} timeZone="America/New_York">
      <InboxBody businessId="b1" reviews={opts.reviews ?? many} practice={false} canPost={opts.canPost ?? true} hasMore={false} initialLimit={opts.limit === undefined ? 3 : opts.limit} initialFilter={opts.filter} onLoadAll={() => {}} onChanged={() => {}} />
    </LocaleProvider>
  );
const count = (html: string) => (html.match(/data-testid="google-review"/g) ?? []).length;

describe("Show fewer", () => {
  test("3 showing (the default): no Show fewer anywhere", () => {
    const html = inbox();
    expect(count(html)).toBe(3);
    expect(html).not.toContain("show-fewer");
  });

  test("more than 3 (after Show 10 more): Show fewer at the bottom, next to Show 10 more / Show all; not at the top", () => {
    const html = inbox({ limit: 13 });
    expect(count(html)).toBe(13);
    expect(html).toMatch(/data-testid="show-more"[\s\S]*data-testid="show-all"[\s\S]*data-testid="show-fewer"[^>]*>Show fewer</);
    expect(html).not.toContain("show-fewer-top");
  });

  test("the full list open: Show fewer at the bottom and next to the summary line; Show 10 more / Show all gone", () => {
    const html = inbox({ limit: null });
    expect(count(html)).toBe(20);
    expect(html).toMatch(/data-testid="inbox-summary"[\s\S]*?data-testid="show-fewer-top"[^>]*>Show fewer</);
    expect(html).toContain('data-testid="show-fewer"');
    expect(html).not.toContain('data-testid="show-more"');
    expect(html).not.toContain('data-testid="show-all"');
    expect(inbox({ limit: null, locale: "es" })).toContain(">Ver menos<");
  });

  test("both go back to the 3 newest and scroll the top of “Your Google reviews” into view", () => {
    expect(COMPONENT).toMatch(/const showFewer = \(\) => \{\n\s+setLimit\(INBOX_FIRST\);/);
    expect(COMPONENT).toContain('document.getElementById("google-reviews")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });');
    expect(COMPONENT).toContain('data-testid="show-fewer-top" onClick={showFewer}');
    expect(COMPONENT).toContain('data-testid="show-fewer" onClick={showFewer}');
    expect(COMPONENT).toContain('<section id="google-reviews"');
  });

  test("changing the filter or the sort goes back to 3", () => {
    expect(COMPONENT).toMatch(/onClick=\{\(\) => \{\n\s+setFilter\(f\);\n\s+setLimit\(INBOX_FIRST\);/);
    expect(COMPONENT).toMatch(/setSort\(next\);\n\s+setLimit\(INBOX_FIRST\);\n\s+saveSort\(next\);/);
  });
});

describe("read-only: every disabled button looks the same", () => {
  test("Edit reply and Delete reply: grey, a lock, “Changes to Google are off for this business” — no red outline", () => {
    const html = inbox({ reviews: [review("r", 1, "Thanks!")], filter: "replied", canPost: false });
    for (const id of ["edit-reply", "delete-reply"]) {
      const button = html.slice(html.lastIndexOf("<span", html.indexOf(`data-testid="${id}"`)), html.indexOf("</button>", html.indexOf(`data-testid="${id}"`)));
      expect(button, id).toContain('title="Changes to Google are off for this business"');
      expect(button, id).toContain('data-locked="true"');
      expect(button, id).toContain("disabled");
      expect(button, id).toContain("bg-paper");
      expect(button, id).toContain("text-ink-mute");
      expect(button, id).not.toMatch(/red/);
      expect(button, id).toContain("tabler-icon-lock");
    }
    expect(inbox({ reviews: [review("r", 1, "Thanks!")], filter: "replied", canPost: false, locale: "es" })).toContain('title="Los cambios en Google están desactivados para este negocio"');
  });

  test("Approve uses the same locked button; with posting on, the real buttons (and Delete's red hover)", () => {
    expect(COMPONENT).toContain('<LockedAction testId="approve-reply" label={t(locale, K(state.action === "post" ? "approve" : "save"))} size="md" />');
    const live = inbox({ reviews: [review("r", 1, "Thanks!")], filter: "replied", canPost: true });
    expect(live).not.toContain("data-locked");
    expect(live).toMatch(/data-testid="delete-reply"[^>]*hover:border-red/);
  });
});

describe("the old paste box", () => {
  const visibility = scoreBusiness(scoringInput()).categories.find((c) => c.id === "visibility")!;
  const page = (plan: Plan, gbpConnected: boolean, locale: "en" | "es" = "en") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale} timeZone="America/New_York">
        <UpgradeProvider value={{ businessId: "b1", plan, facts: NO_FACTS, cards: [] }}>
          <ReviewsView
            businessId="b1"
            plan={plan}
            replyDrafts={{ status: "ok", used: 0, left: plan === "premium" ? null : 3 }}
            reviews={{ businessName: "Hair express", address: null, category: null, primaryType: null, language: locale, timeZone: "America/New_York", placeId: "p1", rating: 4.6, reviewCount: 30, visibilityCategory: visibility, gbpConnected, verifiedSocials: [] }}
          />
        </UpgradeProvider>
      </LocaleProvider>
    );

  test("with the inbox (Premium + Google connected): one closed line, “Reply to a review from somewhere else? Paste it here ▸”", () => {
    const html = page("premium", true);
    expect(html).toMatch(/<details data-testid="paste-box-collapsed"[^>]*><summary[^>]*>Reply to a review from somewhere else\? Paste it here<span aria-hidden="true"[^>]*>▸<\/span><\/summary>/);
    expect(html).not.toMatch(/<details data-testid="paste-box-collapsed"[^>]* open/);
    // Inside: the box, for reviews from anywhere else.
    expect(html).toContain("For reviews from Yelp, Facebook or anywhere else, paste them here.");
    expect(page("premium", true, "es")).toContain("¿Responder a una reseña de otro sitio? Péguela aquí");
    expect(page("premium", true, "es")).toContain("Para reseñas de Yelp, Facebook o cualquier otro sitio, péguelas aquí.");
  });

  test("without the inbox: fully open as before — Premium not connected says to connect; Grow keeps its footer; never “coming soon”", () => {
    const notConnected = page("premium", false);
    expect(notConnected).not.toContain("paste-box-collapsed");
    expect(notConnected).toContain('data-testid="review-reply-drafter"');
    expect(notConnected).toContain("Connect Google to see and answer every review here.");
    expect(page("premium", false, "es")).toContain("Conecte Google para ver y responder todas sus reseñas aquí.");
    const grow = page("grow", true);
    expect(grow).not.toContain("paste-box-collapsed");
    expect(grow).toContain('data-testid="review-reply-drafter"');
    for (const html of [notConnected, grow, page("premium", true)]) expect(html.match(/data-testid="replies-footer"[^>]*>([^<]*)/)?.[1]).not.toMatch(/coming soon/);
  });
});
