import type { ReactNode } from "react";
import { describe, expect, test } from "vitest";
import { render } from "@react-email/components";
import { MonthlyReportEmail, monthlyReportSubject } from "./MonthlyReportEmail";
import {
  SAMPLE_BASELINE,
  SAMPLE_BASELINE_WITH_COMPETITOR_STANDING,
  SAMPLE_DECLINE,
  SAMPLE_MISSING_DATA,
  SAMPLE_REAL_DELTAS,
  SAMPLE_STEADY,
} from "./sampleMonthlyReportContent";
import type { MonthlyReportContent } from "@/lib/monthlyReport";
import { CHECKS } from "@/lib/scoring";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

// A regression guard against the one thing this template must never do:
// add OVER-THE-TOP enthusiasm — these words are banned unconditionally,
// in every state, including a genuinely great month. "Warm, earned"
// language is a different, much smaller thing (see EARNED_POSITIVE_PHRASE
// below), and even that is only ever allowed when the real score
// actually improved.
const CELEBRATORY_WORDS = /amazing|congratulations|awesome|incredible|fantastic|🎉|🚀/i;

// The one warm, earned phrase this template ever uses — see
// earnedTonePhrase in MonthlyReportEmail.tsx. Allowed ONLY when the real
// scoreDelta for that report is positive (the "real deltas"/improvement
// and "missing data" samples below both have one); everywhere else
// (baseline, steady, decline) it must never appear, since there's no
// real, earned improvement to hang it on.
const EARNED_POSITIVE_PHRASE = /great progress/i;

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

  test("renders the honest baseline headline and a score visual with no delta implied", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} />);

    expect(html).toContain("Your baseline is set");
    // Current score/grade are real and always shown...
    expect(html).toContain("78/100");
    // ...but a first report has no real prior value, so no delta label
    // of any kind — not "+0", not "since last report" at all.
    expect(html).not.toContain("since last report");
    expect(html).not.toMatch(CELEBRATORY_WORDS);
    // No real score movement exists yet on a first report — welcoming,
    // never earned-positive language that would imply a comparison.
    expect(html).not.toMatch(EARNED_POSITIVE_PHRASE);
  });
});

