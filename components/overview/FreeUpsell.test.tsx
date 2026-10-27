import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1" }));

import { LocaleProvider, t } from "@/lib/i18n";
import { getScoreWithSuggestions, isMinorSpeedGap, scoreBasisPoints } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { freeWaitingPoints, withoutAdvice, FIX_PLAN_ANCHOR } from "@/lib/freeUpsell";
import { buildGrowBannerTools, GROW_BANNER_REVIEWS_LABEL_KEY, GROW_BANNER_SHOP_LABEL_KEY } from "@/lib/growBannerTools";
import { GrowMoreCustomers } from "./GrowMoreCustomers";
import { ScoreBand } from "./ScoreBand";
import { ScoreBreakdownPanel } from "./ScoreBreakdownPanel";
import { FixPlanBox } from "./FixPlanUpsell";
import { CategoryCard, checkOutcome } from "@/components/scoring/CategoryCard";
import { checkAnchorId } from "@/lib/postaiLinks";

// Free only: the step-by-step path to every missing point, and the tools.

const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") => renderToStaticMarkup(<LocaleProvider locale={locale} timeZone="America/New_York">{node}</LocaleProvider>);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const VIEW = readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8");
const FREE = VIEW.slice(VIEW.indexOf("if (free) {"), VIEW.indexOf('  return (\n    <div className="flex flex-col gap-5 nav:gap-6">'));
const PAID = VIEW.slice(VIEW.indexOf('  return (\n    <div className="flex flex-col gap-5 nav:gap-6">'));
const TOOLS = { referralOk: true, couponsOk: true, pricingOk: true };

const result = getScoreWithSuggestions(scoringInput());
const { breakdown } = result;
const band = (freeWaiting?: number) =>
  wrap(<ScoreBand businessId="b1" score={breakdown.total} grade={breakdown.grade} history={[]} projectedScore={result.projectedBreakdown.total} projectedGrade={result.projectedBreakdown.grade} biggestBoost={null} freeWaitingPoints={freeWaiting} />);
const rows = () => wrap(<>{breakdown.categories.map((c) => <CategoryCard key={c.id} category={c} embedded fixLinks={{}} lockedFixes />)}</>);
const panel = (audit: boolean) => wrap(<ScoreBreakdownPanel businessId="b1" categories={breakdown.categories} hasWebsite scoreBasis={scoreBasisPoints(breakdown.categories)} audit={audit} websiteFixCount={null} />);

