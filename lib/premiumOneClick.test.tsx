// CLAUDE.md "Plans": on Grow and Free, every fix Premium does in one click
// shows "Premium does this for you in one click →" under its steps — small,
// to the plans; never on Premium.
import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useParams: () => ({ id: "b1" }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1" }));
vi.mock("@/app/actions/actionPlan", () => ({ markTaskDone: vi.fn() }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { GbpEditProvider, type GbpEditState } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { premiumDoesInOneClick } from "@/lib/fixDestination";
import { FixButton } from "@/components/scoring/FixButton";
import { TaskCard } from "@/app/business/[id]/ActionPlanSection";
import { OrUpdateOnGoogle } from "@/components/scoring/OrUpdateOnGoogle";

const wrap = (node: ReactNode, edit: Omit<GbpEditState, "enabled"> | null, locale: Locale = "en") =>
  renderToStaticMarkup(<LocaleProvider locale={locale}>{edit ? <GbpEditProvider value={edit}>{node}</GbpEditProvider> : node}</LocaleProvider>);
const GROW = { premium: false, connected: true, undo: null, canEdit: true };
const FREE = { premium: false, connected: false, undo: null };
const PREMIUM = { premium: true, connected: true, undo: null, canEdit: true };
const PREMIUM_NOT_CONNECTED = { premium: true, connected: false, undo: null };
const LINE = 'data-testid="premium-one-click"';

const task = (checkId: string, extra: Record<string, unknown> = {}) =>
  ({ checkId, label: checkId, title: checkId, status: "open", effort: "quick_win", why: "", action: "Do it.", fix: "Steps.", weightedPoints: 2, weightedPointsHigh: null, ...extra }) as never;

describe("which fixes Premium does in one click", () => {
  test("hours, phone, website link, customer details, photos, review replies and the hours compare; not reviews to get, website content or categories", () => {
    for (const checkId of ["completeness.hours", "completeness.phone", "completeness.website_link", "completeness.customer_details", "completeness.photos", "visibility.review_replies"]) expect([checkId, premiumDoesInOneClick({ checkId })]).toEqual([checkId, true]);
    expect(premiumDoesInOneClick({ checkId: "website.info_consistency", hoursMismatch: true })).toBe(true);
    for (const checkId of ["visibility.review_count", "website.content_depth", "completeness.categories", "website.info_consistency"]) expect([checkId, premiumDoesInOneClick({ checkId })]).toEqual([checkId, false]);
  });
});

describe("the line, everywhere a fix is shown", () => {
  test("score breakdown and Top recommendations (the shared button): Grow and Free show it under the button; Premium never (EN + ES)", () => {
    for (const edit of [GROW, FREE]) {
      const html = wrap(<FixButton businessId="b1" item={{ checkId: "completeness.hours" }} fromScore />, edit);
      expect(html).toContain(LINE);
      expect(html).toContain('href="/business/b1/settings#compare-plans"');
      expect(html).toContain("Premium does this for you in one click →");
      // Small and quiet: a text link, never a second dark button.
      expect((html.match(/data-testid="fix-button"/g) ?? []).length).toBe(1);
      expect(html.split(LINE)[1].split(">")[0]).not.toContain("bg-ink");
    }
    expect(wrap(<FixButton businessId="b1" item={{ checkId: "completeness.hours" }} />, GROW, "es")).toContain("Premium lo hace por usted con un clic →");
    for (const edit of [PREMIUM, PREMIUM_NOT_CONNECTED]) expect(wrap(<FixButton businessId="b1" item={{ checkId: "completeness.hours" }} />, edit)).not.toContain(LINE);
    // A fix Premium can't do in one click: no line.
    expect(wrap(<FixButton businessId="b1" item={{ checkId: "visibility.review_count" }} />, GROW)).not.toContain(LINE);
    // No plan state on the page: off.
    expect(wrap(<FixButton businessId="b1" item={{ checkId: "completeness.hours" }} />, null)).not.toContain(LINE);
  });

  test("Growth recap step: once, under the steps' buttons (after “I did this”), on Grow; never on Premium", () => {
    const grow = wrap(<TaskCard task={task("completeness.photos")} businessId="b1" context="weekly" />, GROW);
    expect((grow.match(new RegExp(LINE, "g")) ?? []).length).toBe(1);
    expect(grow.indexOf("I did this")).toBeLessThan(grow.indexOf(LINE));
    expect(wrap(<TaskCard task={task("completeness.photos")} businessId="b1" context="weekly" premium />, PREMIUM)).not.toContain(LINE);
    expect(wrap(<TaskCard task={task("website.content_depth")} businessId="b1" context="weekly" />, GROW)).not.toContain(LINE);
  });

  test("the Website page's hours mismatch: under “Or update it on Google yourself”", () => {
    expect(wrap(<OrUpdateOnGoogle />, GROW)).toContain(LINE);
    expect(wrap(<OrUpdateOnGoogle />, PREMIUM)).not.toContain(LINE);
  });

  test("the Google Profile tab is Premium-only: Grow's Google Profile is a locked preview with no fix rows", async () => {
    const view = (await import("node:fs")).readFileSync("app/business/[id]/growth/GrowthView.tsx", "utf8");
    expect(view).toContain('{segment === "google-profile" && isPremiumPlan(plan) && googleTab && <GoogleProfileTab {...googleTab} />}');
  });
});
