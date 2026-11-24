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
import { fixFlowHref } from "@/lib/fixFlows";

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

describe("the Growth step card on Premium (Day 23B: one button, lib/fixDestination.ts)", () => {
  const replies = task("visibility.review_replies", { automatable: true });
  const buttons = (html: string) => (html.match(/data-testid="fix-button"/g) ?? []).length;

  test("an editor, Google writes on: ONE “PostScore can do this for you”, never “Coming soon” (EN + ES)", () => {
    const html = render(<TaskCard task={replies} businessId="b1" context="weekly" premium />, LIVE);
    expect(buttons(html)).toBe(1);
    // Day 25B step 3: replies are done in Reviews — "Reply in Reviews →" (one click there on Premium).
    expect(html).toMatch(/data-kind="do_it"[^>]*href="\/business\/b1\/website-reviews#reply-to-reviews"/);
    expect(html).toContain("Reply in Reviews →");
    expect(html).not.toContain("step-coming-soon");
    expect(render(<TaskCard task={replies} businessId="b1" context="weekly" premium />, LIVE, "es")).toContain("Responda en Reseñas →");
    for (const checkId of ["completeness.hours", "completeness.phone", "completeness.website_link", "completeness.photos", "completeness.customer_details"]) {
      const h = render(<TaskCard task={task(checkId, { automatable: true })} businessId="b1" context="weekly" premium />, LIVE);
      expect([checkId, buttons(h), h.includes('data-kind="do_it"'), h.includes("step-coming-soon")]).toEqual([checkId, 1, true, false]);
    }
  });

  test("no editor yet (review recency): “Coming soon” stays, and the one button is the step-by-step", () => {
    const html = render(<TaskCard task={task("visibility.review_recency", { automatable: true })} businessId="b1" context="weekly" premium />, LIVE);
    expect(html).toContain('data-testid="step-coming-soon"');
    expect(html).not.toContain('data-kind="do_it"');
    expect(buttons(html)).toBe(1);
  });

  test("not on GOOGLE_WRITES_LIVE_PLACES: the same editor, with the verb (it opens read-only and says so there)", () => {
    const html = render(<TaskCard task={task("completeness.hours", { automatable: true })} businessId="b1" context="weekly" premium />, READ_ONLY);
    expect(html).toMatch(/data-kind="steps"[^>]*href="\/business\/b1\/growth\?tab=google#edit-hours"/);
    expect(html).not.toContain("PostScore can do this for you");
    expect(html).not.toContain("step-coming-soon");
  });

  test("Google not connected: the step-by-step here + “Connect Google so PostScore can do this for you”; practice mode works with no connection", () => {
    const off = render(<TaskCard task={task("completeness.hours", { automatable: true })} businessId="b1" context="weekly" premium />, NOT_CONNECTED);
    expect(off).toContain('data-testid="fix-connect"');
    expect(off).toContain('href="/business/b1/connect-gbp"');
    expect(off).toMatch(/<button[^>]*data-testid="fix-button"[^>]*data-kind="steps"/);
    expect(off).not.toContain("step-coming-soon");
    const practice = render(<TaskCard task={task("completeness.hours")} businessId="b1" context="weekly" premium />, PRACTICE);
    expect(practice).toContain('data-kind="do_it"');
  });

  test("Grow and Free: the step-by-step button, no “do it for you”, no connect line", () => {
    for (const html of [render(<TaskCard task={task("completeness.hours")} businessId="b1" context="weekly" />, GROW), render(<TaskCard task={task("completeness.hours")} businessId="b1" context="weekly" />, null)]) {
      expect(buttons(html)).toBe(1);
      expect(html).not.toContain('data-kind="do_it"');
      expect(html).not.toContain("fix-connect");
    }
  });
});

describe("the Overview's score rows", () => {
  test("no inline fixes: the shared one button (lib/fixDestination.ts)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("components/scoring/CategoryCard.tsx", "utf8");
    expect(src).not.toContain("<CustomerDetailsGoogleEdit");
    expect(src).not.toContain("<WebsiteLinkFix");
    expect(src).toContain("<FixButton");
  });
});
