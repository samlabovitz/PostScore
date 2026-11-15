import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/actions/actionPlan", () => ({ markTaskDone: vi.fn() }));
vi.mock("@/app/actions/customerDetails", () => ({ setCustomerDetailsOwnerAnswer: vi.fn() }));
vi.mock("@/app/actions/gbpCustomerDetails", () => ({ applyCustomerDetailsAction: vi.fn(), loadCustomerDetailsEditorAction: vi.fn(), undoCustomerDetailsAction: vi.fn() }));
vi.mock("@/app/actions/gbpWebsiteLink", () => ({ openWebsiteLinkFix: vi.fn(), applyWebsiteLinkFix: vi.fn(), undoWebsiteLinkFix: vi.fn() }));
import { LocaleProvider, type Locale } from "@/lib/i18n";
import type { ActionPlanTask } from "@/lib/actionPlan";
import { TaskCard } from "@/app/business/[id]/ActionPlanSection";
import { GbpEditProvider, type GbpEditState } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { fixFlowHref, FixWithPostScore } from "@/components/gbp/FixWithPostScore";

// Day 22: on Premium, a step whose fix PostScore can now make shows "Fix it
// with PostScore (Beta)" — opening the existing editor — instead of "Coming
// soon". Steps with no editor keep "Coming soon". The editors' own locks:
// practice mode, else Google connected; off GOOGLE_WRITES_LIVE_PLACES the
// editor opens read-only. Free and Grow: unchanged.

const render = (node: React.ReactNode, edit: Omit<GbpEditState, "enabled"> | null, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {edit ? <GbpEditProvider value={edit}>{node}</GbpEditProvider> : node}
    </LocaleProvider>
  );

const LIVE = { premium: true, connected: true, undo: null, canEdit: true };
const READ_ONLY = { premium: true, connected: true, undo: null, canEdit: false };
const NOT_CONNECTED = { premium: true, connected: false, undo: null, canEdit: false };
const PRACTICE = { premium: true, connected: false, undo: null, practice: true, canEdit: true };
const GROW = { premium: false, connected: true, undo: null, canEdit: true };

const task = (checkId: string, over: Partial<ActionPlanTask> = {}): ActionPlanTask =>
  ({ checkId, label: checkId, title: checkId, why: "Why it matters.", action: "Do this.", fix: "How.", effort: "quick_win", status: "open", weightedPoints: 3, automatable: false, links: [], ...over }) as unknown as ActionPlanTask;

describe("which steps have an editor", () => {
  test("hours, phone, website link and review replies open their editor; the merged reviews card when it stands for replies", () => {
    expect(fixFlowHref("b1", "completeness.hours")).toBe("/business/b1/growth?tab=google#edit-hours");
    expect(fixFlowHref("b1", "completeness.phone")).toBe("/business/b1/growth?tab=google#edit-phone");
    expect(fixFlowHref("b1", "completeness.website_link")).toBe("/business/b1/growth?tab=google#edit-website-link");
    expect(fixFlowHref("b1", "visibility.review_replies")).toBe("/business/b1/website-reviews#google-reviews");
    expect(fixFlowHref("b1", "visibility.reviews_merged", ["visibility.review_count", "visibility.review_replies"])).toBe("/business/b1/website-reviews#google-reviews");
    expect(fixFlowHref("b1", "visibility.review_recency")).toBeNull();
    expect(fixFlowHref("b1", "completeness.photos")).toBeNull();
  });

  test("the editors carry those anchors", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("components/gbp/ProfileEditsOnGoogle.tsx", "utf8")).toContain("<Card id={`edit-${field}`}");
    expect(readFileSync("components/gbp/GoogleProfilePanel.tsx", "utf8")).toContain('<Card id="edit-website-link"');
    expect(readFileSync("app/business/[id]/website-reviews/ReviewsView.tsx", "utf8")).toContain('id="google-reviews"');
  });
});