describe("MonthlyReportEmail — competitor standing and listing changes on a first report", () => {
  test("a first report whose scan found no comparable businesses says so plainly, never a fabricated rank", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} />);
    expect(html).toContain("We couldn't find enough comparable businesses nearby to rank you this month.");
  });

  test("Day 4 Part 2c fix: a business that has NEVER had a scan saved gets the honest 'no scan yet' pointer, never the 'couldn't find enough comparable' wording (the real Santa Fe case)", async () => {
    const neverScanned: MonthlyReportContent = { ...SAMPLE_BASELINE.content, hasSavedCompetitorScan: false };
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} content={neverScanned} />);
    expect(html).toContain("No competitor scan yet — run one on the Competitors page.");
    expect(html).not.toContain("We couldn't find enough comparable businesses nearby to rank you this month.");
  });

  test("Day 4 Part 2c fix: a business with at least one real past scan still gets the original 'ran but found nothing' wording", async () => {
    const hasScanned: MonthlyReportContent = { ...SAMPLE_BASELINE.content, hasSavedCompetitorScan: true };
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} content={hasScanned} />);
    expect(html).toContain("We couldn't find enough comparable businesses nearby to rank you this month.");
    expect(html).not.toContain("No competitor scan yet");
  });

  test("a first report with a REAL competitor scan shows the current standing as a starting point, never 'not tracked'", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE_WITH_COMPETITOR_STANDING} />);
    expect(html).toContain("#4 of 11 nearby — your starting point.");
    expect(html).toContain("Next month's report shows whether you moved up or down.");
    expect(html).not.toContain("couldn't find enough comparable");
  });

  test("a first report's listing-changes section sets expectations for NEXT month, distinct from the predates-tracking wording", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} />);
    expect(html).toContain("This report sets your baseline — listing changes are tracked starting next month.");
    expect(html).not.toContain("predates listing-change tracking");
  });

  test("an UPDATE report with no comparable competitor scan shows the SAME honest 'no comparables' wording as a first report", async () => {
    // SAMPLE_MISSING_DATA is a genuine update report (it has a real
    // baseline) whose competitorDelta AND competitorStanding are both
    // null — the cron always attempts a scan now, so the only reason
    // this would stay null is a real "nothing comparable found" or
    // failure, which gets the one honest message regardless of report
    // kind — never a report-kind-specific euphemism.
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_MISSING_DATA} />);
    expect(html).toContain("We couldn't find enough comparable businesses nearby to rank you this month.");
    expect(html).not.toContain("your starting point");
    // Listing changes stay their own, separate real distinction: a
    // genuine update report whose scans predate tracking keeps the
    // original wording, never the first-report-only "sets your
    // baseline" copy.
    expect(html).toContain("Not available for this comparison — the previous scan predates listing-change tracking.");
    expect(html).not.toContain("sets your baseline");
  });

  test("an UPDATE report with a real current standing but no comparable PREVIOUS scan shows the starting-point copy too", async () => {
    // A business whose first-ever competitor scan happens on an UPDATE
    // (non-baseline) report — e.g. the always-scan behavior shipped
    // after their first monthly report already went out. No real
    // movement exists yet (no comparable previous scan), but a real
    // current standing does, and it must be shown exactly like a first
    // report's starting point, not hidden behind "not tracked."
    const current = SAMPLE_MISSING_DATA.content;
    const updateWithStandingOnly: MonthlyReportContent = {
      ...current,
      kind: "update",
      competitor: { available: false },
      competitorStanding: { rank: 7, totalCompetitors: 15, topCompetitorReviewCount: 95 },
    };
    const html = await renderToText(
      <MonthlyReportEmail {...SAMPLE_MISSING_DATA} content={updateWithStandingOnly} />
    );
    expect(html).toContain("#7 of 15 nearby — your starting point.");
    expect(html).not.toContain("couldn't find enough comparable");
  });
});

describe("MonthlyReportEmail — quiet/steady month", () => {
  test("renders a calm, real 'held steady' message — never celebratory", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_STEADY} />);

    expect(html).toContain(SAMPLE_STEADY.content.summary);
    expect(html.toLowerCase()).toContain("held steady");
    expect(html).not.toMatch(CELEBRATORY_WORDS);
  });

  test("renders the honest steady headline and a score visual with no movement implied", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_STEADY} />);

    expect(html).toContain("A steady month — your presence held its ground.");
    expect(html).toContain("84/100");
    // A real, confirmed zero delta is still not shown as movement — no
    // delta label at all on a steady month, not even "+0".
    expect(html).not.toContain("since last report");
    expect(html).not.toMatch(CELEBRATORY_WORDS);
    // A real, confirmed zero score delta earns warmth in tone, never in
    // language that implies improvement that didn't happen.
    expect(html).not.toMatch(EARNED_POSITIVE_PHRASE);
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
    expect(html).not.toMatch(CELEBRATORY_WORDS);
  });

  test("renders a headline naming the real gains and a score visual with the real, honest delta", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_REAL_DELTAS} />);

    // Score 70->84 (+14), reviews 118->142 (+24) — the two real facts a
    // short headline should lead with, in plain, un-fabricated language.
    expect(html).toContain("Your score rose 14 points and you gained 24 reviews.");
    expect(html).toContain("84/100 · B");
    expect(html).toContain("+14 since last report");
    expect(html).not.toMatch(CELEBRATORY_WORDS);
    // A real, positive score movement is the ONE case allowed to sound
    // pleased — earned, plainly-worded warmth, still nowhere near the
    // over-the-top CELEBRATORY_WORDS list above.
    expect(html).toMatch(EARNED_POSITIVE_PHRASE);
  });

  test("renders a genuine decline in the same plain, un-softened language as an increase", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_DECLINE} />);

    // The summary itself already says "dropped" — the template must
    // display it verbatim, not paraphrase it into something softer.
    expect(html).toContain(SAMPLE_DECLINE.content.summary);
    expect(html.toLowerCase()).toContain("dropped");
    expect(html).not.toMatch(CELEBRATORY_WORDS);

    // The new headline and score-visual delta must be equally
    // un-softened — a decline is stated the same plain way as a gain.
    expect(html).toContain("Your score dropped 14 points and you lost 5 reviews.");
    expect(html).toContain("74/100 · C");
    expect(html).toContain("-14 since last report");
    expect(html).not.toMatch(CELEBRATORY_WORDS);
    // The critical guard: a real decline must NEVER be congratulatory,
    // even in the mild "earned positive" phrase allowed on a real
    // improvement — there is no real improvement here to earn it.
    expect(html).not.toMatch(EARNED_POSITIVE_PHRASE);
  });

  test("regression proof: the celebratory-words guard actually fails when a celebratory word appears on a decline", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_DECLINE} />);

    // Sanity check: the guard mechanism itself must genuinely fail when
    // a celebratory word or the earned-positive phrase is actually
    // present — proving these assertions aren't vacuously passing on a
    // decline sample that happens to contain neither by accident.
    const contaminated = `${html} Congratulations on an amazing month! 🎉`;
    expect(contaminated).toMatch(CELEBRATORY_WORDS);
    expect(() => expect(contaminated).not.toMatch(CELEBRATORY_WORDS)).toThrow();

    const contaminatedWithEarnedPhrase = `${html} Great progress this month.`;
    expect(contaminatedWithEarnedPhrase).toMatch(EARNED_POSITIVE_PHRASE);
    expect(() => expect(contaminatedWithEarnedPhrase).not.toMatch(EARNED_POSITIVE_PHRASE)).toThrow();

    // And the real, unmodified decline output does trip neither.
    expect(html).not.toMatch(CELEBRATORY_WORDS);
    expect(html).not.toMatch(EARNED_POSITIVE_PHRASE);
  });
});