describe("the upgrade box shows only on Free", () => {
  test("Free: four headed sections in order — A score, C breakdown (then rank), D free tools (Reviews, then PostAI), B earn last (one combined card, then Unlock more at the very end)", () => {
    const order = [
      '<FreeSection id="score"', "<ScoreBand", "<RescanMessages",
      '<FreeSection id="behind"', "<ScoreBreakdownPanel", "<LocalBenchmarkTile",
      '<FreeSection id="tools"', "<FreeReviews", "<FreePostAI ",
      '<FreeSection id="earn"', "<FixPlanBox", "extras={{ hasWebsite, pricingOk: profileTools.pricingOk, campaignsOk: profileTools.couponsOk || profileTools.referralOk, monthlyReportsLive }}", "<GrowMoreCustomers", "embedded", "</FixPlanBox>",
    ];
    let at = -1;
    for (const piece of order) {
      const i = FREE.indexOf(piece, at + 1);
      expect(i, piece).toBeGreaterThan(at);
      at = i;
    }
    // "See how to fix it" (score card) scrolls down to the combined card.
    expect(band(freeWaitingPoints(breakdown.total))).toContain(`href="#${FIX_PLAN_ANCHOR}"`);
    expect(wrap(<FixPlanBox businessId="b1" />)).toContain(`id="${FIX_PLAN_ANCHOR}"`);
    for (const piece of ["<FixPlanBox", "<GrowMoreCustomers", "<ScoreBreakdownPanel", "<FreeReviews", "<FreePostAI "]) expect(FREE.split(piece).length - 1, piece).toBe(1);
    // No separate "Unlock more with a plan" card on Free — it's the combined card's third part.
    expect(FREE).not.toContain("UnlockMore");
  });

  test("section headers: heading + one plain sentence, EN and ES", () => {
    const keys = ["score", "earn", "behind", "tools"] as const;
    for (const k of keys) {
      for (const locale of ["en", "es"] as const) {
        expect(t(locale, `dashboard.free.section.${k}.title` as never)).toBeTruthy();
        expect(t(locale, `dashboard.free.section.${k}.body` as never)).toMatch(/\.$/);
      }
    }
    expect(t("en", "dashboard.free.section.tools.title" as never)).toBe("Free tools you can use now");
  });

  test("Grow, Premium and Multi: no upgrade box, no locked rows, no “See how to fix it”", () => {
    expect(PAID).not.toContain("FixPlanBox");
    expect(PAID).not.toMatch(/\baudit\b/);
    expect(band(undefined)).not.toContain('data-testid="see-how-to-fix"');
    expect(panel(false)).not.toContain('data-testid="locked-fix"');
  });

  const combined = (locale: "en" | "es" = "en") =>
    wrap(
      <FixPlanBox businessId="b1">
        <GrowMoreCustomers businessId="b1" profileTools={TOOLS} reviewCount={10} nearbyReviewAverage={null} locked embedded />
      </FixPlanBox>,
      locale
    );

  test("ONE card: the plans on top, a soft divider, the More customers tiles below — one background, one set of upgrade buttons", () => {
    const html = combined();
    const tx = text(html);
    expect(html).toContain(`id="${FIX_PLAN_ANCHOR}"`);
    // One card surface (tiles only lift on hover).
    expect(html.match(/[\s"]shadow-card[\s"]/g)).toHaveLength(1);
    expect(tx.indexOf("Earn back your missing points, step by step")).toBeLessThan(tx.indexOf("More customers"));
    expect(tx).toContain("Grow · $25/mo");
    expect(tx).toContain("Premium · $50/mo");
    expect(html.match(/href="\/business\/b1\/settings#compare-plans"/g)).toHaveLength(2);
    expect(html).not.toContain('data-testid="more-customers-unlock"');
    expect(tx).not.toContain("Plus tools to bring customers in");
    // The real tiles, with their lock/plan badges.
    for (const key of [GROW_BANNER_REVIEWS_LABEL_KEY, ...buildGrowBannerTools("b1", TOOLS).map((x) => x.labelKey), GROW_BANNER_SHOP_LABEL_KEY]) expect(tx).toContain(t("en", key));
    expect(html).toContain('data-testid="locked-tool"');
    expect(text(combined("es"))).toContain("Recupere sus puntos faltantes, paso a paso");
  });

  test("third part: a collapsed “See everything in each plan” — grouped Grow / Premium / Add-on, an outcome headline + one plain line, real badges and “Coming soon”, no extra buttons", () => {
    const html = wrap(<FixPlanBox businessId="b1" extras={{ hasWebsite: true, pricingOk: true, campaignsOk: true }} />);
    const button = html.match(/<button[^>]*data-testid="fix-plan-extras-toggle"[^>]*>[\s\S]*?<\/button>/)![0];
    expect(button).toContain('aria-expanded="false"');
    expect(text(button)).toContain("See everything in each plan");
    expect(html).toMatch(/<div id="[^"]+" hidden=""[^>]*data-testid="fix-plan-extras-list"/);
    const group = (g: string) => html.slice(html.indexOf(`data-testid="plan-group-${g}"`));
    expect(html.indexOf('data-testid="plan-group-grow"')).toBeLessThan(html.indexOf('data-testid="plan-group-premium"'));
    expect(html.indexOf('data-testid="plan-group-premium"')).toBeLessThan(html.indexOf('data-testid="plan-group-addOn"'));
    const row = (id: string) => text(html.match(new RegExp(`<li[^>]*data-testid="plan-extra-${id}"[^>]*>[\\s\\S]*?</li>`))![0]).trim();
    expect(row("starterSite")).toBe("A one-page website, ready today Download your starter site and put it online anywhere. Grow");
    expect(row("priceCheck")).toMatch(/^Know if your prices fit your area Price check compares your prices with nearby competitors' price levels, plus pricing tips for your type of business\. Grow$/);
    expect(row("reviewScripts")).toContain("Ready-to-copy scripts for asking customers, in English and Spanish");
    expect(row("moreDrafts")).toContain("10 AI review reply drafts a week (3 on Free).");
    expect(row("fixGuides")).toMatch(/Guides written for .+, check by check\./);
    expect(row("pdfReports")).toMatch(/Download your weekly report as a PDF\. Premium$/);
    expect(row("googleProfile")).toMatch(/Coming soon Premium$/);
    expect(row("aiReplies")).toMatch(/Coming soon Premium$/);
    expect(row("campaignHub")).toMatch(/Coming soon Premium$/);
    expect(row("postaiUnlimited")).not.toContain("Coming soon");
    expect(row("postStudio")).toMatch(/\$30\/mo on its own.*Coming soon Add-on$/);
    expect(group("addOn")).toContain('data-testid="plan-extra-postStudio"');
    // Only the two "See plans" buttons.
    expect(html.match(/href="\/business\/b1\/settings#compare-plans"/g)).toHaveLength(2);
    // Only what this business has: no website → no fix guides or re-check; no price check / campaigns where they don't apply.
    const lean = wrap(<FixPlanBox businessId="b1" extras={{ hasWebsite: false, pricingOk: false, campaignsOk: false }} />);
    for (const id of ["fixGuides", "recheck", "priceCheck", "campaigns"]) expect(lean, id).not.toContain(`data-testid="plan-extra-${id}"`);
    const es = text(wrap(<FixPlanBox businessId="b1" extras={{ hasWebsite: true }} />, "es"));
    expect(es).toContain("Ver todo lo que incluye cada plan");
    expect(es).toContain("Un sitio web de una página, listo hoy");
  });

  test("Grow row: “Your monthly report by email” — Coming soon until MONTHLY_REPORTS_LIVE, then just the Grow badge (EN + ES)", () => {
    const rowOf = (html: string) => text(html.match(/<li[^>]*data-testid="plan-extra-monthlyEmail"[^>]*>[\s\S]*?<\/li>/)![0]).trim();
    const notLive = wrap(<FixPlanBox businessId="b1" extras={{ hasWebsite: true, monthlyReportsLive: false }} />);
    expect(rowOf(notLive)).toBe("Your monthly report by email Your score, what changed and your next step, in your inbox every month. Coming soon Grow");
    // Under the GROW heading, right after the weekly recap.
    const grow = notLive.slice(notLive.indexOf('data-testid="plan-group-grow"'), notLive.indexOf('data-testid="plan-group-premium"'));
    expect(grow.indexOf('data-testid="plan-extra-recap"')).toBeLessThan(grow.indexOf('data-testid="plan-extra-monthlyEmail"'));
    // Same chip as the other coming-soon rows.
    const chip = (html: string, id: string) => html.match(new RegExp(`<li[^>]*data-testid="plan-extra-${id}"[\\s\\S]*?(<span class="[^"]*">Coming soon</span>)`))![1];
    expect(chip(notLive, "monthlyEmail")).toBe(chip(notLive, "googleProfile"));
    // Left out = not live (the safe default).
    expect(rowOf(wrap(<FixPlanBox businessId="b1" extras={{ hasWebsite: true }} />))).toContain("Coming soon");
    const live = rowOf(wrap(<FixPlanBox businessId="b1" extras={{ hasWebsite: true, monthlyReportsLive: true }} />));
    expect(live).toBe("Your monthly report by email Your score, what changed and your next step, in your inbox every month. Grow");
    expect(rowOf(wrap(<FixPlanBox businessId="b1" extras={{ hasWebsite: true, monthlyReportsLive: false }} />, "es"))).toBe(
      "Su informe mensual por correo Su puntuación, lo que cambió y su próximo paso, en su correo cada mes. Próximamente Grow"
    );
  });

  test("the Overview reads the same flag the scheduled job uses — never hardcoded", () => {
    const page = readFileSync("app/business/[id]/page.tsx", "utf8");
    expect(page).toContain("monthlyReportsLive={isMonthlyReportsLive()}");
    expect(page).toContain('import { isMonthlyReportsLive } from "@/lib/monthlyReportsFeatureFlag";');
    expect(readFileSync("app/api/cron/monthly-reports/route.ts", "utf8")).toContain("if (!isMonthlyReportsLive())");
  });

  test("Free Overview: no separate Grow/Premium promo cards under the combined card (they stay elsewhere)", () => {
    const page = readFileSync("app/business/[id]/page.tsx", "utf8");
    expect(page).toContain("upgrade={free ? { ...upgrade, cards: [] } : upgrade}");
  });

  test("outside Free the More customers banner keeps its own card and unlock row", () => {
    const html = wrap(<GrowMoreCustomers businessId="b1" profileTools={TOOLS} reviewCount={10} nearbyReviewAverage={null} locked />);
    expect(html).toContain("shadow-card");
    expect(PAID).not.toContain("embedded");
  });
});

describe("the “waiting” number is 100 minus the current score", () => {
  test("computed from the real score, so it follows any scoring change", () => {
    expect(breakdown.total).toBeLessThan(100);
    expect(freeWaitingPoints(breakdown.total)).toBe(100 - breakdown.total);
    expect(freeWaitingPoints(47)).toBe(53);
    expect(freeWaitingPoints(100)).toBe(0);
    expect(FREE).toContain("const waiting = freeWaitingPoints(breakdown.total);");
  });

  test("Free: “+N points are waiting”, the plan line and “See how to fix it” to the upgrade box", () => {
    const html = band(freeWaitingPoints(breakdown.total));
    const tx = text(html);
    expect(tx).toContain(`+${100 - breakdown.total}`);
    expect(tx).toContain("Get the step-by-step plan to earn these points back");
    expect(html).toMatch(new RegExp(`<a href="#${FIX_PLAN_ANCHOR}"[^>]*data-testid="see-how-to-fix"`));
  });
});

describe("blurred fix text never contains the real advice on Free", () => {
  const advice = result.suggestions.map((s) => s.advice).filter((a) => a.length > 12);

  test("there is real advice to hide (the fixture needs work)", () => {
    expect(advice.length).toBeGreaterThan(2);
  });

  test("locked rows: under each category's top issue (visible while collapsed) and each “Needs work” check — a placeholder behind the blur, never the advice", () => {
    const summary = panel(true);
    const topIssues = breakdown.categories.filter((c) => c.relativeScore !== null && c.checks.some((check) => checkOutcome(check) === "needs_work" && !isMinorSpeedGap(check))).length;
    expect(topIssues).toBeGreaterThan(0);
    expect(summary.match(/data-testid="locked-fix"/g)).toHaveLength(topIssues);
    // Collapsed: the per-check rows aren't in the page until opened.
    expect(summary).not.toContain('data-testid="locked-fix-blur"');
    expect(text(summary)).toContain("How to fix this — on Grow and Premium");
    const html = rows();
    const needsWork = breakdown.checks.filter((c) => checkOutcome(c) === "needs_work").length;
    expect(html.match(/data-testid="locked-fix-blur"/g)).toHaveLength(needsWork);
    for (const a of advice) {
      expect(summary, a).not.toContain(a.slice(0, 40));
      expect(html, a).not.toContain(a.slice(0, 40));
    }
    expect(html).toMatch(/aria-hidden="true" data-testid="locked-fix-blur"[^>]*class="[^"]*blur-/);
  });

  test("“Couldn't check” rows get no upsell; every “Needs work” row has one", () => {
    const html = rows();
    const row = (id: string) => {
      const start = html.indexOf(`id="${checkAnchorId(id)}"`);
      expect(start, id).toBeGreaterThan(-1);
      const next = html.indexOf('id="check-', start + 10);
      return html.slice(start, next === -1 ? undefined : next);
    };
    const couldnt = breakdown.checks.filter((c) => checkOutcome(c) === "couldnt_check");
    expect(couldnt.length).toBeGreaterThan(0);
    for (const check of couldnt) expect(row(check.id), check.id).not.toContain('data-testid="locked-fix');
    for (const check of breakdown.checks.filter((c) => checkOutcome(c) === "needs_work")) expect(row(check.id), check.id).toContain('data-testid="locked-fix-blur"');
  });

  test("the Free page's data carries no advice at all (not even in what React sends along)", () => {
    const redacted = JSON.stringify(withoutAdvice(result));
    for (const a of advice) expect(redacted).not.toContain(a.slice(0, 40));
    expect(withoutAdvice(result).suggestions.map((s) => s.promisedPoints)).toEqual(result.suggestions.map((s) => s.promisedPoints));
    const page = readFileSync("app/business/[id]/page.tsx", "utf8");
    expect(page).toContain("result={free ? withoutAdvice(scored.result) : scored.result}");
    expect(page).toContain("recommendations={free ? null : recommendations}");
    // PostAI's business context (it carries fix details) is never loaded
    // by the Overview page — only the Free card's plan-aware questions.
    expect(page).toContain("freePostaiQuestions={freePostaiQuestions}");
    expect(page).not.toContain("getAssistantPageData");
  });
});
