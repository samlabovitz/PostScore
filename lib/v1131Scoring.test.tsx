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
  test("SCORING_VERSION is 1.13.1, with 1.13.0's rules still on", () => {
    expect(SCORING_VERSION).toBe("1.13.1");
    expect(SCORING_V1131).toBe(true);
    expect(SCORING_V113).toBe(true);
  });
});

describe("Social media links: broken icons cost points", () => {
  test("real profiles and no broken icons = 1/1", () => {
    expect(social(withContent({ socialProfiles: [{ platform: "Instagram", url: "instagram.com/national510" }], brokenSocialLinks: [] })).earnedPoints).toBe(1);
  });

  test("the real National 5 & 10 case: real profiles + broken Twitter (X) and YouTube icons = 0.5/1, Needs work, the broken ones named (EN + ES)", () => {
    const input = withContent({
      socialProfiles: [
        { platform: "Instagram", url: "instagram.com/national510" },
        { platform: "Facebook", url: "facebook.com/national5and10" },
        { platform: "Pinterest", url: "pinterest.com/National510" },
      ],
      brokenSocialLinks: BROKEN,
    });
    const c = social(input);
    expect(c.earnedPoints).toBe(0.5);
    expect(c.confidence).toBe("VERIFIED");
    expect(checkOutcome(c)).toBe("needs_work");
    expect(c.gaps).toEqual(["broken_social"]);
    expect(c.explanation).toContain("Your Twitter (X) and YouTube icons don't go to a profile — they reload your own site. Link them to your real profiles or remove them.");
    expect(social(input, "es").explanation).toContain("Sus íconos de Twitter (X) y YouTube no llevan a un perfil");
  });

  test("only broken icons = 0/1", () => {
    expect(social(withContent({ socialProfiles: [], brokenSocialLinks: BROKEN })).earnedPoints).toBe(0);
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

