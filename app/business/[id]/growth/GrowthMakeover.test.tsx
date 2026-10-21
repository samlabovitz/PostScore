import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
  usePathname: () => "/business/b1/growth",
}));
vi.mock("@/app/actions/actionPlan", () => ({ markTaskDone: vi.fn() }));
vi.mock("@/app/actions/weeklyChecklist", () => ({ setWeeklyCheckItem: vi.fn() }));

import { LocaleProvider } from "@/lib/i18n";
import { GrowthView } from "./GrowthView";
import { taskPointsLabel } from "../ActionPlanSection";
import { buildWeeklyChecklistItems } from "@/lib/weeklyChecklist";
import { scoreBusiness, type ScoreBreakdown } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { bizProfileById } from "@/config/bizProfiles";
import type { ActionPlanTask } from "@/lib/actionPlan";
import type { GrowthMove } from "@/lib/growthMoves";

function task(partial: Partial<ActionPlanTask>): ActionPlanTask {
  return {
    checkId: "completeness.photos", category: "completeness", label: "Photos", problem: "Only 4 photos.", why: "Photos help.", action: "Add 5 more photos",
    fix: "Open your Google listing and add photos.", ownerActionOnGoogle: true, promisedPoints: 3, status: "open", markedDoneAt: null,
    markedPromisedPoints: null, markedMetricValue: null, effort: "quick_win", weeklyTarget: null, weeklyTargetDelta: null, currentMetricValue: null,
    mergedCheckIds: null, mergedLabels: null, timingNote: null, weightedPoints: 1.5, weightedPointsHigh: null, ...partial,
  } as ActionPlanTask;
}

const today = scoreBusiness(scoringInput());
const projected = { ...today, total: today.total + 2 } as ScoreBreakdown;
const REVIEWS = task({
  checkId: "reviews.merged", category: "visibility", label: "Reviews", effort: "quick_win_action", weightedPoints: 1.4, action: "Ask 3 customers for a review",
  problem: "15 reviews on Google (full credit at 150+). 4.5★ on Google (full credit at 40+).",
  problemLines: ["15 reviews on Google (full credit at 150+).", "4.5★ on Google. Your rating counts fully as you get more reviews (15 now — full credit at 40+)."],
});
const MOVE: GrowthMove = { id: "start_coupon", title: "Start a coupon", meta: null, why: "Brings people back.", howTo: "Pick an offer.", href: "/business/b1/campaigns?tab=coupons", signal: "x" };

