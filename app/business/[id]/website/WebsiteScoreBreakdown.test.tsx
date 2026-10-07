import type { ReactNode } from "react";
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type { CategoryResult, CheckResult, WebsiteAnalysis } from "@/lib/scoring";
import { WebsiteScoreBreakdown } from "./WebsiteScoreBreakdown";

// renderToStaticMarkup HTML-entity-escapes text content (apostrophes
// become &#x27;, etc.) — decode before asserting against plain text
// containing those characters, same pattern as
// emails/MonthlyReportEmail.test.tsx's own renderToText.
function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;|&apos;/gi, "'");
}

function renderToText(element: ReactNode): string {
  return decodeHtmlEntities(renderToStaticMarkup(element));
}

const BASE_WEBSITE_ANALYSIS: WebsiteAnalysis = {
  content: null,
  mobilePerformance: null,
  mobilePerformanceFailureReason: null,
  contentFetchFailureReason: null,
  httpsUnreachableReason: null,
  screenshotUrl: null,
  additionalPages: [],
  lastScreenshotRefreshAt: null,
  hasAboutPage: false,
  hasServicesPage: false,
  checkedAt: "2026-10-01T00:00:00.000Z",
};

function excludedCheck(id: string, label: string, maxPoints: number): CheckResult {
  return {
    id,
    label,
    category: "website",
    maxPoints,
    earnedPoints: null,
    confidence: "NOT_FOUND",
    explanation: "Generic fallback explanation.",
    meta: null,
  };
}

function categoryWith(check: CheckResult): CategoryResult {
  return {
    id: "website",
    label: "Website",
    weight: 30,
    possiblePoints: 30,
    earnedPoints: 0,
    relativeScore: 0,
    checks: [check],
  };
}

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

