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

function render(plan: Plan = "free", locale: "en" | "es" = "en", over: { weekly?: ActionPlanTask[]; moves?: number } = {}) {
  const weekly = over.weekly ?? [PHOTOS, HTTPS];
  const moves = Array.from({ length: over.moves ?? 0 }, (_, i) => ({ id: `m${i}`, title: `Move ${i}`, meta: null, why: "Because.", howTo: "Do it.", href: "/business/b1/campaigns", signal: "x" })) as never;
  return renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      <UpgradeProvider value={{ businessId: "b1", plan, facts: { ...NO_FACTS, issueCount: 3 }, cards: [] }}>
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
            tasks: [...weekly, HOURS],
            completed: [{ checkId: "completeness.hours", label: "Hours", pointsGained: 1.6 } as never],
            weeklyTasks: weekly,
            laterTasks: [HOURS],
            weeklyProjectedBreakdown: projected,
            weeklyProjectedBreakdownHigh: null,
            weeklyPointsWithinReach: 2,
            websiteBanner: null,
          }}
          growthMoves={moves}
          weeklyChecklist={{ items: buildWeeklyChecklistItems(locale), checkedItemIds: ["post_update"], streakWeeks: 3, weekStart: "2026-10-12" }}
        />
      </UpgradeProvider>
    </LocaleProvider>
  );
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("Growth on Free: every section is advice, fully hidden — only titles, real counts and one line each", () => {
  test("no task, step or habit text is in the page; only real counts", () => {
    const html = render();
    const t = text(html);
    for (const hidden of ["Photos", "Only 4 photos.", "Secure website (HTTPS)", "Opening hours", "No hours on Google.", "Open your Google listing and add photos.", buildWeeklyChecklistItems("en")[0].title])
      expect(t, hidden).not.toContain(hidden);
    expect(t).toContain("2 fixes · 7 pts");
    expect(t).toContain("5 weekly habits");
    expect(t).toContain("1 fix · 5 pts");
    expect(html).not.toMatch(/<input[^>]*type="checkbox"/);
  });

  test("each section has its OWN unlock line, never repeated", () => {
    const t = text(render("free", "en", { moves: 3 }));
    for (const line of [
      "Your weekly routine is ready — unlock it with Grow.",
      "Your plan for this week is ready. Unlock it with Grow.",
      "1 bigger project worth about 5 points. Grow shows you how.",
      "Grow gives you a referral program and price check tools.",
    ])
      expect(t.split(line).length - 1, line).toBe(1);
    // Ways to grow: locked, its real count, none of the move text.
    expect(t).toContain("3 ideas");
    expect(t).not.toContain("Move 0");
  });

  test("0 quick wins: a plain sentence, no lone Re-check; the locked Re-check sits in Bigger projects", () => {
    const html = render("free", "en", { weekly: [] });
    expect(text(html)).toContain("No quick wins this week — your next gains are in Bigger projects.");
    const weeklyAt = html.indexOf('id="weekly-plan"');
    const recheckAt = html.indexOf('data-testid="free-recheck"');
    // HOURS (Bigger projects) isn't website work → no Re-check at all here…
    expect(recheckAt).toBe(-1);
    // …and with website work, the Re-check comes after the Bigger projects preview.
    const withWeb = render("free");
    expect(withWeb.indexOf('data-testid="free-recheck"')).toBeGreaterThan(withWeb.lastIndexOf('data-testid="locked-preview"'));
    expect(weeklyAt).toBeGreaterThan(-1);
  });

  test("no celebrations, completed-task card, streak or 'Unlock live Google insights' card on Free", () => {
    const html = render();
    expect(text(html)).not.toMatch(/3 weeks in a row|Hours.*\+1\.6|Unlock live Google insights/);
  });

  test("links into Growth still land: #weekly-plan, #weekly-routine and each task's anchor", () => {
    const html = render();
    for (const id of ["weekly-plan", "weekly-routine", "task-completeness-photos", "task-website-https", "task-completeness-hours"]) expect(html, id).toContain(`id="${id}"`);
  });

  test("Spanish", () => {
    const t = text(render("free", "es"));
    expect(t).toContain("Su rutina semanal está lista: desbloquéela con Grow.");
    expect(t).toContain("Su plan para esta semana está listo. Desbloquéelo con Grow.");
  });

  test("Grow, Premium and Multi: the working plan, unchanged (the Google connect card included, as before)", () => {
    for (const plan of ["grow", "premium", "multi"] as Plan[]) {
      const html = render(plan);
      expect(html, plan).not.toContain("free-growth-plan");
      expect(html, plan).toMatch(/<button[^>]*>I did this<\/button>/);
      expect(text(html), plan).toContain("3 weeks in a row");
    }
    expect(text(render("grow"))).toContain("Unlock live Google insights");
    expect(text(render("free"))).not.toContain("Unlock live Google insights");
  });
});

describe("no paid calls on Free from Growth", () => {
  test("the website Re-check action refuses on Free before any PageSpeed / site check", () => {
    const src = readFileSync("app/actions/websiteRecheck.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function recheckWebsite("));
    expect(fn.indexOf('if ((await getPlan()) === "free")')).toBeGreaterThan(0);
    expect(fn.indexOf('if ((await getPlan()) === "free")')).toBeLessThan(fn.indexOf("recheckWebsiteWithClient"));
  });
  test("on Free the Growth page returns its showroom FIRST, before any of its own data loads", () => {
    const page = readFileSync("app/business/[id]/growth/page.tsx", "utf8");
    expect(page.indexOf('await freeShowroom(params.id, "growth")')).toBeGreaterThan(0);
    expect(page.indexOf('await freeShowroom(params.id, "growth")')).toBeLessThan(page.indexOf("await Promise.all("));
  });

  test("the Growth page loads nothing that calls Google, PageSpeed or the AI", () => {
    const page = readFileSync("app/business/[id]/growth/page.tsx", "utf8");
    for (const paid of ["recheckWebsite(", "rescanBusiness", "runAndSaveCompetitorScan", "callAnthropic", "sendAssistantMessage", "assessPricing", "lookupBusinessByPlaceId", "searchNearby"])
      expect(page, paid).not.toContain(paid);
  });
});
