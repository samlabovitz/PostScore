import { describe, expect, test } from "vitest";


import { breakdownFromChecks, partlyCheckedWebsiteWeight, scoreBusiness, SCORING_V113, SCORING_V1131, SCORING_VERSION, type BusinessScoringInput, type CheckResult, type WebsiteContentSignals } from "./scoring";
import { checkOutcome } from "@/components/scoring/CategoryCard";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { WebsiteCoverageNote } from "@/components/scoring/WebsiteCoverageNote";

const BASE = scoringInput();
const withContent = (extra: Partial<WebsiteContentSignals>): BusinessScoringInput => {
  const wa = BASE.websiteAnalysis!;
  return { ...BASE, websiteAnalysis: { ...wa, content: { ...wa.content!, ...extra } } };
};
const social = (input: BusinessScoringInput, locale: "en" | "es" = "en") => scoreBusiness(input, locale).checks.find((c) => c.id === "website.social_links")!;
const BROKEN = [
  { platform: "X/Twitter", href: "#", reason: "own_site" as const },
  { platform: "YouTube", href: "#", reason: "own_site" as const },
];

describe("v1.13.1", () => {
  test("SCORING_VERSION is 1.14.0, with 1.13.0's and 1.13.1's rules still on", () => {
    expect(SCORING_VERSION).toBe("1.15.0");
    expect(SCORING_V1131).toBe(true);
    expect(SCORING_V113).toBe(true);
  });
});

describe("Social media links (v1.15.0: only “do you link to your profiles?”)", () => {
  test("real profiles and no broken icons = 1/1", () => {
    expect(social(withContent({ socialProfiles: [{ platform: "Instagram", url: "instagram.com/national510" }], brokenSocialLinks: [] })).earnedPoints).toBe(1);
  });

  test("the real National 5 & 10 case: real profiles + Twitter (X) and YouTube icons that reload the site = Social links 1/1; the two icons are “No broken links or dead pages”'s (EN + ES)", () => {
    const input = withContent({
      socialProfiles: [
        { platform: "Instagram", url: "instagram.com/national510" },
        { platform: "Facebook", url: "facebook.com/national5and10" },
        { platform: "Pinterest", url: "pinterest.com/National510" },
      ],
      brokenSocialLinks: BROKEN,
    });
    const c = social(input);
    expect(c.earnedPoints).toBe(1);
    expect(checkOutcome(c)).toBe("done");
    const withLinks: BusinessScoringInput = { ...input, websiteAnalysis: { ...input.websiteAnalysis!, linkCheck: { checkedAt: "2026-11-09T00:00:00Z", checked: 6, problems: [] } } };
    const links = scoreBusiness(withLinks).checks.find((x) => x.id === "website.links")!;
    // 6 links opened + 5 social icons; 2 broken → 2 − 2.
    expect(links.earnedPoints).toBe(0);
    expect(links.explanation).toBe("2 of 11 links need fixing.");
    expect(scoreBusiness(withLinks, "es").checks.find((x) => x.id === "website.links")!.explanation).toBe("2 de 11 enlaces necesitan arreglo.");
    expect(links.gaps).toEqual(["broken_link"]); // social icons: not Urgent
    expect(JSON.parse(links.meta!.linkProblems).map((p: { platform: string; problem: string }) => `${p.platform}:${p.problem}`)).toEqual(["X/Twitter:loops_home", "YouTube:loops_home"]);
  });

  test("the real Monkey's Uncle case: only broken icons = not scored, so a broken icon never counts twice (EN + ES)", () => {
    const input = withContent({ socialProfiles: [], brokenSocialLinks: BROKEN });
    const c = social(input);
    expect(c.earnedPoints).toBeNull();
    expect(c.gaps).toBeUndefined();
    expect(c.explanation).toMatch(/This check is left out of your score: your site's social icons don't lead to a profile, and broken links are already counted under “No broken links or dead pages”\.$/);
    expect(social(input, "es").explanation).toMatch(/Este apartado queda fuera de su puntuación: .*«Sin enlaces rotos ni páginas sin contenido»\.$/);
    // The icons still cost points once — in the links check (2 broken → 2 − 2).
    const withLinks: BusinessScoringInput = { ...input, websiteAnalysis: { ...input.websiteAnalysis!, linkCheck: { checkedAt: "2026-11-09T00:00:00Z", checked: 4, problems: [] } } };
    expect(scoreBusiness(withLinks).checks.find((x) => x.id === "website.links")!.earnedPoints).toBe(0);
  });
});