describe("MonthlyReportEmail — missing data", () => {
  test("renders unavailable metrics honestly — never a zero, never implied via a bare dash", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_MISSING_DATA} />);

    expect(html).toContain(SAMPLE_MISSING_DATA.content.summary);
    expect(html.toLowerCase()).toContain("not measured this period");
    expect(html.toLowerCase()).toContain("not available for this comparison");
    expect(html.toLowerCase()).toContain("we couldn't find enough comparable businesses nearby");

    // The real, always-present score still renders normally even when
    // everything else is unavailable.
    expect(html).toContain("85");
    expect(html).not.toMatch(CELEBRATORY_WORDS);
  });

  test("renders a headline and score delta from the one real fact available (score), never inventing the rest", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_MISSING_DATA} />);

    // Score is real on both scans even though rating/reviews aren't —
    // the headline states only that one real fact, nothing else.
    expect(html).toContain("Your score rose 15 points.");
    expect(html).toContain("85/100 · B");
    expect(html).toContain("+15 since last report");
    expect(html).not.toMatch(CELEBRATORY_WORDS);
    // The score genuinely improved here even though rating/reviews are
    // unmeasured — a real positive scoreDelta still earns the same warm
    // note, since the earned tone is gated on the score, not on whether
    // every OTHER metric happened to be available too.
    expect(html).toMatch(EARNED_POSITIVE_PHRASE);
  });
});

