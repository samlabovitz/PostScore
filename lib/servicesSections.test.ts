import { describe, expect, test } from "vitest";
import {
  explicitServicesSectionPasses,
  extractMainContentHtml,
  findKeywordSections,
  RETAIL_SERVICES_KEYWORDS,
  SERVICES_PAGE_KEYWORDS,
  servicesContentPasses,
} from "./pagePresenceDetection";
import { detectPagePresence, newPresenceBudget } from "./websiteAnalysis";

// The real Goldberg Hardware rendered homepage shape (Step 2g).
const GOLDBERG = `<html><body><main>
<h1>Goldberg Hardware</h1>
<h2>Shop Local</h2><p>Goldberg Hardware is your classic small town hardware store with stocked shelves and great service.</p>
<h2>We carry all your favorite brands</h2><p>Great everyday prices on Benjamin Moore.</p><p>Weber</p><p>Gorilla Glue</p>
<h2>Services Offered</h2><ul><li>Key cutting</li><li>Weber grill assembly and delivery available</li><li>Window screen repair</li><li>Gift Certificates</li><li>Knife Sharpening</li></ul>
<h2>Our Story</h2><p>Family owned since 1904.</p>
</main></body></html>`;

describe("Services sections (Step 2g, the Goldberg Hardware case)", () => {
  test("every matching heading is tried, not just the first ('Shop Local' no longer hides 'Services Offered')", () => {
    const sections = findKeywordSections(extractMainContentHtml(GOLDBERG), SERVICES_PAGE_KEYWORDS);
    expect(sections.map((s) => s.heading)).toEqual(["Shop Local", "Services Offered"]);
  });
  test("an explicit 'Services Offered' heading over 3+ real list items counts; a generic heading doesn't", () => {
    const [shop, services] = findKeywordSections(extractMainContentHtml(GOLDBERG), SERVICES_PAGE_KEYWORDS);
    expect(servicesContentPasses(services.html, services.text)).toBe(false); // the old rule
    expect(explicitServicesSectionPasses(services)).toBe(true);
    expect(explicitServicesSectionPasses(shop)).toBe(false);
    expect(explicitServicesSectionPasses({ heading: "Servicios", html: "<ul><li>a</li><li>b</li><li>c</li></ul>", text: "a b c" })).toBe(true);
    expect(explicitServicesSectionPasses({ heading: "Our Services", html: "<ul><li>a</li><li>b</li></ul>", text: "a b" })).toBe(false);
  });
  test("retail keywords add Brands/Departments headings (EN + ES)", () => {
    const html = extractMainContentHtml(GOLDBERG);
    expect(findKeywordSections(html, SERVICES_PAGE_KEYWORDS).some((s) => /brands/i.test(s.heading ?? ""))).toBe(false);
    expect(findKeywordSections(html, [...SERVICES_PAGE_KEYWORDS, ...RETAIL_SERVICES_KEYWORDS]).some((s) => /brands/i.test(s.heading ?? ""))).toBe(true);
    expect(RETAIL_SERVICES_KEYWORDS).toEqual(expect.arrayContaining(["brands", "our brands", "departments", "marcas", "nuestras marcas", "departamentos"]));
  });
  test("detectPagePresence finds Goldberg's Services on the homepage", async () => {
    const result = await detectPagePresence(
      "services",
      GOLDBERG,
      new URL("https://goldberghardwaretarrytown.com/"),
      [],
      newPresenceBudget(),
      (async () => ({ ok: false, status: 404, headers: new Headers(), text: async () => "" })) as unknown as typeof fetch,
      null,
      RETAIL_SERVICES_KEYWORDS
    );
    expect(result).toMatchObject({ state: "found", locatedOnHomepage: true });
  });
});