describe("Website partly checked: its weight in the total is the share checked", () => {
  // Left-out website checks are "unreachable" (a site that blocks our checks).
  const check = (id: string, category: CheckResult["category"], max: number, earned: number | null): CheckResult => ({
    id, label: id, category, maxPoints: max, earnedPoints: earned, confidence: earned === null ? "NOT_FOUND" : "VERIFIED", explanation: "", meta: null,
    ...(earned === null && category === "website" ? { excludedReason: "unreachable" as const } : {}),
  });
  const listing = [check("completeness.phone", "completeness", 30, 30)];
  const reviews = [check("visibility.rating", "visibility", 40, 20)];
  const blockedSite = [check("website.has_website", "website", 4, 4), check("website.performance_mobile", "website", 4, 4), check("website.https", "website", 6, null), check("website.content_depth", "website", 16, null)];

  test("a site that blocks our checks (8 of 30 checked): Website counts as 8, so the total leans on Listing and Reviews", () => {
    const b = breakdownFromChecks([...reviews, ...listing, ...blockedSite]);
    const website = b.categories.find((c) => c.id === "website")!;
    expect(website.possiblePoints).toBe(8);
    expect(partlyCheckedWebsiteWeight(website)).toBe(8);
    // (20 + 30 + 8) / (40 + 30 + 8) = 74.4 — was (20 + 30 + 30) / 100 = 80.
    expect(b.total).toBe(74);
  });

  test("no website at all is a real weakness, never scaled", () => {
    const noSite = [check("website.has_website", "website", 4, 0), check("website.https", "website", 26, null)];
    const b = breakdownFromChecks([...reviews, ...listing, ...noSite]);
    expect(partlyCheckedWebsiteWeight(b.categories.find((c) => c.id === "website")!)).toBe(30);
    // (20 + 30 + 0) / 100.
    expect(b.total).toBe(50);
  });

  test("a website not checked yet (a new site, the starter-site projection) is never scaled", () => {
    const notYet = blockedSite.map((c) => (c.earnedPoints === null ? { ...c, excludedReason: "not_checked_yet" as const } : c));
    const b = breakdownFromChecks([...reviews, ...listing, ...notYet]);
    expect(partlyCheckedWebsiteWeight(b.categories.find((c) => c.id === "website")!)).toBe(30);
    expect(b.total).toBe(80);
  });

  test("half or more checked: unchanged", () => {
    const half = [check("website.has_website", "website", 4, 4), check("website.https", "website", 11, 11), check("website.content_depth", "website", 15, null)];
    const b = breakdownFromChecks([...reviews, ...listing, ...half]);
    expect(partlyCheckedWebsiteWeight(b.categories.find((c) => c.id === "website")!)).toBe(30);
    expect(b.total).toBe(80);
  });
});

describe("the owner's line (EN + ES)", () => {
  test("“Website: partly checked — based on 8 of 30 points”", () => {
    const c = (id: string, max: number, earned: number | null, reason?: "unreachable"): CheckResult => ({
      id, label: id, category: "website", maxPoints: max, earnedPoints: earned, confidence: earned === null ? "NOT_FOUND" : "VERIFIED", explanation: "", meta: null, ...(reason ? { excludedReason: reason } : {}),
    });
    const website = breakdownFromChecks([c("website.has_website", 4, 4), c("website.performance_mobile", 4, 4), c("website.content_depth", 22, null, "unreachable")]).categories.find((x) => x.id === "website")!;
    const render = (locale: "en" | "es") => renderToStaticMarkup(<LocaleProvider locale={locale}><WebsiteCoverageNote category={website} hasWebsite scoreBasis={78} /></LocaleProvider>);
    expect(render("en")).toContain("Website: partly checked — based on 8 of 30 points");
    expect(render("es")).toContain("Sitio web: revisado en parte, basado en 8 de 30 puntos");
  });
});

