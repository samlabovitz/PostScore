import { describe, expect, test } from "vitest";
import {
  aboutDepth,
  extractNamedItems,
  RETAIL_SERVICES_KEYWORDS,
  servicesDepth,
  stripSiteBuilderBoilerplate,
} from "./pagePresenceDetection";
import { detectPagePresence, newPresenceBudget } from "./websiteAnalysis";

// v1.9.0 partial credit for About and Services/products — 0 / 0.5 / 1
// from countable signals (W words, N named items, D items with a
// price/size/description, P distinct prices). See
// ~/Desktop/about-products-readonly.md.

const NO_FETCH = (async () => ({ ok: false, status: 404, headers: new Headers(), text: async () => "" })) as unknown as typeof fetch;

function detect(kind: "about" | "services", html: string, extra: string[] = []) {
  return detectPagePresence(kind, html, new URL("https://example.com/"), [], newPresenceBudget(), NO_FETCH, null, extra);
}

// The real Modern Liquors Google Sites homepage structure (trimmed): no
// <main>, no <h2>, each section label is a one-item <ul><li>, the
// products are plain <p> lines, and the Google Sites footer has no
// <footer> tag.
const GS_P = (text: string) =>
  `<p dir="ltr" class="zfr3Q CDt4Ke " style="margin-left: 15.0pt;"><span class="C9DxTc " style="">${text}</span></p>`;
const GS_LABEL = (text: string) =>
  `<ul class="n8H08c UVNKR " style="list-style-type: square;"><li dir="ltr" class="zfr3Q TYR86d eD0Rn "><p dir="ltr" role="presentation" class="zfr3Q CDt4Ke "><span class="C9DxTc " style="">${text}</span></p></li></ul>`;
const MODERN_LIQUORS = `<html><body><div role="main">
<h1>Modern Liquors</h1>
${GS_P("Your Local Source for Fine Spirits, Wines, and Beers")}
${GS_LABEL("Contact Us")}
${GS_P("Have questions or need recommendations? Visit us in-store or give us a call at (302) 319-8129")}
${GS_LABEL("Welcome to Modern Liquors")}
${GS_P("Modern Liquors has been serving the community with the finest selection of wines, spirits, and beer&#39;s . Whether you’re planning a celebration or just looking for the perfect bottle to unwind, we’ve got you covered.")}
${GS_LABEL("Our Products ")}
${GS_P(" Wines from around the world")}
${GS_P(" Premium spirits and liqueurs")}
${GS_P(" Craft, domestic, and imported beers")}
${GS_P(" Non-alcoholic beverages")}
${GS_LABEL("Special Offers")}
${GS_P("We sell Kegs for for 67.99$")}
</div>
<div>Google Sites</div><div>Report abuse</div><div>Page details</div><div>Page updated</div><div>Google Sites</div><div>Report abuse</div>
</body></html>`;

// The real Goldberg Hardware homepage shape (Step 2g) — five named
// services under an explicit heading.
const GOLDBERG = `<html><body><main>
<h1>Goldberg Hardware</h1>
<h2>Shop Local</h2><p>Goldberg Hardware is your classic small town hardware store with stocked shelves and great service.</p>
<h2>We carry all your favorite brands</h2><p>Great everyday prices on Benjamin Moore.</p><p>Weber</p><p>Gorilla Glue</p>
<h2>Services Offered</h2><ul><li>Key cutting</li><li>Weber grill assembly and delivery available</li><li>Window screen repair</li><li>Gift Certificates</li><li>Knife Sharpening</li></ul>
<h2>Our Story</h2><p>Family owned since 1904.</p>
</main></body></html>`;