function render(over: { gbpConnected?: boolean; locale?: "en" | "es"; devPlanSwitch?: boolean; plan?: "free" | "grow" | "premium" | "multi"; tab?: string } = {}) {
  nav.query = over.tab ? `tab=${over.tab}` : "";
  return renderToStaticMarkup(
    <LocaleProvider locale={over.locale ?? "en"} timeZone="America/New_York">
      <GrowthView
        businessId="b1"
        businessName="Modern Liquors"
        profile={bizProfileById("salon", over.locale ?? "en")!}
        breakdown={today}
        googleProfile={{
          listing: { rating: 4.5, reviewCount: 15, photoCount: 9, hasHours: true, phone: "+1 302-800-5116", website: null, category: "Liquor store", googleMapsUri: "https://maps.google.com/?cid=9" },
          websiteOnly: false,
          connected: false,
          searchDemand: { kind: "awaiting" },
        }}
        lastScanAt="2026-10-16T13:00:00Z"
        gbpConnected={over.gbpConnected ?? false}
        devPlanSwitch={over.devPlanSwitch ?? false}
        plan={over.plan ?? "grow"}
        linkOptions={{ referralOk: true, couponsOk: true, pricingOk: true }}
        actionPlan={{
          tasks: [REVIEWS, task({})],
          completed: [{ checkId: "completeness.hours", label: "Hours", pointsGained: 1.6 } as never],
          weeklyTasks: [REVIEWS, task({})],
          laterTasks: [],
          weeklyProjectedBreakdown: projected,
          weeklyProjectedBreakdownHigh: null,
          weeklyPointsWithinReach: 2,
          websiteBanner: { kind: "improve", score: 72, improvements: 3, points: 4.1 } as never,
        }}
        growthMoves={[MOVE]}
        weeklyChecklist={{ items: buildWeeklyChecklistItems(over.locale ?? "en"), checkedItemIds: ["post_update", "reply_reviews"], streakWeeks: 0, weekStart: "2026-10-12" }}
      />
    </LocaleProvider>
  ).replace(/&#x27;/g, "'");
}

describe("Growth → Action plan makeover", () => {
  test("same order: summary → weekly routine → this week's plan → bigger projects → ways to bring in customers", () => {
    const html = render();
    const at = (s: string) => html.indexOf(s);
    const later = html.search(/<h2[^>]*>Bigger projects/);
    const order = [at("This week at a glance") >= 0 ? at("This week at a glance") : at("text-[34px]"), at('id="weekly-routine"'), at('id="weekly-plan"'), later, at('id="ways-to-grow"')];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("summary: today → projected, '+2 within reach this week', grade note, small basis line", () => {
    const html = render();
    expect(html).toContain(`>${today.total}</span>`);
    expect(html).toContain(`>${today.total + 2}</span>`);
    expect(html).toContain("+2 within reach this week");
    expect(html).toMatch(/Based on just the 2 tasks below|Based on just the 2/);
  });

  test("weekly routine: progress ring line, icons, and a link where PostScore has the page", () => {
    const html = render();
    expect(html).toContain("2 of 5 done this week · resets Monday");
    expect(html).toContain('href="/business/b1/website-reviews#get-more-reviews"');
    expect(html).toContain("ps-icon-tile");
  });

  test("this week's plan: numbered task cards, status pill, whole-number points chip, How to fix collapsed, action + I did this on one row", () => {
    const html = render();
    expect(html).toMatch(/aria-hidden="true" class="[^"]*rounded-full[^"]*">1<\/span>/);
    expect(html).toMatch(/>2<\/span>/);
    expect(html).toContain("To do");
    expect(html).not.toMatch(/\+\d+\.\d+ pts/);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Open your Google listing and add photos."); // the fix text stays collapsed
    expect(html).toContain("I did this");
  });

  test("reviews explainer: review count and rating each on their own line", () => {
    const html = render();
    expect(html).toContain("<p class=\"text-[12.5px] text-ink-soft\">15 reviews on Google (full credit at 150+).</p>");
    expect(html).toContain("full credit at 40+).</p>");
  });

  test("Google connect is a small Premium card (not a task) — and gone once connected (Grow too, as before)", () => {
    const html = render();
    expect(html).toContain("Unlock live Google insights");
    expect(html).toContain('href="/business/b1/connect-gbp"');
    expect(html).toContain("PostScore Premium");
    expect(render({ gbpConnected: true })).not.toContain("Unlock live Google insights");
    expect(render({ plan: "premium" })).toContain("Unlock live Google insights");
  });

  test("bigger projects: website row with the link-button style; ways to grow: 2-column cards with the neutral pill", () => {
    const html = render();
    expect(html).toContain("Open the Website page");
    expect(html).toContain("grid grid-cols-1 gap-3 sm:grid-cols-2");
    expect(html).toContain("doesn't change your score");
    expect(html).toContain('href="/business/b1/campaigns?tab=coupons"');
  });

  test("confirmed wins in whole points; Spanish renders", () => {
    expect(render()).toContain("+2 pts confirmed");
    const es = render({ locale: "es" });
    expect(es).toContain("a su alcance esta semana");
    expect(es).toContain("se reinicia el lunes");
  });

  test("points labels are always whole numbers", () => {
    expect(taskPointsLabel(task({ weightedPoints: 1.5 }), "weekly", "en")).toBe("Up to +2 pts");
    expect(taskPointsLabel(task({ weightedPoints: 1.4, effort: "quick_win_action" }), "weekly", "en")).toBe("About +1 pts this week");
    expect(taskPointsLabel(task({ weightedPoints: 29.2, weightedPointsHigh: 31.4 }), "weekly", "en")).toContain("+29–31");
  });

  test("no per-page plan switch any more — the one dev-only pill lives in the root layout", () => {
    expect(render({ devPlanSwitch: true })).not.toContain("dev-plan-switch");
  });
});

describe("Growth tabs: This week's plan · Google Profile", () => {
  test("two tabs, no coupon or referral designer on Growth", () => {
    const html = render();
    expect(html).toMatch(/role="tab"[^>]*>This week's plan</);
    expect(html).toContain("Google Profile");
    expect(html).not.toMatch(/role="tab"[^>]*>(Coupons|Refer a friend)</);
  });

  test("Free and Grow: a lock on the Google Profile tab; Premium and Multi: no lock", () => {
    for (const plan of ["free", "grow"] as const) expect(render({ plan })).toMatch(/Google Profile<svg[^>]*tabler-icon-lock/);
    for (const plan of ["premium", "multi"] as const) expect(render({ plan })).not.toContain("tabler-icon-lock");
  });

  test("?tab=google-profile opens the tab: Free/Grow see the real listing + Unlock with Premium; Premium sees search demand", () => {
    const grow = render({ tab: "google-profile" });
    expect(grow).toContain('data-testid="google-profile-panel"');
    expect(grow).not.toContain('id="weekly-plan"');
    expect(grow).toContain("Unlock with Premium");
    expect(grow).toContain("+1 302-800-5116");
    expect(grow).toContain("4.5 ★ · 15 reviews");
    expect(grow).not.toContain('data-testid="search-demand-awaiting"');
    const premium = render({ tab: "google-profile", plan: "premium" });
    expect(premium).not.toContain("Unlock with Premium");
    expect(premium).toContain('data-testid="search-demand-awaiting"');
  });

  test("Spanish tab labels", () => {
    const html = render({ locale: "es" });
    expect(html).toContain("Plan de esta semana");
    expect(html).toContain("Perfil de Google");
  });
});
