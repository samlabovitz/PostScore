import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { headToHead, isHeadToHead, MIN_RANKED_COMPETITORS } from "@/lib/competitorComparison";
import { headToHeadIntro, headToHeadScores } from "@/lib/competitorHeadToHead";
import type { SavedCompetitorEntry, SavedCompetitorScan } from "@/lib/savedCompetitorScans";
import { snapshotRank } from "@/lib/weekly/weeklyView";
import { buildPostaiFacts, checkAnswerFacts, factsBlockText } from "@/lib/postaiFacts";
import { scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { LocalBenchmarkTile } from "@/components/dashboard/LocalBenchmarkTile";
import { unlockLine } from "@/lib/upgradePromos";

function e(name: string, total: number, isSubject = false): SavedCompetitorEntry {
  return { placeId: name, name, isSubject, address: null, distanceMeters: isSubject ? null : 900, rating: 4.5, reviewCount: 20, hasWebsite: true, total, grade: "B", scoringVersion: "1.12.0", breakdown: null, priceLevel: null, photoCount: 5, websiteUrl: null };
}
const scan = (...entries: SavedCompetitorEntry[]): SavedCompetitorScan => ({ scanId: "s", createdAt: "2026-10-29T00:00:00Z", entries });

describe("headToHead (fewer than 3 competitors)", () => {
  test("1–2 competitors → head-to-head; none or 3+ → null (the rank shows)", () => {
    expect(MIN_RANKED_COMPETITORS).toBe(3);
    expect(headToHead(scan(e("Me", 70, true)))).toBeNull();
    const one = headToHead(scan(e("Me", 70, true), e("Canadian Tire Rival", 80)))!;
    expect(one.owner.score).toBe(70);
    expect(one.rivals.map((r) => r.name)).toEqual(["Canadian Tire Rival"]);
    expect(headToHead(scan(e("Me", 70, true), e("A", 60), e("B", 80)))!.rivals.map((r) => r.name)).toEqual(["B", "A"]);
    expect(headToHead(scan(e("Me", 70, true), e("A", 60), e("B", 80), e("C", 50)))).toBeNull();
    expect(isHeadToHead({ othersCount: 2 })).toBe(true);
    expect(isHeadToHead({ othersCount: 3 })).toBe(false);
    expect(isHeadToHead({ othersCount: 0 })).toBe(false);
  });

  test("the wording, EN + ES (usted), one and two competitors", () => {
    const one = headToHead(scan(e("Me", 70, true), e("Rival", 80)))!;
    const two = headToHead(scan(e("Me", 70, true), e("A", 60), e("B", 80)))!;
    expect(headToHeadIntro(one, "hardware stores", "en")).toBe("Only 1 business like yours within 15 miles — here's how you compare with Rival");
    expect(headToHeadIntro(two, "hardware stores", "en")).toBe("Only 2 hardware stores like yours within 15 miles — here's how you compare with B and A");
    expect(headToHeadIntro(two, "ferreterías", "es")).toBe("Solo hay 2 negocios como el suyo a menos de 15 millas: así se compara con B y A");
    expect(headToHeadScores(two, "en")).toBe("You 70 · B 80 · A 60");
    expect(headToHeadScores(two, "es")).toBe("Usted 70 · B 80 · A 60");
  });

  test("Overview rank card: the head-to-head with Add a competitor, never '#1 of 2'", () => {
    const h = headToHead(scan(e("Me", 70, true), e("Rival", 80)))!;
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <LocalBenchmarkTile businessId="b1" result={{ status: "head_to_head", competitorNoun: "shops", headToHead: h, scanId: "s", scanAt: "2026-10-29T00:00:00Z" }} />
      </LocaleProvider>
    ).replace(/&#x27;/g, "'");
    expect(html).toContain("here's how you compare with Rival");
    expect(html).toContain('href="/business/b1/competitors#add-competitor"');
    expect(html).not.toMatch(/#\d+ of \d+/);
  });

  test("weekly recap: a frozen '#1 of 2' week shows no rank; 3+ competitors keep it", () => {
    expect(snapshotRank({ rank: 1, rank_of: 2, prev_rank: null })).toBeNull();
    expect(snapshotRank({ rank: 2, rank_of: 3, prev_rank: 1 })).toBeNull();
    expect(snapshotRank({ rank: 2, rank_of: 4, prev_rank: 3 })).toEqual({ rank: 2, of: 4, previous: 3 });
  });

  test("PostAI: no rank in the facts, the head-to-head words instead, and a stated rank is flagged", () => {
    const line = "Only 1 business like yours within 15 miles — here's how you compare with Rival: You 70 · Rival 80";
    const f = buildPostaiFacts(scoreBusiness(scoringInput()), { rating: 4.5, reviewCount: 20, hasWebsite: true, rank: null, headToHead: line, nearbyReviewAverage: null });
    const text = factsBlockText(f);
    expect(text).toContain("Rank among nearby competitors: NONE");
    expect(text).toContain(line);
    expect(checkAnswerFacts("You're #1 of 2 nearby.", f, "").join(" ")).toContain("no rank, only the head-to-head");
  });

  test("upgrade lines never quote a rank with fewer than 3 competitors", () => {
    const base = { score: 60, fixPoints: null, issueCount: 0, missingIssue: null, websiteFailed: false, builderName: null, reviewCount: 10, reviewAvg: null, competitorNoun: "shops", reviewLeader: null };
    expect(unlockLine("rank", { ...base, rank: 2, total: 3 } as never, "en")).toBeNull();
    expect(unlockLine("rank", { ...base, rank: 2, total: 4 } as never, "en")).not.toBeNull();
  });
});
