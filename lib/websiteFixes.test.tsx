import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { generateSuggestions, parseWebsiteAnalysis, scoreBusiness, type BusinessScoringInput, type CheckResult } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { detectWebsiteBuilder } from "./websiteBuilder";
import { websiteFixesFor, websiteFixPlan } from "./websiteFixes";
import { CategoryCard } from "@/components/scoring/CategoryCard";
import { WebsiteScoreBreakdown, websiteFixSummary } from "@/app/business/[id]/website/WebsiteScoreBreakdown";

// Day 4 Step 3 — see ~/Desktop/website-fixes-inventory.md.

function withContent(overrides: Partial<NonNullable<BusinessScoringInput["websiteAnalysis"]>["content"]>, extra: Partial<BusinessScoringInput> = {}): BusinessScoringInput {
  const base = scoringInput();
  return {
    ...base,
    ...extra,
    websiteAnalysis: { ...base.websiteAnalysis!, content: { ...base.websiteAnalysis!.content!, ...overrides } },
  };
}
const adviceFor = (input: BusinessScoringInput, id: string, locale: "en" | "es" = "en") =>
  generateSuggestions(scoreBusiness(input, locale), locale).find((s) => s.checkId === id)?.advice;

describe("advice for exactly what's missing", () => {
  test("Bánh Mì Boy's shape — only the viewport tag is missing → only the viewport advice", () => {
    const input = withContent({ hasTitle: true, hasMetaDescription: true, hasViewportTag: false, headingCount: 5, visibleTextLength: 1041 });
    const advice = adviceFor(input, "website.content_depth")!;
    expect(advice).toContain("isn't set up for phones");
    expect(advice).not.toMatch(/meta description|page title|headings/i);
  });

  test("only the meta description missing → only the meta advice (EN + ES)", () => {
    const input = withContent({ hasMetaDescription: false });
    expect(adviceFor(input, "website.content_depth")).toMatch(/^Add a meta description/);
    expect(adviceFor(input, "website.content_depth", "es")).toMatch(/^Agregue una meta descripción/);
  });

  test("contact & conversion: a missing call-to-action alone never asks for a phone link", () => {
    const ctaOnly = adviceFor(withContent({ hasPhoneLink: true, hasCtaText: false }), "website.contact_conversion")!;
    expect(ctaOnly).toMatch(/clear button/);
    expect(ctaOnly).not.toMatch(/tap-to-call/);
    const both = adviceFor(withContent({ hasPhoneLink: false, hasEmailLink: false, hasContactPageLink: false, hasCtaText: false }), "website.contact_conversion")!;
    expect(both).toMatch(/tap-to-call/);
    expect(both).toMatch(/clear button/);
  });

  test("no 'speed up your site' at 90+/100; still shown at 60/100", () => {
    const at = (score: number) =>
      adviceFor({ ...scoringInput(), websiteAnalysis: { ...scoringInput().websiteAnalysis!, mobilePerformance: { method: "lab", fieldCategory: null, labScore: score } } }, "website.performance_mobile");
    expect(at(97)).toBeUndefined();
    expect(at(90)).toBeUndefined();
    expect(at(60)).toMatch(/^Speed up your site/);
  });
});

function check(id: string, earned: number | null, max: number, gaps?: string[]): CheckResult {
  return { id, label: id, category: "website", maxPoints: max, earnedPoints: earned, confidence: earned === null ? "NOT_FOUND" : "VERIFIED", explanation: "", meta: null, ...(gaps ? { gaps } : {}) };
}
// Bánh Mì Boy's real website checks today (see the inventory).
const BANH_MI_BOY: CheckResult[] = [
  check("website.has_website", 4, 4),
  check("website.https", 6, 6),
  check("website.performance_mobile", 4.9, 5),
  check("website.content_depth", 3.5, 5, ["viewport"]),
  check("website.contact_conversion", 3, 3),
  check("website.about_presence", 1, 1),
  check("website.services_presence", 1, 1),
  check("website.social_links", 1, 1),
  check("website.security", 0, 2),
  check("website.info_consistency", 0.5, 1),
  check("website.notice_freshness", 0, 0.5),
  check("website.site_freshness", 0, 0.5),
];

