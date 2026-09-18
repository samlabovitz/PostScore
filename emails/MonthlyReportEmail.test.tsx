import type { ReactNode } from "react";
import { describe, expect, test } from "vitest";
import { render } from "@react-email/components";
import { MonthlyReportEmail, monthlyReportSubject } from "./MonthlyReportEmail";
import {
  SAMPLE_BASELINE,
  SAMPLE_DECLINE,
  SAMPLE_MISSING_DATA,
  SAMPLE_REAL_DELTAS,
  SAMPLE_STEADY,
} from "./sampleMonthlyReportContent";
import { GENERAL_FOCUS_TIPS, type MonthlyReportContent } from "@/lib/monthlyReport";
import { CHECKS } from "@/lib/scoring";

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
    expect(html.toLowerCase()).toContain("not tracked this period");

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
  test("baseline: shows the real headline plus this scan's own real focus pointers", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} />);

    expect(html).toContain("This month & what to focus on");
    // The "this month" line reuses the same real headline shown up top —
    // never a second, separately-worded summary.
    expect(html).toContain("Your baseline is set");
    expect(SAMPLE_BASELINE.content.focus.pointers.length).toBeGreaterThan(0);
    for (const pointer of SAMPLE_BASELINE.content.focus.pointers) {
      expect(html).toContain(pointer.text);
    }
    expect(html).not.toMatch(CELEBRATORY_WORDS);
  });

  test("steady month: focus pointers still surface real gaps even though the score/rating/reviews held steady", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_STEADY} />);

    expect(SAMPLE_STEADY.content.focus.nothingNotable).toBe(false);
    expect(SAMPLE_STEADY.content.focus.pointers.some((p) => p.kind === "competitor_gap")).toBe(true);
    for (const pointer of SAMPLE_STEADY.content.focus.pointers) {
      expect(html).toContain(pointer.text);
    }
    expect(html).not.toMatch(CELEBRATORY_WORDS);
  });

  test("real deltas: a genuine listing change and competitor gap both surface as real, specific pointers", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_REAL_DELTAS} />);

    const kinds = SAMPLE_REAL_DELTAS.content.focus.pointers.map((p) => p.kind);
    expect(kinds).toContain("competitor_gap");
    expect(kinds).toContain("listing_issue");
    expect(html).toContain("more reviews than you");
    expect(html).toContain("Your phone number changed.");
    expect(html).not.toMatch(CELEBRATORY_WORDS);
  });

  test("missing data: the section still works from the one real fact available (score) and never fabricates competitor/listing pointers", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_MISSING_DATA} />);

    const kinds = SAMPLE_MISSING_DATA.content.focus.pointers.map((p) => p.kind);
    expect(kinds).not.toContain("competitor_gap");
    expect(kinds).not.toContain("listing_issue");
    for (const pointer of SAMPLE_MISSING_DATA.content.focus.pointers) {
      expect(html).toContain(pointer.text);
    }
    expect(html).not.toMatch(CELEBRATORY_WORDS);
  });

  test("no orphan advice: every focus pointer shown across all four sample states traces back to a real check/fact in that same sample's own data", () => {
    const samples = [SAMPLE_BASELINE, SAMPLE_STEADY, SAMPLE_REAL_DELTAS, SAMPLE_MISSING_DATA];
    const generalTipTexts = GENERAL_FOCUS_TIPS.map((t) => t.text);

    for (const sample of samples) {
      const content = sample.content;
      expect(content.focus.pointers.length).toBeLessThanOrEqual(3);

      for (const pointer of content.focus.pointers) {
        if (pointer.kind === "score_gap") {
          // Must name a real, currently-defined scoring check — never an
          // invented or stale checkId — and its shown text must actually
          // be that check's own real label/advice, not a paraphrase.
          expect(pointer.checkId).toBeTruthy();
          const checkDef = CHECKS.find((c) => c.id === pointer.checkId);
          expect(checkDef).toBeDefined();
          expect(pointer.text).toContain(checkDef!.label);
          expect(pointer.text).toContain(checkDef!.advice);
        } else if (pointer.kind === "competitor_gap") {
          // The competitor must be real (available, subject not #1) and
          // the review count must be real too.
          expect(content.competitor.available).toBe(true);
          if (content.competitor.available) {
            expect(content.competitor.current.rank).toBeGreaterThan(1);
            expect(content.competitor.current.topCompetitorReviewCount).not.toBeNull();
          }
          expect(content.reviewCount.available).toBe(true);
        } else if (pointer.kind === "listing_issue") {
          // The exact description must appear verbatim among this
          // sample's own real detected listing changes — never a
          // separately-invented sentence.
          expect(content.listingChanges.available).toBe(true);
          if (content.listingChanges.available) {
            const descriptions = content.listingChanges.changes.map((c) => c.description);
            expect(descriptions.some((d) => pointer.text.includes(d))).toBe(true);
          }
        } else if (pointer.kind === "general_tip") {
          // The ONE allowed exception — must be verbatim one of the
          // fixed, vetted tips, never a claim about this business.
          expect(generalTipTexts).toContain(pointer.text);
        } else {
          throw new Error(`Unexpected focus pointer kind: ${pointer.kind}`);
        }
      }
    }
  });
});

describe("monthlyReportSubject", () => {
  test("derives a real subject line from the business name and report month", () => {
    expect(monthlyReportSubject("Riverside Cafe", "2026-09-01T00:00:00.000Z")).toBe(
      "Riverside Cafe — your September 2026 PostScore report"
    );
  });

  test("defaults to English when no locale is passed", () => {
    expect(monthlyReportSubject("Riverside Cafe", "2026-09-01T00:00:00.000Z", "en")).toBe(
      monthlyReportSubject("Riverside Cafe", "2026-09-01T00:00:00.000Z")
    );
  });

  test("renders the real, reviewed Spanish subject line (word order and all) when locale is 'es'", () => {
    expect(monthlyReportSubject("Riverside Cafe", "2026-09-01T00:00:00.000Z", "es")).toBe(
      "Riverside Cafe — su informe PostScore de septiembre de 2026"
    );
  });
});

describe("MonthlyReportEmail — locale", () => {
  test("renders the month heading with Spanish word order via report.monthHeading, plus the now-translated baseline headline", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} locale="es" />);

    // report.monthHeading is now a single per-locale template
    // ("Informe de {month}", not English's "{month} report" order) —
    // interpolated into ONE string before it ever reaches JSX, so there's
    // no hydration-comment boundary to work around here.
    expect(html).toContain("Informe de septiembre de 2026");
    expect(html).toContain(
      "Su punto de partida está definido — le damos la bienvenida a PostScore. Aquí es donde se encuentra hoy."
    );
  });

  test("defaults to the English month heading ('{month} report' word order) when no locale is passed", async () => {
    const html = await renderToText(<MonthlyReportEmail {...SAMPLE_BASELINE} />);
    expect(html).toContain("September 2026 report");
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
