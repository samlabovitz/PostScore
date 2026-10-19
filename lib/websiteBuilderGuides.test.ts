import { describe, expect, test } from "vitest";
import { BUILDER_GUIDES, GUIDES_VERIFIED_AT, builderGuideFor, guideTaskFor, webPersonAsk, webPersonMessage } from "./websiteBuilderGuides";
import { WEBSITE_BUILDER_NAMES, type WebsiteBuilderId } from "./websiteBuilder";

// Each builder's guides must point at that builder's OWN help/docs site.
const OFFICIAL_HOSTS: Record<WebsiteBuilderId, RegExp> = {
  wix: /^https:\/\/support\.wix\.com\//,
  squarespace: /^https:\/\/support\.squarespace\.com\//,
  godaddy: /^https:\/\/www\.godaddy\.com\//,
  shopify: /^https:\/\/help\.shopify\.com\//,
  wordpress: /^https:\/\/(wordpress\.com\/support|wordpress\.org\/documentation)\//,
  square: /^https:\/\/squareup\.com\/help\//,
  weebly: /^https:\/\/(www\.)?weebly\.com\//,
  google_sites: /^https:\/\/support\.google\.com\/sites\//,
  webflow: /^https:\/\/(university|help)\.webflow\.com\//,
  duda: /^https:\/\/support\.duda\.co\//,
};

describe("builder guides", () => {
  const all = Object.entries(BUILDER_GUIDES).flatMap(([builder, tasks]) => Object.entries(tasks ?? {}).map(([task, g]) => ({ builder: builder as WebsiteBuilderId, task, g: g! })));

  test("every guide: an official help article, a last-verified date, the same steps in EN and ES", () => {
    expect(all.length).toBeGreaterThanOrEqual(20);
    for (const { builder, task, g } of all) {
      expect(g.url, `${builder}.${task}`).toMatch(OFFICIAL_HOSTS[builder]);
      expect(g.verifiedAt).toBe(GUIDES_VERIFIED_AT);
      expect(g.steps.en.length, `${builder}.${task}`).toBeGreaterThanOrEqual(2);
      expect(g.steps.es.length, `${builder}.${task}`).toBe(g.steps.en.length);
      for (const s of [...g.steps.en, ...g.steps.es]) expect(s.trim().length).toBeGreaterThan(3);
      if (g.limitation) expect(g.limitation.es.trim().length).toBeGreaterThan(10);
    }
  });

  test("every builder we detect has a name; guides only for known builders", () => {
    for (const b of Object.keys(BUILDER_GUIDES)) expect(WEBSITE_BUILDER_NAMES).toHaveProperty(b);
  });

  test("checks map to the owner's job; the phone-layout tag and a hacked site never get builder steps", () => {
    expect(guideTaskFor("website.https", null)).toBe("ssl");
    expect(guideTaskFor("website.content_depth", "meta")).toBe("seo_meta");
    expect(guideTaskFor("website.content_depth", "thin")).toBe("edit_text");
    expect(guideTaskFor("website.content_depth", "viewport")).toBeNull();
    expect(guideTaskFor("website.services_presence", null)).toBe("add_page");
    expect(guideTaskFor("website.contact_conversion", "contact")).toBe("phone_link");
    expect(guideTaskFor("website.security", null)).toBeNull();
  });

  test("no official source → no builder guide (the generic one instead)", () => {
    expect(builderGuideFor("wix", "website.content_depth", "meta")?.url).toContain("support.wix.com");
    expect(builderGuideFor("weebly", "website.content_depth", "meta")).toBeNull();
    expect(builderGuideFor("shopify", "website.social_links", null)).toBeNull();
    expect(builderGuideFor(null, "website.https", null)).toBeNull();
  });

  test("builders that can't do something say so", () => {
    expect(BUILDER_GUIDES.google_sites?.seo_meta?.limitation?.en).toMatch(/no setting for a page's search title or meta description/);
    expect(BUILDER_GUIDES.shopify?.ssl?.limitation?.en).toMatch(/doesn't accept SSL certificates from other companies/);
  });
});

describe("the generic guide", () => {
  const FIXABLE = [
    ["website.https", null],
    ["website.performance_mobile", null],
    ["website.content_depth", "title"],
    ["website.content_depth", "meta"],
    ["website.content_depth", "headings"],
    ["website.content_depth", "thin"],
    ["website.content_depth", "viewport"],
    ["website.contact_conversion", "contact"],
    ["website.contact_conversion", "cta"],
    ["website.about_presence", null],
    ["website.services_presence", null],
    ["website.social_links", null],
    ["website.security", null],
    ["website.info_consistency", null],
    ["website.notice_freshness", null],
    ["website.site_freshness", null],
  ] as const;

  test("every website fix has something specific to ask for, in EN and ES", () => {
    for (const [id, gap] of FIXABLE) {
      expect(webPersonAsk(id, gap, "en"), `${id}:${gap}`).toBeTruthy();
      expect(webPersonAsk(id, gap, "es"), `${id}:${gap}`).toBeTruthy();
    }
    expect(webPersonAsk("website.has_website", "missing", "en")).toBeNull();
  });

  test("a copyable message with the site", () => {
    const one = webPersonMessage([webPersonAsk("website.https", null, "en")!], "https://example.com", "en");
    expect(one).toMatch(/^Hi — PostScore checked our website \(https:\/\/example\.com\) and found something to fix\. Could you make the site load over HTTPS/);
    expect(one).toMatch(/\?\nThanks!$/);
    const two = webPersonMessage(["a", "b"], null, "es");
    expect(two).toContain("¿Podría hacer lo siguiente?\n1. a\n2. b\n¡Gracias!");
  });
});
