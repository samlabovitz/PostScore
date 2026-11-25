// The Website page's starter-site comparison (lib/starterComparison.ts): both sides real, never estimated.
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { starterComparison } from "@/lib/starterComparison";

describe("starter site comparison", () => {
  test("the starter scores higher: recommended", () => {
    expect(starterComparison({ hasWebsite: true, current: { earned: 22, of: 30 }, starter: 28 })).toEqual({ kind: "recommended", current: 22, starter: 28, of: 30 });
  });
  test("the same or lower: keep the current site", () => {
    expect(starterComparison({ hasWebsite: true, current: { earned: 29, of: 30 }, starter: 27 })?.kind).toBe("keep");
    expect(starterComparison({ hasWebsite: true, current: { earned: 27, of: 30 }, starter: 27 })?.kind).toBe("keep");
  });
  test("no website: what it would add (never negative)", () => {
    expect(starterComparison({ hasWebsite: false, current: { earned: 0, of: 30 }, starter: 26 })).toEqual({ kind: "add", starter: 26, gain: 26, of: 30 });
    expect(starterComparison({ hasWebsite: false, current: null, starter: 26 })).toMatchObject({ gain: 26 });
  });
  test("nothing honest to compare: no line", () => {
    expect(starterComparison({ hasWebsite: true, current: null, starter: 26 })).toBeNull();
    expect(starterComparison({ hasWebsite: true, current: { earned: 20, of: 30 }, starter: null })).toBeNull();
  });
  test("both sides come from the real scoring: the saved scan's whole points, and the template's own HTML scored by scoreBusiness()", () => {
    const src = readFileSync("app/actions/website.ts", "utf8");
    expect(src).toContain("points: websiteWholePoints(templateBreakdown.categories)?.earned ?? null");
    expect(src).toContain("buildTemplateScoringInput(business, data, locale, TEMPLATE_HOSTING_UNKNOWN)");
    expect(readFileSync("app/business/[id]/website/page.tsx", "utf8")).toContain("starterComparison({ hasWebsite: realSite, current: data.categoryPoints ?? null, starter: builderOffer.templatePoints })");
  });
});

describe("the Website page uses the site the scan graded (Kee's Cookies, Nov 24)", () => {
  test("listing unreadable live (failed read, cap, dev run): the scan's graded site, never 'no website'", () => {
    const src = readFileSync("app/actions/website.ts", "utf8");
    expect(src).toContain('fromRowShown ?? (scanSite ? { url: scanSite, source: "scan" } : null)');
    expect(src).toContain("|| graded !== null;");
  });
  test("listing read, no link, a scan-graded site: 'Your website isn't on your Google listing yet: add it →'", () => {
    expect(readFileSync("app/actions/website.ts", "utf8")).toContain("const notOnListing = !fromRow && !!scanSite && data.live_unavailable !== true;");
    expect(readFileSync("app/business/[id]/website/WebsiteGeneratorSection.tsx", "utf8")).toContain('googleListingHref(businessId, { hash: "listing-website" })');
  });
});

describe("listing unreadable: every page keeps the site the scan graded", () => {
  test("page scoring and the live-listing merge fall back to our own graded site, never 'no website'", () => {
    expect(readFileSync("app/actions/scoring.ts", "utf8")).toContain('{ ...business, ...emptyListingColumns(), website: gradedSiteUrl(business.website_analysis_json) }');
    expect(readFileSync("lib/ownerListing.server.ts", "utf8")).toContain('if (live.status === "unavailable" && !(merged as { website?: string | null }).website)');
  });
});