describe("v1.9.0 — Modern Liquors (Google Sites): About 0.5, Services 0.5", () => {
  test("About: found on the homepage but thin — the section now ends at 'Our Products' (35 words, not 73)", async () => {
    const result = await detect("about", MODERN_LIQUORS);
    expect(result).toMatchObject({ state: "found", locatedOnHomepage: true, depth: "thin" });
    expect(result.counts).toEqual({ words: 35, items: 0, detailedItems: 0, prices: 0 });
  });

  test("Services: 'Our Products' is found but thin — 4 bare categories, no brand/size/price; the keg offer is its own section", async () => {
    const result = await detect("services", MODERN_LIQUORS, RETAIL_SERVICES_KEYWORDS);
    expect(result).toMatchObject({ state: "found", locatedOnHomepage: true, depth: "thin" });
    expect(result.counts).toEqual({ words: 16, items: 4, detailedItems: 0, prices: 0 });
  });

  test("the four <p> product lines are read as named items", () => {
    const html = [" Wines from around the world", " Premium spirits and liqueurs", " Craft, domestic, and imported beers", " Non-alcoholic beverages"].map(GS_P).join("");
    expect(extractNamedItems(html)).toEqual([
      "Wines from around the world",
      "Premium spirits and liqueurs",
      "Craft, domestic, and imported beers",
      "Non-alcoholic beverages",
    ]);
  });

  test("the same list with sizes/brands/prices on 3+ items is descriptive", () => {
    expect(servicesDepth({ words: 30, items: 4, detailedItems: 3, prices: 0 })).toBe("descriptive");
    expect(extractNamedItems(["Tito's Vodka 750 ml", "Bud Light 12-pack", "Josh Cabernet $15"].map(GS_P).join("")).length).toBe(3);
  });
});

describe("v1.9.0 — Goldberg Hardware: 5 named services stay at 1 (N ≥ 5)", () => {
  test("found on the homepage, descriptive, with 5 items counted", async () => {
    const result = await detect("services", GOLDBERG, RETAIL_SERVICES_KEYWORDS);
    expect(result).toMatchObject({ state: "found", locatedOnHomepage: true, depth: "descriptive" });
    expect(result.counts?.items).toBe(5);
  });

  test("four bare items would be thin; five are descriptive", () => {
    expect(servicesDepth({ words: 12, items: 4, detailedItems: 0, prices: 0 })).toBe("thin");
    expect(servicesDepth({ words: 14, items: 5, detailedItems: 0, prices: 0 })).toBe("descriptive");
  });
});

describe("v1.9.0 — a real 40+ word About is descriptive (1)", () => {
  test("homepage About section of 46 words", async () => {
    const html = `<html><body><main><h2>Our Story</h2><p>Maria and Luis opened our bakery in 1998 after twenty years of baking for family weddings. Every loaf is still shaped by hand each morning, and our conchas use her grandmother's recipe. We source flour from a mill two towns over and close early on Sundays.</p></main></body></html>`;
    const result = await detect("about", html);
    expect(result).toMatchObject({ state: "found", depth: "descriptive" });
    expect(result.counts!.words).toBeGreaterThanOrEqual(40);
  });

  test("About thresholds: 14 → nothing, 15 → thin, 39 → thin, 40 → descriptive", () => {
    const counts = (words: number) => ({ words, items: 0, detailedItems: 0, prices: 0 });
    expect(aboutDepth(counts(14))).toBeNull();
    expect(aboutDepth(counts(15))).toBe("thin");
    expect(aboutDepth(counts(39))).toBe("thin");
    expect(aboutDepth(counts(40))).toBe("descriptive");
  });
});