describe("one honest label per fix, and the summary line", () => {
  test("Bánh Mì Boy: 3 fixes you can do yourself (~12–30 min) · 2 need a web person", () => {
    const plan = websiteFixPlan(BANH_MI_BOY, null);
    expect(plan.fixes.map((f) => [f.checkId, f.gap, f.kind])).toEqual([
      ["website.content_depth", "viewport", "web_person"],
      ["website.security", null, "web_person"],
      ["website.info_consistency", null, "guided"],
      ["website.notice_freshness", null, "guided"],
      ["website.site_freshness", null, "guided"],
    ]);
    expect(websiteFixSummary(plan, "en")).toBe("3 fixes you can do yourself (~12–30 min) · 2 need a web person");
    expect(websiteFixSummary(plan, "es")).toBe("3 mejoras que puede hacer usted mismo (~12–30 min) · 2 necesitan a un encargado web");
  });

  test("a minor speed gap is never a fix; excluded checks are never fixes", () => {
    expect(websiteFixesFor(check("website.performance_mobile", 4.9, 5), null)).toEqual([]);
    expect(websiteFixesFor(check("website.about_presence", null, 1), null)).toEqual([]);
  });

  test("a hosted builder makes SSL/speed/viewport owner-doable; unknown or WordPress needs a web person", () => {
    expect(websiteFixesFor(check("website.https", 0, 6), "squarespace")[0]).toMatchObject({ kind: "guided", minutes: { min: 5, max: 10 } });
    expect(websiteFixesFor(check("website.https", 0, 6), "wordpress")[0].kind).toBe("web_person");
    expect(websiteFixesFor(check("website.https", 0, 6), null)[0].kind).toBe("web_person");
  });

  test("no website at all: PostScore can do it for you (the starter site)", () => {
    expect(websiteFixesFor(check("website.has_website", 0, 4, ["missing"]), null)[0].kind).toBe("postscore_does");
  });

  test("one fix per missing content item", () => {
    expect(websiteFixesFor(check("website.content_depth", 2, 5, ["title", "meta"]), null).map((f) => f.gap)).toEqual(["title", "meta"]);
  });

  test("singular and empty summaries", () => {
    expect(websiteFixSummary(websiteFixPlan([check("website.social_links", 0, 1)], null), "en")).toBe("1 fix you can do yourself (~5–10 min)");
    expect(websiteFixSummary(websiteFixPlan([check("website.security", 0, 2)], null), "en")).toBe("1 fix needs a web person");
    expect(websiteFixSummary(websiteFixPlan([check("website.social_links", 1, 1)], null), "en")).toBe("Nothing to fix on the website checks we could run.");
  });
});

