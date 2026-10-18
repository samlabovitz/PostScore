import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
const MOVE: GrowthMove = { id: "start_coupon", title: "Start a coupon", meta: null, why: "Brings people back.", howTo: "Pick an offer.", href: "/business/b1/growth?tab=coupons", signal: "x" };

function render(over: { gbpConnected?: boolean; locale?: "en" | "es" } = {}) {
  return renderToStaticMarkup(
    <LocaleProvider locale={over.locale ?? "en"} timeZone="America/New_York">
      <GrowthView
        businessId="b1"
        businessName="Modern Liquors"
        businessPhone={null}
        profile={bizProfileById("salon", over.locale ?? "en")!}
        referralOk
        breakdown={today}
        initialPromos={[]}
        initialReferral={null}
        lastScanAt="2026-10-16T13:00:00Z"
        gbpConnected={over.gbpConnected ?? false}
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
        weeklyChecklist={{ items: buildWeeklyChecklistItems(over.locale ?? "en"), checkedItemIds: ["post_update", "reply_reviews"], streakWeeks: 0 }}
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

  test("Google connect is a small Premium card (not a task) — and gone once connected", () => {
    const html = render();
    expect(html).toContain("Unlock live Google insights");
    expect(html).toContain('href="/business/b1/connect-gbp"');
    expect(html).toContain("PostScore Premium");
    expect(render({ gbpConnected: true })).not.toContain("Unlock live Google insights");
  });

  test("bigger projects: website row with the link-button style; ways to grow: 2-column cards with the neutral pill", () => {
    const html = render();
    expect(html).toContain("Open the Website page");
    expect(html).toContain("grid grid-cols-1 gap-3 sm:grid-cols-2");
    expect(html).toContain("doesn't change your score");
    expect(html).toContain('href="/business/b1/growth?tab=coupons"');
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
});
