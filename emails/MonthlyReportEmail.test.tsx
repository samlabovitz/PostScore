import type { ReactNode } from "react";
import { describe, expect, test } from "vitest";
import { render } from "@react-email/components";
import { MonthlyReportEmail, monthlyReportSubject } from "./MonthlyReportEmail";
import { BASE_SNAPSHOT, SAMPLE_BASELINE, SAMPLE_MISSING_DATA, SAMPLE_REAL_DELTAS, SAMPLE_STEADY } from "./sampleMonthlyReportContent";
import { buildMonthlyReportContent } from "@/lib/monthlyReport";

// A regression guard against the one thing this template must never do:
// add enthusiasm the real data didn't earn. None of these words should
// ever appear, in any of the four honest states.
const CELEBRATORY_WORDS = /amazing|congratulations|awesome|incredible|fantastic|🎉|🚀/i;

// React Email HTML-escapes text content (e.g. "Here's" -> "Here&#x27;s"),
// correctly — but that means comparing rendered HTML against the raw
// summary strings needs the same decode step lib/websiteContentAnalysis.ts
// uses for the same reason, so a contraction in a real summary sentence
// doesn't make an otherwise-correct assertion fail.
function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;|&apos;/gi, "'");
}

async function renderToText(element: ReactNode): Promise<string> {
  return decodeHtmlEntities(await render(element));
}

describe("MonthlyReportEmail — first-ever report (baseline)", () => {
  test("renders the honest baseline summary, no fabricated trend or comparison language", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} />);

    expect(html).toContain(SAMPLE_BASELINE.content.summary);
    expect(html).toContain("Month-over-month tracking starts with your next report");
    expect(html).toContain("This is your first PostScore report");

    // No comparison claims are possible on a first report.
    expect(html).not.toMatch(/vs\.\s*last report/i);
    expect(html).not.toContain("unchanged");
    expect(html).not.toMatch(CELEBRATORY_WORDS);
  });
});

describe("MonthlyReportEmail — quiet/steady month", () => {
  test("renders a calm, real 'held steady' message — never celebratory", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_STEADY} />);

    expect(html).toContain(SAMPLE_STEADY.content.summary);
    expect(html.toLowerCase()).toContain("held steady");
    expect(html).not.toMatch(CELEBRATORY_WORDS);
  });
});

describe("MonthlyReportEmail — real deltas", () => {
  test("renders real improvement plainly, with the real numbers, not just the summary sentence", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_REAL_DELTAS} />);

    expect(html).toContain(SAMPLE_REAL_DELTAS.content.summary);
    expect(html).toMatch(/vs\.\s*last report/i);
    expect(html).toContain("84"); // real current score
    expect(html).toContain("4.6"); // real current rating
    expect(html).toContain("#2 of 12 nearby"); // real competitor standing
  });

  test("renders a genuine decline in the same plain, un-softened language as an increase", async () => {
    const decliningContent = buildMonthlyReportContent(
      {
        id: "baseline",
        total: 88,
        grade: "B",
        createdAt: "2026-08-01T00:00:00.000Z",
        profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.7, reviewCount: 100 },
      },
      {
        id: "current",
        total: 74,
        grade: "C",
        createdAt: "2026-09-01T00:00:00.000Z",
        profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.3, reviewCount: 95 },
      },
      { previous: { rank: 2, totalCompetitors: 10 }, current: { rank: 6, totalCompetitors: 10 } }
    );

    const html = await renderToText(
      <MonthlyReportEmail
        businessName="Riverside Cafe"
        reportDate="2026-09-01T00:00:00.000Z"
        unsubscribeUrl="#"
        content={decliningContent}
      />
    );

    // The summary itself already says "dropped" — the template must
    // display it verbatim, not paraphrase it into something softer.
    expect(html).toContain(decliningContent.summary);
    expect(html.toLowerCase()).toContain("dropped");
    expect(html).not.toMatch(CELEBRATORY_WORDS);
  });
});

describe("MonthlyReportEmail — missing data", () => {
  test("renders unavailable metrics honestly — never a zero, never implied via a bare dash", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_MISSING_DATA} />);

    expect(html).toContain(SAMPLE_MISSING_DATA.content.summary);
    expect(html.toLowerCase()).toContain("not measured this period");
    expect(html.toLowerCase()).toContain("not available for this comparison");
    expect(html.toLowerCase()).toContain("not tracked this period");

    // The real, always-present score still renders normally even when
    // everything else is unavailable.
    expect(html).toContain("85");
  });
});

describe("monthlyReportSubject", () => {
  test("derives a real subject line from the business name and report month", () => {
    expect(monthlyReportSubject("Riverside Cafe", "2026-09-01T00:00:00.000Z")).toBe(
      "Riverside Cafe — your September 2026 PostScore report"
    );
  });
});