describe("the Growth step card on Premium", () => {
  const replies = task("visibility.review_replies", { automatable: true });

  test("an editor: “Fix it with PostScore (Beta)”, never “Coming soon” (EN + ES)", () => {
    const html = render(<TaskCard task={replies} businessId="b1" context="weekly" premium />, LIVE);
    expect(html).toMatch(/data-testid="fix-with-postscore"[^>]*href="\/business\/b1\/website-reviews#google-reviews"|href="\/business\/b1\/website-reviews#google-reviews"[^>]*data-testid="fix-with-postscore"/);
    expect(html).toContain("Fix it with PostScore");
    expect(html).toContain("Beta");
    expect(html).not.toContain("step-coming-soon");
    expect(html).not.toContain("fix-with-postscore-read-only");
    expect(render(<TaskCard task={replies} businessId="b1" context="weekly" premium />, LIVE, "es")).toContain("Arréglelo con PostScore");
    for (const checkId of ["completeness.hours", "completeness.phone", "completeness.website_link"]) expect(render(<TaskCard task={task(checkId)} businessId="b1" context="weekly" premium />, LIVE), checkId).toContain('data-testid="fix-with-postscore"');
  });

  test("no editor yet (review recency): “Coming soon” stays", () => {
    const html = render(<TaskCard task={task("visibility.review_recency", { automatable: true })} businessId="b1" context="weekly" premium />, LIVE);
    expect(html).toContain('data-testid="step-coming-soon"');
    expect(html).not.toContain('data-testid="fix-with-postscore"');
  });

  test("not on GOOGLE_WRITES_LIVE_PLACES: the button opens the editor read-only, and says so", () => {
    const html = render(<TaskCard task={replies} businessId="b1" context="weekly" premium />, READ_ONLY);
    expect(html).toContain('data-testid="fix-with-postscore"');
    expect(html).toContain('data-testid="fix-with-postscore-read-only"');
  });

  test("Google not connected: “Connect Google →” instead; practice mode works with no connection", () => {
    const off = render(<TaskCard task={replies} businessId="b1" context="weekly" premium />, NOT_CONNECTED);
    expect(off).toContain('data-testid="fix-with-postscore-connect"');
    expect(off).toContain('href="/business/b1/connect-gbp"');
    expect(off).not.toContain('data-testid="fix-with-postscore"');
    expect(off).not.toContain("step-coming-soon");
    const practice = render(<TaskCard task={replies} businessId="b1" context="weekly" premium />, PRACTICE);
    expect(practice).toContain('data-testid="fix-with-postscore"');
    expect(practice).not.toContain("fix-with-postscore-read-only");
  });

  test("Grow and Free: unchanged — no button, no connect line", () => {
    for (const html of [render(<TaskCard task={replies} businessId="b1" context="weekly" />, GROW), render(<TaskCard task={replies} businessId="b1" context="weekly" />, null)]) {
      expect(html).not.toContain("fix-with-postscore");
    }
  });

  test("off without the page's Google edit state (tests, other pages): the old Coming soon", () => {
    expect(render(<TaskCard task={replies} businessId="b1" context="weekly" premium />, null)).toContain('data-testid="step-coming-soon"');
  });
});

describe("the button on its own (Overview score rows)", () => {
  test("Premium only, and only for checks with an editor", () => {
    expect(render(<FixWithPostScore businessId="b1" checkId="completeness.hours" />, LIVE)).toContain('data-check="completeness.hours"');
    expect(render(<FixWithPostScore businessId="b1" checkId="completeness.photos" />, LIVE)).toBe("");
    expect(render(<FixWithPostScore businessId="b1" checkId="completeness.hours" />, GROW)).toBe("");
  });

  test("the Overview's score rows show it for hours, phone and review replies (customer details and the website link keep their own editor)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("components/scoring/CategoryCard.tsx", "utf8");
    expect(src).toContain("!websiteLinkFix && !customerDetails && fixFlowHref(businessId, check.id) !== null");
    expect(src).toContain("<FixWithPostScore businessId={businessId!} checkId={check.id}");
  });
});