describe("results, not confidence: no more '0 / 1 · Verified'", () => {
  test("Done / Needs work / Couldn't check (EN + ES)", () => {
    const category = { id: "website" as const, label: "Website", earnedPoints: 1, possiblePoints: 2, relativeScore: 50, weight: 30, checks: [check("website.social_links", 1, 1), check("website.about_presence", 0, 1), check("website.https", null, 6)] };
    const en = renderToStaticMarkup(<LocaleProvider locale="en"><CategoryCard category={category as never} /></LocaleProvider>).replace(/&#x27;/g, "'");
    expect(en).toContain("Done");
    expect(en).toContain("Needs work");
    expect(en).toContain("Couldn't check");
    expect(en).not.toContain("Verified");
    const es = renderToStaticMarkup(<LocaleProvider locale="es"><CategoryCard category={category as never} /></LocaleProvider>);
    expect(es).toContain("Por mejorar");
  });
});

describe("website builder detection (no extra request)", () => {
  test("generator tag, asset hosts, hostname, PageSpeed — in that order", () => {
    expect(detectWebsiteBuilder({ html: '<meta name="generator" content="Wix.com Website Builder">', hostname: "joes.com" })).toEqual({ id: "wix", source: "generator" });
    expect(detectWebsiteBuilder({ html: '<meta content="WordPress 6.6" name="generator">', hostname: "x.com" })).toEqual({ id: "wordpress", source: "generator" });
    expect(detectWebsiteBuilder({ html: '<link href="https://static1.squarespace.com/static/x.css">', hostname: "joes.com" })).toEqual({ id: "squarespace", source: "assets" });
    expect(detectWebsiteBuilder({ html: '<script src="//cdn.shopify.com/s/files/x.js">', hostname: "shop.com" }).id).toBe("shopify");
    expect(detectWebsiteBuilder({ html: '<img src="https://img1.wsimg.com/isteam/x.jpg">', hostname: "a.com" }).id).toBe("godaddy");
    expect(detectWebsiteBuilder({ html: '<script src="https://cdn3.editmysite.com/js/x.js">', hostname: "a.com" }).id).toBe("square");
    expect(detectWebsiteBuilder({ html: "<p>hi</p>", hostname: "sites.google.com" })).toEqual({ id: "google_sites", source: "hostname" });
    expect(detectWebsiteBuilder({ html: "<p>hi</p>", hostname: "www.joes.wixsite.com" }).id).toBe("wix");
    expect(detectWebsiteBuilder({ html: "<p>hi</p>", hostname: "joes.com", stackPackIds: ["wordpress"] })).toEqual({ id: "wordpress", source: "pagespeed" });
  });

  test("nothing recognizable → not detected (never a guess)", () => {
    expect(detectWebsiteBuilder({ html: "<html><p>Hand-made site</p></html>", hostname: "joes.com", stackPackIds: ["react"] })).toEqual({ id: null, source: null });
  });

  test("the result survives saving and reading back", () => {
    const saved = parseWebsiteAnalysis({ ...scoringInput().websiteAnalysis, builder: { id: "wix", source: "generator" } });
    expect(saved?.builder).toEqual({ id: "wix", source: "generator" });
    expect(parseWebsiteAnalysis({ ...scoringInput().websiteAnalysis, builder: { id: "made_up", source: "x" } })?.builder).toEqual({ id: null, source: null });
    expect(parseWebsiteAnalysis(scoringInput().websiteAnalysis)?.builder).toBeUndefined();
  });
});

describe("the Website page shows the summary and the builder", () => {
  function render(builder: { id: "wix" | null; source: "generator" | null } | undefined, locale: "en" | "es" = "en") {
    const input = withContent({ hasMetaDescription: false });
    const analysis = { ...input.websiteAnalysis!, ...(builder !== undefined ? { builder } : {}) };
    const breakdown = scoreBusiness({ ...input, websiteAnalysis: analysis }, locale);
    return renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <WebsiteScoreBreakdown
          websiteCategory={breakdown.categories.find((c) => c.id === "website")!}
          websiteAnalysis={analysis}
          websiteSuggestions={generateSuggestions(breakdown, locale).filter((s) => s.category === "website")}
        />
      </LocaleProvider>
    ).replace(/&#x27;/g, "'");
  }

  test("summary line, per-fix label, 'Built with Wix'", () => {
    const html = render({ id: "wix", source: "generator" });
    expect(html).toMatch(/fixes? you can do yourself \(~\d+–\d+ min\)/);
    expect(html).toContain("PostScore guides you · ~5–10 min");
    expect(html).toContain("Built with Wix");
  });

  test("'Builder not detected' after a scan found none; 'checked on your next scan' before any; Spanish", () => {
    expect(render({ id: null, source: null })).toContain("Builder not detected");
    expect(render(undefined)).toContain("Builder: checked on your next scan");
    expect(render({ id: "wix", source: "generator" }, "es")).toContain("Hecho con Wix");
  });
});

describe("before a scan with detection, the site's own address can name the builder", () => {
  test("a sites.google.com site shows 'Built with Google Sites' right away", () => {
    const input = scoringInput();
    const breakdown = scoreBusiness(input, "en");
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <WebsiteScoreBreakdown
          websiteCategory={breakdown.categories.find((c) => c.id === "website")!}
          websiteAnalysis={input.websiteAnalysis}
          websiteSuggestions={[]}
          siteUrl="https://sites.google.com/view/modernliquors"
        />
      </LocaleProvider>
    );
    expect(html).toContain("Built with Google Sites");
  });
});