describe("WebsiteScoreBreakdown — Day 4 Part 3c: honest reasons for an excluded check", () => {
  test("performance_mobile excluded with reason 'timed_out' shows the real timeout sentence, not the generic fallback", () => {
    const check = excludedCheck("website.performance_mobile", "Performance & mobile", 10);
    const websiteAnalysis: WebsiteAnalysis = {
      ...BASE_WEBSITE_ANALYSIS,
      mobilePerformanceFailureReason: { kind: "timed_out", status: null },
    };
    const html = renderToText(
      <LocaleProvider locale="en">
        <WebsiteScoreBreakdown websiteCategory={categoryWith(check)} websiteAnalysis={websiteAnalysis} websiteSuggestions={[]} />
      </LocaleProvider>
    );
    expect(html).toContain("Couldn't measure — Google's speed test timed out on your site.");
    expect(html).not.toContain("Generic fallback explanation.");
    expect(html).not.toContain("Couldn't verify —");
  });

  test("performance_mobile excluded with reason 'http_error' shows the real PageSpeed-side-failure sentence", () => {
    const check = excludedCheck("website.performance_mobile", "Performance & mobile", 10);
    const websiteAnalysis: WebsiteAnalysis = {
      ...BASE_WEBSITE_ANALYSIS,
      mobilePerformanceFailureReason: { kind: "http_error", status: 500 },
    };
    const html = renderToText(
      <LocaleProvider locale="en">
        <WebsiteScoreBreakdown websiteCategory={categoryWith(check)} websiteAnalysis={websiteAnalysis} websiteSuggestions={[]} />
      </LocaleProvider>
    );
    expect(html).toContain("Couldn't measure — Google's speed test couldn't complete right now.");
  });

  test("performance_mobile excluded with reason 'no_api_key' or 'error' falls back to the generic wording — neither is an owner-actionable fact", () => {
    for (const kind of ["no_api_key", "error"] as const) {
      const check = excludedCheck("website.performance_mobile", "Performance & mobile", 10);
      const websiteAnalysis: WebsiteAnalysis = {
        ...BASE_WEBSITE_ANALYSIS,
        mobilePerformanceFailureReason: { kind, status: null },
      };
      const html = renderToText(
        <LocaleProvider locale="en">
          <WebsiteScoreBreakdown websiteCategory={categoryWith(check)} websiteAnalysis={websiteAnalysis} websiteSuggestions={[]} />
        </LocaleProvider>
      );
      expect(html).toContain("Couldn't verify —");
      expect(html).toContain("Generic fallback explanation.");
    }
  });

  test("website.https excluded with reason 'down' shows the real no-response sentence", () => {
    const check = excludedCheck("website.https", "HTTPS", 6);
    const websiteAnalysis: WebsiteAnalysis = { ...BASE_WEBSITE_ANALYSIS, httpsUnreachableReason: "down" };
    const html = renderToText(
      <LocaleProvider locale="en">
        <WebsiteScoreBreakdown websiteCategory={categoryWith(check)} websiteAnalysis={websiteAnalysis} websiteSuggestions={[]} />
      </LocaleProvider>
    );
    expect(html).toContain("Your site didn't respond when we checked.");
  });

  test("website.https excluded with reason 'blocked_automated_check' shows the honest blocked sentence, never implies the site itself is unreachable", () => {
    const check = excludedCheck("website.https", "HTTPS", 6);
    const websiteAnalysis: WebsiteAnalysis = {
      ...BASE_WEBSITE_ANALYSIS,
      httpsUnreachableReason: "blocked_automated_check",
    };
    const html = renderToText(
      <LocaleProvider locale="en">
        <WebsiteScoreBreakdown websiteCategory={categoryWith(check)} websiteAnalysis={websiteAnalysis} websiteSuggestions={[]} />
      </LocaleProvider>
    );
    expect(html).toContain(
      "Your site blocked our automated check — it may be working fine for customers; open it yourself to confirm."
    );
    expect(html).not.toContain("customers can't reach");
    expect(html).not.toContain("customers cannot reach");
  });

  test("website.content_depth excluded with a real contentFetchFailureReason shows the shared reachability sentence", () => {
    const check = excludedCheck("website.content_depth", "Content depth", 5);
    const websiteAnalysis: WebsiteAnalysis = {
      ...BASE_WEBSITE_ANALYSIS,
      contentFetchFailureReason: "blocked_automated_check",
    };
    const html = renderToText(
      <LocaleProvider locale="en">
        <WebsiteScoreBreakdown websiteCategory={categoryWith(check)} websiteAnalysis={websiteAnalysis} websiteSuggestions={[]} />
      </LocaleProvider>
    );
    expect(html).toContain("Your site blocked our automated check");
  });

  test("an excluded check with no known reason (e.g. no website at all, or a pre-Part-3c row) keeps the original generic wording", () => {
    const check = excludedCheck("website.performance_mobile", "Performance & mobile", 10);
    const html = renderToText(
      <LocaleProvider locale="en">
        <WebsiteScoreBreakdown websiteCategory={categoryWith(check)} websiteAnalysis={null} websiteSuggestions={[]} />
      </LocaleProvider>
    );
    expect(html).toContain("Couldn't verify —");
    expect(html).toContain("Generic fallback explanation.");
  });

  test("Spanish: the reviewed usted translation renders for the blocked reason", () => {
    const check = excludedCheck("website.https", "HTTPS", 6);
    const websiteAnalysis: WebsiteAnalysis = {
      ...BASE_WEBSITE_ANALYSIS,
      httpsUnreachableReason: "blocked_automated_check",
    };
    const html = renderToText(
      <LocaleProvider locale="es">
        <WebsiteScoreBreakdown websiteCategory={categoryWith(check)} websiteAnalysis={websiteAnalysis} websiteSuggestions={[]} />
      </LocaleProvider>
    );
    expect(html).toContain(
      "Su sitio bloqueó nuestra verificación automática — puede estar funcionando bien para los clientes; ábralo usted mismo para confirmarlo."
    );
  });
});
