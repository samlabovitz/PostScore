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
