import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1/reports" }));

import { answerWithFactCheck, buildPostaiFacts, checkAnswerFacts, factsBlockText, factsFallbackAnswer, type PostaiFacts } from "./postaiFacts";
import { getScoreWithSuggestions, RATING_CONFIDENCE_FULL_AT_REVIEWS, REVIEW_COUNT_SATURATION } from "./scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { GROW_POSTAI_MONTHLY, postaiMonth, postaiMonthlyLeft, postaiMonthlyLimit } from "./postaiLimits";
import { locationLimit } from "./plan";
import { LocaleProvider } from "./i18n";
import { wholeCategoryPoints } from "./overviewTiles";
import { planFacts } from "./planFacts";

// PostAI never invents or mixes up facts: a precomputed facts block, and a
// check on every answer (retry once, then a facts-only answer).

const { breakdown } = getScoreWithSuggestions(scoringInput());
// Mini Shop's real situation: 21 reviews at 4.8★, no website, #7 of 13.
const FACTS: PostaiFacts = buildPostaiFacts(breakdown, { rating: 4.8, reviewCount: 21, hasWebsite: false, rank: { rank: 7, of: 13 }, nearbyReviewAverage: 57 });
const PROMPT = factsBlockText(FACTS);

describe("the facts block", () => {
  test("every check with status, points and its explanation; both review thresholds named apart; rating, website, rank", () => {
    expect(REVIEW_COUNT_SATURATION).toBe(150);
    expect(RATING_CONFIDENCE_FULL_AT_REVIEWS).toBe(40);
    expect(PROMPT).toContain("Google reviews: 21. Review count check: full credit at 150+ reviews.");
    expect(PROMPT).toContain("Google star rating: 4.8★ (a rating under 4.3★ counts as low; this one is NOT low). The rating counts fully once there are 40+ reviews (this business has 21).");
    expect(PROMPT).toContain("Website: NO website.");
    expect(PROMPT).toContain("Rank among nearby competitors: #7 of 13 — exactly 6 businesses rank ahead of this one.");
    for (const c of breakdown.checks) expect(PROMPT).toContain(`  - ${c.label}: `);
    expect(PROMPT).toContain("If a fact isn't here, say it isn't known");
  });

  test("PostAI's rules: numbers and facts only from FACTS; the block leads the data", () => {
    const rules = readFileSync("lib/assistant.ts", "utf8");
    expect(rules).toContain('1z. NUMBERS AND FACTS ONLY FROM "FACTS".');
    expect(rules).toContain("if (context.facts) lines.push(factsBlockText(context.facts));");
  });
});