describe("MonthlyReportEmail — closing focus section", () => {
  test("baseline: shows the label plus this scan's own real focus pointers (score, growth move, routine)", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} />);

    expect(html).toContain("This month & what to focus on");
    expect(SAMPLE_BASELINE.content.focus.pointers.length).toBeGreaterThan(0);
    for (const pointer of SAMPLE_BASELINE.content.focus.pointers) {
      expect(html).toContain(pointer.text);
    }
    expect(html).not.toMatch(CELEBRATORY_WORDS);
  });

  test("Day 4 Part 2d fix: the top headline sentence is never repeated as the focus section's own first line", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} />);
    const headline = "Your baseline is set";
    const occurrences = html.split(headline).length - 1;
    expect(occurrences).toBe(1);
  });

  test("a growth move that does NOT overlap score renders the Growth page's own honest 'doesn't change your score' badge", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} />);
    expect(html).toContain("Start a coupon");
    expect(html).toContain("doesn't change your score");
  });

  test("a growth move that DOES overlap a real losing check renders the 'also raises your score' badge instead", async () => {
    // Deciding WHICH pointers appear (including skipping a growth move
    // that would duplicate the score-gap item already shown — see
    // lib/monthlyReport.test.ts's own Part 2b dedup tests) is
    // buildFocus's job, already covered there; this test's only job is
    // confirming the render pipeline prints a growth_move pointer's
    // badge text correctly end-to-end, so it supplies its own
    // non-colliding pointer directly rather than relying on a sample
    // whose real top task happens to be a website check too.
    const content: MonthlyReportContent = {
      ...SAMPLE_REAL_DELTAS.content,
      focus: {
        nothingNotable: false,
        pointers: [
          {
            kind: "growth_move",
            text: "Improve your website: Your site is losing points on real checks. Brings in customers — the same fix also raises your score (see your plan above)",
          },
        ],
      },
    };
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_REAL_DELTAS} content={content} />);
    expect(html).toContain("Improve your website");
    expect(html).toContain("also raises your score");
  });

  test("the routine pointer's real checked-off count renders, including the honest zero case", async () => {
    const baselineHtml = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} />);
    expect(baselineHtml).toMatch(/checked off 3 weekly routine item/i);

    const missingDataHtml = await renderToText(<MonthlyReportEmail {...SAMPLE_MISSING_DATA} />);
    expect(missingDataHtml).toContain("Nothing checked off on your weekly routine yet this month");
  });

  test("no growth move firing (SAMPLE_DECLINE) means no growth_move pointer at all — never fabricated", () => {
    expect(SAMPLE_DECLINE.content.focus.pointers.some((p) => p.kind === "growth_move")).toBe(false);
  });

  test("never shows more than 3 pointers, and the removed pointer kinds (competitor_gap/listing_issue/general_tip) never appear again", () => {
    const samples = [SAMPLE_BASELINE, SAMPLE_STEADY, SAMPLE_REAL_DELTAS, SAMPLE_MISSING_DATA, SAMPLE_DECLINE];
    for (const sample of samples) {
      expect(sample.content.focus.pointers.length).toBeLessThanOrEqual(3);
      for (const pointer of sample.content.focus.pointers) {
        expect(["score_gap", "growth_move", "routine"]).toContain(pointer.kind);
      }
    }
  });

  test("no orphan advice: every score_gap pointer names a real, currently-defined scoring check (or the real merged-reviews id), never an invented one", () => {
    const samples = [SAMPLE_BASELINE, SAMPLE_STEADY, SAMPLE_REAL_DELTAS, SAMPLE_MISSING_DATA, SAMPLE_DECLINE];
    for (const sample of samples) {
      const scoreGap = sample.content.focus.pointers.find((p) => p.kind === "score_gap");
      if (!scoreGap) continue;
      expect(scoreGap.checkId).toBeTruthy();
      if (scoreGap.checkId === "visibility.reviews_merged") continue;
      const checkDef = CHECKS.find((c) => c.id === scoreGap.checkId);
      expect(checkDef).toBeDefined();
    }
  });

  test("a business with no open task, no firing growth move, and no readable routine data gets the honest 'nothing notable' line, never fabricated content", async () => {
    const emptyContent: MonthlyReportContent = {
      ...SAMPLE_BASELINE.content,
      focus: { nothingNotable: true, pointers: [] },
    };
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} content={emptyContent} />);
    expect(html).toContain(t(DEFAULT_LOCALE, "report.focus.nothingNotable"));
  });
});