describe("v1.9.0 — a footer-only page scores 0", () => {
  const FOOTER_ONLY = `<html><body><div role="main">
${GS_LABEL("About us")}
${GS_LABEL("Our Products")}
</div>
<div>Skip to main content</div><div>Skip to navigation</div><div>Search this site</div><div>Embedded Files</div>
<div>Google Sites</div><div>Report abuse</div><div>Page details</div><div>Page updated</div>
</body></html>`;

  test("About: a label with only site-builder chrome after it is not found", async () => {
    const result = await detect("about", FOOTER_ONLY);
    expect(result.state).toBe("not_found");
    expect(result.counts).toEqual({ words: 0, items: 0, detailedItems: 0, prices: 0 });
  });

  test("Services: same — not found", async () => {
    const result = await detect("services", FOOTER_ONLY, RETAIL_SERVICES_KEYWORDS);
    expect(result.state).toBe("not_found");
  });

  test("every listed site-builder phrase is removed before counting", () => {
    expect(stripSiteBuilderBoilerplate("Skip to main content Skip to navigation Search this site Embedded Files Google Sites Report abuse Page details Page updated")).toBe("");
    expect(stripSiteBuilderBoilerplate("Fine wines. Report abuse")).toBe("Fine wines.");
  });
});

import { COMMUNITY_SERVICES_KEYWORDS, extraServicesKeywordsFor } from "./pagePresenceDetection";

// Day 2b: the real Minnesota JCC homepage (minnesotajcc.org, fetched once
// 2026-10-16). Its desktop menu "Programs · Events · Schedules · About"
// is plain <li> text built by JavaScript — not links — so the menu alone
// can never be followed. Its real links are Membership, Schedules, Camp.
describe("Day 2b — community center Services keywords (only for that type)", () => {
  const JCC_HOME = `<html><body><header><ul><li>Programs</li><li>Events</li><li>Schedules</li><li>About</li></ul>
<a href="https://minnesotajcc.org/membership-special">Membership</a><a href="https://minnesotajcc.org/give">Donate</a></header>
<main><h1>Welcome to the J</h1><p>Building Community, Together</p></main></body></html>`;
  const candidates = [
    { label: "Membership", url: "https://minnesotajcc.org/membership/" },
    { label: "Schedules", url: "https://minnesotajcc.org/schedules/" },
    { label: "Camp", url: "https://minnesotajcc.org/camps/" },
    { label: "Donate", url: "https://minnesotajcc.org/give" },
  ];
  const MEMBERSHIP_PAGE = `<html><body><main><h1>Membership</h1><p>Join the J and get access to fitness, aquatics, classes and community programs for every age.</p>
<ul><li>Adult membership — $89 per month, full facility access and group fitness classes</li>
<li>Family membership — $139 per month, includes two adults and children under 26</li>
<li>Senior membership — $69 per month for members 65 and older, with SilverSneakers accepted</li>
<li>Youth membership — $39 per month for ages 12 to 18, includes teen center access</li></ul></main></body></html>`;
  const fetchPages = (async (input: string | URL) => {
    const url = String(input);
    const html = url.includes("/membership") ? MEMBERSHIP_PAGE : "<html><body><main><p>Coming soon</p></main></body></html>";
    return { ok: true, status: 200, url, headers: new Headers({ "content-type": "text/html" }), text: async () => html };
  }) as unknown as typeof fetch;
  const run = (extra: string[]) =>
    detectPagePresence("services", JCC_HOME, new URL("https://minnesotajcc.org/"), candidates, newPresenceBudget(), fetchPages, null, extra);

  test("with the community keywords, Services is found on the real Membership page", async () => {
    const result = await run(extraServicesKeywordsFor("community_center"));
    expect(result.state).toBe("found");
    expect(result.url).toContain("/membership/");
  });

  test("without them (any other type), the same site has no Services page — unchanged behavior", async () => {
    expect((await run(extraServicesKeywordsFor("restaurant"))).state).not.toBe("found");
  });

  test("the keyword list is bilingual and only used for community centers", () => {
    expect(COMMUNITY_SERVICES_KEYWORDS).toEqual(expect.arrayContaining(["programs", "membership", "activities", "camps", "schedules", "programas", "membresía", "actividades", "campamentos", "horarios"]));
    expect(extraServicesKeywordsFor("gym_fitness")).toEqual([]);
    expect(extraServicesKeywordsFor("community_center")).toBe(COMMUNITY_SERVICES_KEYWORDS);
  });
});
