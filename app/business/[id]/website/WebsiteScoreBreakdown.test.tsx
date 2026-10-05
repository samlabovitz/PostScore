import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type { CategoryResult } from "@/lib/scoring";
import { WebsiteScoreBreakdown } from "./WebsiteScoreBreakdown";

// Both of these mirror the exact kind of value lib/scoring.ts's
// determinable-checks sum can produce from ordinary binary
// floating-point error — never a real, intentional fraction.
const FLOAT_ARTIFACT_WEBSITE_CATEGORY: CategoryResult = {
  id: "website",
  label: "Website",
  weight: 30,
  possiblePoints: 14.399999999999999,
  earnedPoints: 9.999999999999998,
  relativeScore: 71,
  checks: [
    {
      id: "website.performance_mobile",
      label: "Performance & mobile",
      category: "website",
      maxPoints: 6.000000000000001,
      earnedPoints: 4.000000000000001,
      confidence: "VERIFIED",
      explanation: "Loads reasonably fast on mobile.",
      meta: null,
    },
  ],
};

describe("WebsiteScoreBreakdown — points rendering", () => {
  test("rounds every earned/max points value, never a raw floating-point artifact", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <WebsiteScoreBreakdown
          websiteCategory={FLOAT_ARTIFACT_WEBSITE_CATEGORY}
          websiteAnalysis={null}
          websiteSuggestions={[]}
        />
      </LocaleProvider>
    );

    expect(html).not.toContain("14.399999999999999");
    expect(html).not.toContain("9.999999999999998");
    expect(html).not.toContain("6.000000000000001");
    expect(html).not.toContain("4.000000000000001");

    expect(html).toContain("14.4");
    expect(html).toContain("10.0");
    expect(html).toContain("6.0");
    expect(html).toContain("4.0");
  });
});
