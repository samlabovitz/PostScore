import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type { CategoryResult } from "@/lib/scoring";
import { CategoryCard, formatPoints } from "./CategoryCard";

const FLOAT_ARTIFACT_CATEGORY: CategoryResult = {
  id: "completeness",
  label: "Google Listing Completeness",
  weight: 30,
  // Both of these are the exact kind of value lib/scoring.ts's
  // determinable-checks sum can produce from ordinary binary
  // floating-point error — never a real, intentional fraction.
  possiblePoints: 34.00000000000001,
  earnedPoints: 14.399999999999999,
  relativeScore: 42,
  checks: [
    {
      id: "completeness.photos",
      label: "Photos",
      category: "completeness",
      maxPoints: 4.000000000000001,
      earnedPoints: 3.9999999999999996,
      confidence: "VERIFIED",
      explanation: "Some photos on the listing.",
      meta: null,
    },
  ],
};

describe("formatPoints", () => {
  test("rounds a floating-point-artifact value to exactly one decimal", () => {
    expect(formatPoints(14.399999999999999)).toBe("14.4");
  });

  test("prints a real whole number bare, with no trailing .0", () => {
    expect(formatPoints(18)).toBe("18");
  });

  test("renders null as an em dash", () => {
    expect(formatPoints(null)).toBe("—");
  });
});

describe("CategoryCard — points rendering", () => {
  test("rounds both the category header's and each check's earned/max points, never a raw float artifact", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <CategoryCard category={FLOAT_ARTIFACT_CATEGORY} />
      </LocaleProvider>
    );

    expect(html).not.toContain("14.399999999999999");
    expect(html).not.toContain("34.00000000000001");
    expect(html).not.toContain("4.000000000000001");
    expect(html).not.toContain("3.9999999999999996");

    expect(html).toContain("14.4");
    expect(html).toContain("34.0");
    expect(html).toContain("4.0");
  });
});

describe("CategoryCard — the description: first sentence whole, the rest on More help", () => {
  const LONG = "Your phone number (302-382-1054) is on the page but isn't tap-to-call — make it a link so phone visitors can call in one tap. Found real Services/Products content at https://keesbakeshop.com/12-count-cupcakes-daily-menu/with/a/very/long/path.";
  const category: CategoryResult = {
    ...FLOAT_ARTIFACT_CATEGORY,
    checks: [
      { ...FLOAT_ARTIFACT_CATEGORY.checks[0], id: "website.contact_conversion", label: "Contact & conversion", category: "website", maxPoints: 3, earnedPoints: 2, explanation: LONG },
      { ...FLOAT_ARTIFACT_CATEGORY.checks[0], id: "completeness.customer_details", label: "Customer details", maxPoints: 3, earnedPoints: 1, explanation: LONG, meta: { parts: "accessibility,payment", present: "payment" } },
    ],
  };

  test("never cut mid-text: the first sentence whole, the rest behind 'More help'; long URLs wrap (EN + ES)", () => {
    for (const locale of ["en", "es"] as const) {
      const html = renderToStaticMarkup(
        <LocaleProvider locale={locale}>
          <CategoryCard category={category} />
        </LocaleProvider>
      );
      expect(html).not.toContain("line-clamp");
      const first = LONG.slice(0, LONG.indexOf(" Found real"));
      expect(html.replace(/&#x27;/g, "'")).toContain(first);
      expect(html).toContain('data-testid="row-more-help"');
      expect(html).toMatch(/data-testid="row-status" class="[^"]*break-words/);
      expect(html).toMatch(/data-testid="customer-details-status" class="[^"]*break-words/);
    }
  });
});