describe("monthlyReportSubject", () => {
  // "2026-09-01T14:00:00.000Z" (10am EDT) is unambiguously September 1st
  // in America/New_York — the report covers the month that just ended,
  // August, not the month it's actually sent in (see reportCoverageMonth
  // in lib/i18n/format.ts).
  test("derives a real subject line from the business name and the month the report COVERS (one month before the send date)", () => {
    expect(monthlyReportSubject("Riverside Cafe", "2026-09-01T14:00:00.000Z")).toBe(
      "Riverside Cafe — your August 2026 recap"
    );
  });

  test("defaults to English when no locale is passed", () => {
    expect(monthlyReportSubject("Riverside Cafe", "2026-09-01T14:00:00.000Z", "en")).toBe(
      monthlyReportSubject("Riverside Cafe", "2026-09-01T14:00:00.000Z")
    );
  });

  test("renders the real, reviewed Spanish subject line (word order and all) when locale is 'es'", () => {
    expect(monthlyReportSubject("Riverside Cafe", "2026-09-01T14:00:00.000Z", "es")).toBe(
      "Riverside Cafe — Resumen de agosto de 2026"
    );
  });
});

describe("MonthlyReportEmail — locale", () => {
  test("renders the month heading with Spanish word order via report.monthHeading, plus the now-translated baseline headline", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} locale="es" />);

    // report.monthHeading is now a single per-locale template
    // ("Resumen de {month} de {year}", not English's "{month} {year}
    // recap" order) — interpolated into ONE string before it ever
    // reaches JSX, so there's no hydration-comment boundary to work
    // around here. SAMPLE_BASELINE is sent September 1st (NY-local) —
    // the report covers August, the month that just ended.
    expect(html).toContain("Resumen de agosto de 2026");
    expect(html).toContain(
      "Su punto de partida está definido — le damos la bienvenida a PostScore. Aquí es donde se encuentra hoy."
    );
  });

  test("defaults to the English month heading ('{month} {year} recap' wording) when no locale is passed", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} />);
    expect(html).toContain("August 2026 recap");
  });
});

describe("MonthlyReportEmail — es plural rendering (real Spanish singular vs. plural, not just category selection)", () => {
  // Hand-built rather than run through buildMonthlyReportContent(), so
  // the review-count delta is the ONLY real movement in this content —
  // that isolates reviewFragment as the one fact the headline can show,
  // with nothing else competing for the "top two facts" slot buildHeadline
  // picks from. es now has a real, reviewed translation for
  // report.fragment.reviewsGained (see messages.ts) — this proves the
  // actual rendered HTML picks the correct Spanish singular ("reseña") at
  // count=1 and plural ("reseñas") at count=2, not just that
  // Intl.PluralRules.select() returns the right category in isolation.
  function reviewDeltaContent(delta: number): MonthlyReportContent {
    return {
      kind: "update",
      summary: "test fixture — not asserted on",
      score: { current: { total: 80, grade: "B" }, previous: { total: 80, grade: "B" }, scoreDelta: 0, gradeChanged: false },
      rating: { available: false },
      reviewCount: { available: true, current: 50 + delta, previous: 50, delta },
      competitor: { available: false },
      competitorStanding: null,
      hasSavedCompetitorScan: true,
      listingChanges: { available: false },
      isSteady: false,
      focus: { nothingNotable: true, pointers: [] },
    };
  }

  test("count=1: renders Spanish's SINGULAR form ('1 reseña'), never '1 reseñas'", async () => {
    const html = await renderToText(
      <MonthlyReportEmail
        businessName="Riverside Cafe"
        reportDate="2026-09-01T00:00:00.000Z"
        unsubscribeUrl="https://postscore.app/unsubscribe?business=sample&token=PLACEHOLDER"
        content={reviewDeltaContent(1)}
        locale="es"
      />
    );

    expect(html).toContain("Sumó 1 reseña.");
    expect(html).not.toContain("1 reseñas");
  });

  test("count=2: renders Spanish's PLURAL form ('2 reseñas')", async () => {
    const html = await renderToText(
      <MonthlyReportEmail
        businessName="Riverside Cafe"
        reportDate="2026-09-01T00:00:00.000Z"
        unsubscribeUrl="https://postscore.app/unsubscribe?business=sample&token=PLACEHOLDER"
        content={reviewDeltaContent(2)}
        locale="es"
      />
    );

    expect(html).toContain("Sumó 2 reseñas.");
  });
});
