import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
  usePathname: () => "/business/b1/growth",
}));
vi.mock("@/app/actions/actionPlan", () => ({ markTaskDone: vi.fn() }));
vi.mock("@/app/actions/weeklyChecklist", () => ({ setWeeklyCheckItem: vi.fn() }));
vi.mock("@/app/actions/websiteRecheck", () => ({ recheckWebsite: vi.fn(), getWebsiteRecheckStatus: vi.fn() }));

import { LocaleProvider } from "@/lib/i18n";
import { GrowthView } from "./GrowthView";
import { buildWeeklyChecklistItems } from "@/lib/weeklyChecklist";
import { scoreBusiness, type ScoreBreakdown } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { bizProfileById } from "@/config/bizProfiles";
import { NO_FACTS } from "@/lib/upgradePromos";
import { UpgradeProvider } from "@/components/upgrade/UpgradeContext";
import type { ActionPlanTask } from "@/lib/actionPlan";
import type { Plan } from "@/lib/plan";

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
const PHOTOS = task({});
const HTTPS = task({ checkId: "website.https", category: "website", label: "Secure website (HTTPS)", problem: "Your site isn't secure.", fix: "Turn on SSL in your builder's settings.", promisedPoints: 4 });
const HOURS = task({ checkId: "completeness.hours", label: "Opening hours", problem: "No hours on Google.", fix: "Add your hours.", promisedPoints: 5, effort: "longer_term" });

function render(plan: Plan = "free", locale: "en" | "es" = "en") {
  return renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      <UpgradeProvider value={{ businessId: "b1", plan, facts: { ...NO_FACTS, issueCount: 3 }, strip: null }}>
        <GrowthView
          businessId="b1"
          businessName="Modern Liquors"
          profile={bizProfileById("salon", locale)!}
          breakdown={today}
          googleProfile={{ listing: null, websiteOnly: false, connected: false, searchDemand: { kind: "awaiting" } }}
          lastScanAt="2026-10-16T13:00:00Z"
          gbpConnected={false}
          plan={plan}
          linkOptions={{ referralOk: true, couponsOk: true, pricingOk: true }}
          actionPlan={{
            tasks: [PHOTOS, HTTPS, HOURS],
            completed: [],
            weeklyTasks: [PHOTOS, HTTPS],
            laterTasks: [HOURS],
            weeklyProjectedBreakdown: projected,
            weeklyProjectedBreakdownHigh: null,
            weeklyPointsWithinReach: 2,
            websiteBanner: null,
          }}
          growthMoves={[]}
          weeklyChecklist={{ items: buildWeeklyChecklistItems(locale), checkedItemIds: ["post_update"], streakWeeks: 3, weekStart: "2026-10-12" }}
        />
      </UpgradeProvider>
    </LocaleProvider>
  );
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("Growth on Free: the plan, routine and projects are locked previews of the real content", () => {
  test("real task titles, what's wrong and points are visible; steps and 'I did this' are locked", () => {
    const html = render();
    const t = text(html);
    expect(html).toContain('data-testid="free-growth-plan"');
    for (const s of ["Photos", "Only 4 photos.", "Secure website (HTTPS)", "Opening hours", "+3 pts", "+4 pts", "+5 pts"]) expect(t).toContain(s);
    // The steps themselves never show, and nothing can be marked done.
    expect(t).not.toContain("Open your Google listing and add photos.");
    expect(t).not.toContain("Turn on SSL");
    expect(html).not.toMatch(/<button[^>]*>[^<]*I did this/);
    // Every preview is inert, with the plan unlock line.
    expect(html.match(/data-testid="locked-preview"/g)).toHaveLength(3);
    expect(html.match(/<div inert=""/g)).toHaveLength(3);
    expect(t).toContain("Your plan for this week is ready. Unlock it with Grow.");
  });

  test("the weekly routine shows its real habits, read-only (no checkboxes, no streak)", () => {
    const html = render();
    const t = text(html);
    expect(t).toContain(buildWeeklyChecklistItems("en")[0].title);
    expect(html).not.toMatch(/<input[^>]*type="checkbox"/);
    expect(t).not.toMatch(/3-week streak|3 weeks in a row/i);
  });

  test("no celebrations or weekly-goal tracking on Free", () => {
    const view = readFileSync("app/business/[id]/growth/GrowthView.tsx", "utf8");
    const start = view.indexOf("{free ? (");
    const freeBranch = view.slice(start, view.indexOf("            </>\n          ) : (", start));
    expect(freeBranch).toContain("<FreeGrowthPlan");
    for (const live of ["WeeklyGoalCelebration", "WeeklyChecklist", "TaskListCard", "CompletedTasksCard"]) expect(freeBranch, live).not.toContain(`<${live}`);
  });

  test("website Re-check is locked (promo box), not the real Re-check", () => {
    const html = render();
    expect(html).toContain('data-testid="free-recheck"');
    expect(html).toMatch(/data-testid="upgrade-trigger" data-feature="recheck"/);
    expect(text(html)).toContain("Unlock with Grow");
  });

  test("links into Growth land on the preview: #weekly-plan, #weekly-routine and each task's anchor exist", () => {
    const html = render();
    for (const id of ["weekly-plan", "weekly-routine", "task-completeness-photos", "task-website-https", "task-completeness-hours"]) expect(html, id).toContain(`id="${id}"`);
  });

  test("Spanish", () => {
    const t = text(render("free", "es"));
    expect(t).toContain("Su plan para esta semana está listo. Desbloquéelo con Grow.");
    expect(t).toContain("Ya lo hice");
    expect(t).toContain("Desbloquear con Grow");
  });

  test("Grow, Premium and Multi: the working plan, unchanged", () => {
    for (const plan of ["grow", "premium", "multi"] as Plan[]) {
      const html = render(plan);
      expect(html, plan).not.toContain("free-growth-plan");
      expect(html, plan).not.toContain("locked-preview");
      expect(html, plan).toMatch(/<button[^>]*>I did this<\/button>/);
      expect(text(html), plan).toContain("3 weeks in a row");
    }
  });
});

describe("no paid calls on Free from Growth", () => {
  test("the website Re-check action refuses on Free before any PageSpeed / site check", () => {
    const src = readFileSync("app/actions/websiteRecheck.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function recheckWebsite("));
    expect(fn.indexOf('if (getPlan() === "free")')).toBeGreaterThan(0);
    expect(fn.indexOf('if (getPlan() === "free")')).toBeLessThan(fn.indexOf("recheckWebsiteWithClient"));
  });
  test("the Growth page loads nothing that calls Google, PageSpeed or the AI", () => {
    const page = readFileSync("app/business/[id]/growth/page.tsx", "utf8");
    for (const paid of ["recheckWebsite(", "rescanBusiness", "runAndSaveCompetitorScan", "callAnthropic", "sendAssistantMessage", "assessPricing", "lookupBusinessByPlaceId", "searchNearby"])
      expect(page, paid).not.toContain(paid);
  });
});