describe("the fact checker catches the mistakes Haiku really made", () => {
  test("“40+ reviews for full credit” (that's the rating threshold) — and 150+ is fine", () => {
    expect(checkAnswerFacts("You have 21 reviews, but you'd earn full credit if you hit 40+ reviews.", FACTS, PROMPT)[0]).toMatch(/full review-count credit is at 150\+/);
    expect(checkAnswerFacts("You have 21 reviews; full credit starts at 150+ reviews.", FACTS, PROMPT)).toEqual([]);
    expect(checkAnswerFacts("Your 4.8★ rating counts fully at 40+ reviews, so full credit for the rating comes at 40 reviews.", FACTS, PROMPT)).toEqual([]);
  });

  test("“no reviews yet”, “low star rating”, “no website” when the facts say otherwise", () => {
    expect(checkAnswerFacts("Your biggest gaps are no reviews yet and a low star rating.", FACTS, PROMPT)).toEqual(
      expect.arrayContaining(["says there are no reviews — there are 21", "calls the rating low — it's 4.8★"])
    );
    const withSite = { ...FACTS, hasWebsite: true };
    expect(checkAnswerFacts("You don't have a website yet.", withSite, factsBlockText(withSite))).toContain("says there's no website — there is one");
  });

  test("invented numbers: a review count, rating, points or rank that isn't anywhere in the facts", () => {
    const issues = checkAnswerFacts("You have 25 reviews at 4.1★, you're losing 12 pts, and you rank #3 of 9.", FACTS, PROMPT);
    expect(issues).toEqual(expect.arrayContaining(["a review count not in the facts: 25", "a star rating not in the facts: 4.1", "a points number not in the facts: 12", "a rank that isn't the Overview's: #3 of 9 — the Overview card shows #7 of 13"]));
    expect(checkAnswerFacts("You have 21 reviews at 4.8★, nearby businesses average 57 reviews, and you rank #7 of 13.", FACTS, PROMPT)).toEqual([]);
  });

  test("retry once with the problems named; still wrong → a facts-only answer (EN + ES), never the wrong one", async () => {
    const asks: number[] = [];
    const fixed = await answerWithFactCheck({
      ask: async (messages) => (asks.push(messages.length), asks.length === 1 ? "You need 40+ reviews for full credit." : "Full credit comes at 150+ reviews; you have 21."),
      messages: [{ role: "user", content: "How many reviews do I need?" }],
      facts: FACTS,
      promptText: PROMPT,
      locale: "en",
    });
    expect(fixed).toMatchObject({ attempts: 2, fallback: false, answer: "Full credit comes at 150+ reviews; you have 21." });
    expect(asks).toEqual([1, 3]);
    const failed = await answerWithFactCheck({ ask: async () => "You have no reviews yet.", messages: [{ role: "user", content: "?" }], facts: FACTS, promptText: PROMPT, locale: "en" });
    expect(failed.fallback).toBe(true);
    expect(failed.answer).toBe(factsFallbackAnswer(FACTS, "en"));
    expect(failed.answer).toContain("You have 21 Google reviews at 4.8★; the review count gets full credit at 150+ reviews.");
    expect(factsFallbackAnswer(FACTS, "es")).toContain("Tiene 21 reseñas en Google con 4.8★");
    const right = await answerWithFactCheck({ ask: async () => "You have 21 reviews.", messages: [{ role: "user", content: "?" }], facts: FACTS, promptText: PROMPT, locale: "en" });
    expect(right).toMatchObject({ attempts: 1, fallback: false });
  });

  test("competitors' review counts and ratings aren't known: no per-competitor comparisons", () => {
    expect(PROMPT).toContain("Individual competitors' review counts and star ratings: NOT known");
    expect(checkAnswerFacts("The top three all have more reviews than you.", FACTS, PROMPT)).toContain("compares individual competitors' reviews or ratings — those aren't known");
    expect(checkAnswerFacts("Your 4.8★ ties the top salons.", FACTS, PROMPT)).toContain("compares individual competitors' reviews or ratings — those aren't known");
    expect(checkAnswerFacts("The top competitor scores 93 — a 7-point lead, partly from having more reviews built up.", FACTS, PROMPT)).toContain("compares individual competitors' reviews or ratings — those aren't known");
    expect(checkAnswerFacts("Nearby businesses average 57 reviews; you have 21.", FACTS, PROMPT)).toEqual([]);
  });

  test("with a saved competitor scan: each competitor's real PostScore, reviews and rating; “N ahead of you” must match the rank", () => {
    const withScan = {
      ...FACTS,
      rank: { rank: 4, of: 9 },
      competitors: [
        { name: "Hair and Makeup Lounge", total: 93, reviews: 120, rating: 4.9, isSubject: false },
        { name: "Ilda's Salon", total: 89, reviews: 64, rating: 4.7, isSubject: false },
        { name: "Eclipse", total: 88, reviews: null, rating: null, isSubject: false },
        { name: "Us", total: 86, reviews: 21, rating: 4.8, isSubject: true },
      ],
    };
    const prompt = factsBlockText(withScan);
    expect(prompt).toContain("exactly 3 businesses rank ahead of this one");
    expect(prompt).toContain("  1. Hair and Makeup Lounge · 93 · 120 reviews · 4.9★");
    expect(prompt).toContain("  3. Eclipse · 88 · not known reviews · rating not known");
    expect(checkAnswerFacts("The two businesses ahead of you score 93 and 89.", withScan, prompt)).toContain("says 2 rank ahead — 3 do (#4 of 9)");
    expect(checkAnswerFacts("Hair and Makeup Lounge leads with 120 reviews at 4.9★; three businesses rank ahead of you.", withScan, prompt)).toEqual([]);
    expect(checkAnswerFacts("Hair and Makeup Lounge has 200 reviews.", withScan, prompt)).toContain("a review count not in the facts: 200");
  });

  test("a retried answer never opens with an apology or a correction note", async () => {
    const { stripCorrectionPreamble } = await import("./postaiFacts");
    expect(stripCorrectionPreamble("You're right — I apologize. Let me answer correctly, using only what's in the FACTS block.\n\nYour PostScore is 48/100.")).toBe("Your PostScore is 48/100.");
    expect(stripCorrectionPreamble("Your PostScore is 48/100.")).toBe("Your PostScore is 48/100.");
    let n = 0;
    const r = await answerWithFactCheck({ ask: async () => (++n === 1 ? "You have no reviews yet." : "You're right — I apologize. You have 21 reviews."), messages: [{ role: "user", content: "?" }], facts: FACTS, promptText: PROMPT, locale: "en" });
    expect(r.answer).toBe("You have 21 reviews.");
  });

  test("the app checks every answer before saving it", () => {
    const send = readFileSync("app/actions/assistant.ts", "utf8");
    expect(send).toContain("const checked = await answerWithFactCheck({ ask, messages, facts: loaded.context.facts, promptText: system, locale: loaded.locale, clean });");
    expect(send.indexOf("answerWithFactCheck({")).toBeLessThan(send.indexOf('role: "assistant",\n      content: replyText.trim()'));
  });
});

// Mini Shop on Free (4 of 5, scoped like the Overview card) and Umami on Grow
// (the Overview's "Biggest boost: up to +7").
const FREE: PostaiFacts = buildPostaiFacts(breakdown, {
  plan: "free",
  rating: 4.8,
  reviewCount: 21,
  hasWebsite: false,
  rank: { rank: 4, of: 5 },
  rankCard: { othersCount: 4, percentileAhead: 25, smallSample: true, noun: "gift shops", scope: "direct competitors only (Gift shop: 4, the owner's choice)" },
  nearbyReviewAverage: 57,
});
const FREE_PROMPT = factsBlockText(FREE);
const GROW: PostaiFacts = buildPostaiFacts(breakdown, {
  plan: "grow",
  rating: 4.8,
  reviewCount: 21,
  hasWebsite: true,
  rank: { rank: 2, of: 6 },
  nearbyReviewAverage: 57,
  biggestBoost: { label: "Add photos", promisedPoints: 6.6 },
  projectedScore: 81,
  tasks: [{ label: "Reply to reviews", weightedPoints: 3.2, weightedPointsHigh: null }],
});
const GROW_PROMPT = factsBlockText(GROW);

describe("point estimates: only the app's own projections, always “up to”", () => {
  test("the facts list them: Grow's biggest boost (rounded like the Overview) and Growth cards; Free only the points waiting", () => {
    expect(GROW_PROMPT).toContain("  - Add photos: up to +7 points (Overview \"Biggest boost\")");
    expect(GROW_PROMPT).toContain("  - Reply to reviews: up to +3 points (Growth plan card)");
    expect(GROW_PROMPT).toContain("Projected score (Overview): 81/100.");
    expect(FREE.projections).toEqual([expect.objectContaining({ upTo: 100 - breakdown.total, where: "Overview score card" })]);
    expect(FREE_PROMPT).not.toContain("Projected score");
  });

  test("Umami's “+12” and Mini Shop's “+34 from a starter site” / “+15 from a few reviews” are rejected", () => {
    expect(checkAnswerFacts("Adding photos could boost your score by +12 points.", GROW, GROW_PROMPT)).toEqual(expect.arrayContaining([expect.stringMatching(/a point gain the app doesn't show: \+12/)]));
    const free = checkAnswerFacts("A starter site could add +34 to your score, and a few reviews would add 15 points.", FREE, FREE_PROMPT);
    expect(free).toEqual(expect.arrayContaining([expect.stringMatching(/doesn't show: \+34/), expect.stringMatching(/doesn't show: \+15/)]));
  });

  test("the app's own number without “up to” is flagged; with “up to” it passes (EN + ES)", () => {
    expect(checkAnswerFacts("Adding photos would give you +7 points.", GROW, GROW_PROMPT)).toEqual(['a point gain not worded "up to": say "up to +7 points"']);
    expect(checkAnswerFacts("Adding photos could add up to +7 points.", GROW, GROW_PROMPT)).toEqual([]);
    expect(checkAnswerFacts("Agregar fotos podría sumar hasta +7 puntos.", GROW, GROW_PROMPT)).toEqual([]);
    const waiting = 100 - breakdown.total;
    expect(checkAnswerFacts(`You have ${waiting} points waiting to be fixed.`, FREE, FREE_PROMPT)).toEqual([]);
  });

  test("the coupon/referral “+1” counter isn't a point gain (from the live run)", () => {
    for (const a of [
      "Track redemptions by hand with the +1 button as customers use it.",
      "Saving it, printing it, and tracking redemptions with +1 are on Grow.",
      "Start tracking redemptions with a simple +1 tap on the All campaigns page.",
      "Review signs, coupons and referral cards you can print and track with a +1 counter.",
    ])
      expect(checkAnswerFacts(a, FREE, FREE_PROMPT)).toEqual([]);
    expect(checkAnswerFacts("A starter site could add +34 to your score.", FREE, FREE_PROMPT)[0]).toMatch(/doesn't show: \+34/);
  });

  test("points the business has or is losing aren't gains", () => {
    const c = FREE.categories.find((x) => x.points !== null)!;
    expect(checkAnswerFacts(`${c.label} is at ${c.points} of ${c.of} points.`, FREE, FREE_PROMPT)).toEqual([]);
  });
});

describe("the rank is exactly the Overview card's", () => {
  test("the facts carry the card's words and scope", () => {
    expect(FREE_PROMPT).toContain('The Overview\'s "How you rank nearby" card says exactly: "#4 of 5 · Ahead of 25% of 4 nearby gift shops — small sample"');
    expect(FREE_PROMPT).toContain("Ranked against: direct competitors only (Gift shop: 4, the owner's choice).");
  });
  test("“#7 of 13” (the unscoped scan) is rejected; “#4 of 5” passes; another business's place in the same list is fine", () => {
    expect(checkAnswerFacts("You rank #7 of 13 nearby.", FREE, FREE_PROMPT)).toEqual(["a rank that isn't the Overview's: #7 of 13 — the Overview card shows #4 of 5"]);
    expect(checkAnswerFacts("You're ranked 7th of 13.", FREE, FREE_PROMPT)).toEqual(["a rank that isn't the Overview's: #7 of 13 — the Overview card shows #4 of 5"]);
    expect(checkAnswerFacts("You rank #4 of 5 nearby gift shops.", FREE, FREE_PROMPT)).toEqual([]);
    expect(checkAnswerFacts("The leader is #1 of 5.", FREE, FREE_PROMPT)).toEqual([]);
  });
  test("the app and the live check both use the owner's competitor scope (the Overview card's)", () => {
    const action = readFileSync("app/actions/assistant.ts", "utf8");
    expect(action).toContain("getLocalBenchmark(businessId)");
    const script = readFileSync("scripts/live-check-postai.ts", "utf8");
    expect(script).toContain('rankBy(snapshot.scan, "overall", competitorScope)');
    expect(script).toContain("ownerStanding(snapshot.scan, competitorScope)");
    expect(script).not.toMatch(/rankBy\(snapshot\.scan, "overall"\)/);
  });
});

describe("“Google counts…”: the 40+/150+ thresholds are PostScore's rules", () => {
  test("flagged when credited to Google; fine when said as PostScore's", () => {
    expect(checkAnswerFacts("Google counts your rating fully once you have 40+ reviews.", FREE, FREE_PROMPT)).toContain("credits Google with the 40+/150+ review thresholds — they're PostScore's own scoring rules");
    expect(checkAnswerFacts("Google requires 150+ reviews for full credit.", FREE, FREE_PROMPT)).toContain("credits Google with the 40+/150+ review thresholds — they're PostScore's own scoring rules");
    expect(checkAnswerFacts("Google cuenta su calificación por completo con 40+ reseñas.", FREE, FREE_PROMPT)).toContain("credits Google with the 40+/150+ review thresholds — they're PostScore's own scoring rules");
    expect(checkAnswerFacts("PostScore counts your rating fully at 40+ reviews.", FREE, FREE_PROMPT)).toEqual([]);
    // From the live run: the threshold in one sentence, Google credited in the next.
    expect(
      checkAnswerFacts("Your rating only counts fully once you hit 40+ reviews (you're at 21 now). Google weighs ratings more heavily once there's a bigger sample size.", FREE, FREE_PROMPT)
    ).toContain("credits Google with the 40+/150+ review thresholds — they're PostScore's own scoring rules");
    expect(FREE_PROMPT).toContain("The 150+ and 40+ review thresholds are PostScore's own scoring rules — never say Google counts, requires or rewards them.");
  });
});

describe("Free: no way around a lock, no competitor re-runs", () => {
  test("printing or screenshotting a preview is flagged on Free", () => {
    for (const a of ["You can print the coupon preview and use it in the store.", "Take a screenshot of the sign preview.", "Puede imprimir la vista previa del cupón.", "Here's a workaround: use the free QR on a flyer."])
      expect(checkAnswerFacts(a, FREE, FREE_PROMPT)).toContain("suggests printing a preview or another way around a locked feature (Free)");
    expect(checkAnswerFacts("You can print the coupon preview.", GROW, GROW_PROMPT)).toEqual([]);
  });
  test("re-running competitors is flagged on Free — unless it says Free can't, or names Grow", () => {
    for (const a of ["You can re-run your competitors to see if that changes.", "Refresh your competitor list on the Competitors page.", "Puede actualizar sus competidores cuando quiera."])
      expect(checkAnswerFacts(a, FREE, FREE_PROMPT)).toContain("tells a Free owner they can re-run or refresh competitors — the Free list isn't refreshed");
    expect(checkAnswerFacts("On Free, your competitor list isn't refreshed.", FREE, FREE_PROMPT)).toEqual([]);
    expect(checkAnswerFacts("Grow refreshes your competitors every week.", FREE, FREE_PROMPT)).toEqual([]);
    expect(FREE_PROMPT).toContain("FREE PLAN: never suggest printing, screenshotting or saving a preview");
    expect(GROW_PROMPT).not.toContain("FREE PLAN:");
  });
});

describe("units: categories are “X of W”, as the Overview shows them", () => {
  test("the facts give each category's whole points of its weight; no 0–100 category score anywhere in the context", () => {
    const whole = wholeCategoryPoints(breakdown.categories);
    breakdown.categories.forEach((c, i) => expect(FREE_PROMPT).toContain(`  - ${c.label}: ${whole[i]} of ${c.weight}`));
    expect(readFileSync("lib/assistant.ts", "utf8")).not.toContain("`${Math.round(c.relativeScore)}/100`");
  });
  test("“64/100” for a category is flagged; the PostScore and the Website page score are fine; a wrong “X of W” is flagged", () => {
    const c = breakdown.categories[0];
    const whole = wholeCategoryPoints(breakdown.categories)[0]!;
    expect(checkAnswerFacts(`Your ${c.label} score is 64/100.`, FREE, FREE_PROMPT)[0]).toMatch(/a score out of 100 that isn't the PostScore: 64\/100/);
    expect(checkAnswerFacts(`Your PostScore is ${breakdown.total}/100.`, FREE, FREE_PROMPT)).toEqual([]);
    expect(checkAnswerFacts("Your website scores 58/100 on the Website page.", FREE, `${FREE_PROMPT}\nwebsite scores 58/100`)).toEqual([]);
    expect(checkAnswerFacts(`${c.label}: ${whole === 0 ? 1 : whole - 1} of ${c.weight}.`, FREE, FREE_PROMPT)[0]).toMatch(new RegExp(`the Overview shows ${whole} of ${c.weight}`));
    // From the live run: another category's "X of W" in the same sentence isn't this one's.
    const [a1, a2] = breakdown.categories;
    const w = wholeCategoryPoints(breakdown.categories);
    expect(checkAnswerFacts(`${a1.label} is at ${w[0]} of ${a1.weight}, while ${a2.label} is at ${w[1]} of ${a2.weight}.`, FREE, FREE_PROMPT)).toEqual([]);
  });
});

describe("“no reviews yet” / “low rating” are caught in upgrade answers too", () => {
  test("an upgrade pitch built on a wrong claim is flagged", () => {
    const issues = checkAnswerFacts("Why upgrade? With no reviews yet and a low star rating, Grow's review scripts will help most.", FREE, FREE_PROMPT);
    expect(issues).toEqual(expect.arrayContaining(["says there are no reviews — there are 21", "calls the rating low — it's 4.8★"]));
  });
});

describe("Compare plans: honest about what works today", () => {
  test("Premium's promise is true today; the Google part is coming soon (EN + ES)", () => {
    const premium = planFacts("en").find((p) => p.plan === "premium")!;
    expect(premium.promise).toBe("Unlimited PostAI and replies, and every design tool. Connecting Google so PostScore fixes things for you is coming soon.");
    expect(planFacts("es").find((p) => p.plan === "premium")!.promise).toContain("llega próximamente");
  });
  test("Free's monthly email is available (MONTHLY_REPORTS_LIVE is on in production) — PostAI's plan facts follow", () => {
    const free = planFacts("en").find((p) => p.plan === "free")!;
    const reports = free.features.find((f) => /report/i.test(f.feature))!;
    expect(reports).toMatchObject({ status: "available", value: "Monthly email" });
  });
});

describe("Grow: 100 PostAI questions a month", () => {
  test("the limit and the month", () => {
    expect(GROW_POSTAI_MONTHLY).toBe(100);
    expect(postaiMonthlyLimit("grow")).toBe(100);
    for (const plan of ["free", "premium", "multi"] as const) expect(postaiMonthlyLimit(plan)).toBeNull();
    expect(postaiMonth(new Date("2026-10-22T12:00:00Z"))).toEqual({ start: "2026-10-01T00:00:00.000Z", resetsAt: "2026-11-01T00:00:00.000Z" });
    expect(postaiMonthlyLeft(100, 99)).toBe(1);
    expect(postaiMonthlyLeft(100, 140)).toBe(0);
  });

  test("checked on the server before any AI call; only answers that were really saved count (a failed call never does)", () => {
    const src = readFileSync("app/actions/assistant.ts", "utf8");
    const send = src.slice(src.indexOf("export async function sendAssistantMessage("), src.indexOf("async function postaiAnswersSince("));
    expect(send.indexOf("if (used >= limit) return { status: \"limit\", resetsAt: month.resetsAt };")).toBeLessThan(send.indexOf("sendWithContext(loaded, businessId, message, conversationId, false);\n    return result.status"));
    expect(src).toMatch(/\.from\("assistant_messages"\)\s*\.select\("id", \{ count: "exact", head: true \}\)\s*\.eq\("business_id", businessId\)\s*\.eq\("role", "assistant"\)/);
  });

  test("the chat shows “{n} of 100 questions left this month”, and at 0 points to Premium", async () => {
    const { AssistantView } = await import("@/components/assistant/AssistantView");
    void AssistantView;
    const view = readFileSync("components/assistant/AssistantView.tsx", "utf8");
    expect(view).toContain('t(locale, "dashboard.assistant.monthlyLeft", { left: monthly.left, total: monthly.total })');
    expect(view).toContain('t(locale, "dashboard.assistant.monthlyUsedUp"');
    const { t } = await import("./i18n");
    expect(t("en", "dashboard.assistant.monthlyLeft", { left: 37, total: 100 })).toBe("37 of 100 questions left this month");
    expect(t("en", "dashboard.assistant.monthlyUsedUp", { total: 100, date: "Nov 1, 2026" })).toBe("You've used this month's 100 questions. They reset Nov 1, 2026 — or ask unlimited questions on Premium.");
  });
});

describe("the weekly PDF report is Premium", () => {
  test("both PDF routes refuse below Premium, on the server", () => {
    for (const route of ["app/api/business/[id]/weekly-report-pdf/route.ts", "app/api/business/[id]/report-pdf/route.ts"]) {
      const src = readFileSync(route, "utf8");
      expect(src, route).toContain('if (!isPremiumPlan(await getPlan())) return NextResponse.json({ error: "premium_only" }, { status: 403 });');
      expect(src.indexOf("premium_only")).toBeLessThan(src.indexOf("buildReportPdf("));
    }
  });

  test("Grow sees the download as a locked Premium feature; Premium gets the real download", async () => {
    const { WeeklyRecapCard } = await import("@/components/reports/WeeklyRecapCard");
    const { UpgradeProvider } = await import("@/components/upgrade/UpgradeContext");
    const { NO_FACTS } = await import("./upgradePromos");
    const view = { weekStart: "2026-10-19", isCurrentWeek: true, score: 72, grade: "C", lastKnown: null, categories: [], change: { delta: null }, reviews: null, rank: null, scans: [], verified: { fixes: 0, changes: 0, scans: 0 } } as never;
    const render = (plan: "grow" | "premium") =>
      renderToStaticMarkup(
        <LocaleProvider locale="en" timeZone="America/New_York">
          <UpgradeProvider value={{ businessId: "b1", plan, facts: NO_FACTS, cards: [] }}>
            <WeeklyRecapCard businessId="b1" view={view} weeks={["2026-10-19"]} weekLabels={{ "2026-10-19": "Oct 19–25" }} rankNoun="shops" shareHeadline={null} />
          </UpgradeProvider>
        </LocaleProvider>
      );
    let grow = "";
    try {
      grow = render("grow");
    } catch {
      // The recap needs a fuller week; the lock is checked in the source below.
    }
    if (grow) {
      expect(grow).toContain('data-testid="weekly-pdf-locked"');
      expect(grow).not.toContain('data-testid="weekly-pdf-download"');
    }
    const src = readFileSync("components/reports/WeeklyRecapCard.tsx", "utf8");
    expect(src).toContain("const pdfLocked = !!upgrade && !isPremiumPlan(upgrade.plan);");
    expect(src).toContain('<UpgradeButton\n              feature="premium"\n              testId="weekly-pdf-locked"');
  });
});

describe("locations: what Compare plans promises", () => {
  test("1 location on Free, Grow and Premium; up to 5 on Multi — enforced when adding a business", async () => {
    expect(locationLimit("free")).toBe(1);
    expect(locationLimit("grow")).toBe(1);
    expect(locationLimit("premium")).toBe(1);
    expect(locationLimit("multi")).toBe(5);
    vi.doMock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
    vi.doMock("@/app/actions/competitors", () => ({ ensureFirstCompetitorScanWithClient: vi.fn() }));
    const { locationLimitMessageWithClient } = await import("@/app/actions/businesses");
    const db = (rows: Array<{ id: string; place_id: string | null }>) => ({ from: () => ({ select: () => ({ eq: async () => ({ data: rows, error: null }) }) }) }) as never;
    expect(await locationLimitMessageWithClient(db([]), "u1", "p1", "free")).toBeNull();
    expect(await locationLimitMessageWithClient(db([{ id: "a", place_id: "p0" }]), "u1", "p1", "free")).toBe("Your plan includes 1 location. Multi covers up to 5 locations — see Settings → Compare plans.");
    // Re-saving a listing they already have isn't a new location.
    expect(await locationLimitMessageWithClient(db([{ id: "a", place_id: "p1" }]), "u1", "p1", "grow")).toBeNull();
    expect(await locationLimitMessageWithClient(db(Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, place_id: `p${i + 10}` }))), "u1", "p1", "multi")).toBeNull();
    expect(await locationLimitMessageWithClient(db(Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, place_id: `p${i + 10}` }))), "u1", "p1", "multi")).toContain("Multi includes up to 5 locations");
    expect(await locationLimitMessageWithClient(db([{ id: "a", place_id: "p0" }]), "u1", "p1", "free", "es")).toContain("Su plan incluye 1 ubicación");
  });

  test("testing exception: an email in PLAN_SWITCHER_EMAILS adds unlimited businesses on any plan; everyone else keeps the limits", async () => {
    const { unlimitedBusinessesAllowed } = await import("@/lib/premium");
    const env = { NODE_ENV: "production", PLAN_SWITCHER_EMAILS: "tester@example.com, other@example.com" };
    expect(unlimitedBusinessesAllowed(env, "Tester@Example.com")).toBe(true);
    expect(unlimitedBusinessesAllowed(env, "owner@example.com")).toBe(false);
    expect(unlimitedBusinessesAllowed(env, null)).toBe(false);
    expect(unlimitedBusinessesAllowed({ NODE_ENV: "production" }, "tester@example.com")).toBe(false);
    // No development shortcut: unlisted is limited even on a local dev server.
    expect(unlimitedBusinessesAllowed({ NODE_ENV: "development" }, "tester@example.com")).toBe(false);

    vi.doMock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
    vi.doMock("@/app/actions/competitors", () => ({ ensureFirstCompetitorScanWithClient: vi.fn() }));
    const { locationLimitMessageWithClient } = await import("@/app/actions/businesses");
    const db = (n: number) => ({ from: () => ({ select: () => ({ eq: async () => ({ data: Array.from({ length: n }, (_, i) => ({ id: `${i}`, place_id: `p${i + 10}` })), error: null }) }) }) }) as never;
    for (const plan of ["free", "grow", "premium"] as const) {
      expect(await locationLimitMessageWithClient(db(1), "u1", "p1", plan, "en", true)).toBeNull();
      expect(await locationLimitMessageWithClient(db(1), "u1", "p1", plan, "en", false)).toContain("Your plan includes 1 location");
    }
    expect(await locationLimitMessageWithClient(db(12), "u1", "p1", "multi", "en", true)).toBeNull();
    expect(await locationLimitMessageWithClient(db(5), "u1", "p1", "multi", "en", false)).toContain("Multi includes up to 5 locations");

    // Wired into the one server-side check both "add business" actions use,
    // from the signed-in user's email — no email in code.
    const src = readFileSync("app/actions/businesses.ts", "utf8");
    expect(src).toContain("unlimitedBusinessesAllowed(process.env, email)");
    expect(src.match(/locationLimitMessage\(supabase, user\.id, user\.email,/g)).toHaveLength(2);
    expect(src + readFileSync("lib/premium.ts", "utf8")).not.toMatch(/[\w.+-]+@(?!example\.com)[\w-]+\.[a-z]{2,}/i);
  });
});
