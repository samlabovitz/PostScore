import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { getScoreWithSuggestions, type BusinessScoringInput } from "@/lib/scoring";
import { buildActionPlan } from "@/lib/actionPlan";
import { topRecommendations } from "@/lib/overviewTiles";
import { buildPostaiFacts } from "@/lib/postaiFacts";
import { ScoreBand } from "@/components/overview/ScoreBand";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";

// The real Switch Skate & Snow case: "+8 pts" for review count in Top
// recommendations, "up to +5" on the score card. Reviews was scored on 28
// of its 40 points (replies and recency couldn't be checked), so each
// review-count point is worth 40/28 in the total. One source everywhere:
// what fixing it really moves the total by.

const SWITCH: BusinessScoringInput = { ...scoringInput(), reviewCount: 40, rating: 4.6, gbpReplyCounts: null, recentReviewTimes: null } as BusinessScoringInput;

describe("one points estimate everywhere", () => {
  test("a suggestion's weightedPoints is its real effect on the total — larger than the check's own points when part of the category couldn't be checked", () => {
    const { breakdown, suggestions } = getScoreWithSuggestions(SWITCH);
    const reviews = breakdown.categories.find((c) => c.id === "visibility")!;
    expect(reviews.possiblePoints).toBeLessThan(reviews.weight);
    const rc = suggestions.find((s) => s.checkId === "visibility.review_count")!;
    expect(rc.weightedPoints).toBeGreaterThan(rc.promisedPoints);
    // Biggest real gain first.
    for (let i = 1; i < suggestions.length; i++) expect(suggestions[i - 1].weightedPoints!).toBeGreaterThanOrEqual(suggestions[i].weightedPoints!);
  });

  test("Top recommendations / Growth, the score card's “Biggest boost” and PostAI show the same number for the same fix", () => {
    const { breakdown, suggestions, projectedBreakdown } = getScoreWithSuggestions(SWITCH);
    const tasks = buildActionPlan(breakdown, suggestions, [], SWITCH, "en");
    const rc = suggestions.find((s) => s.checkId === "visibility.review_count")!;
    const task = tasks.find((t) => t.checkId === "visibility.review_count")!;
    // Growth's task = the suggestion's real effect.
    expect(task.weightedPoints).toBeCloseTo(rc.weightedPoints!, 1);
    const rec = topRecommendations(tasks, null, "b1").find((r) => r.key === "visibility.review_count")!;
    expect(rec.points).toBeCloseTo(rc.weightedPoints!, 1);
    // PostAI's "Biggest boost" projection.
    const facts = buildPostaiFacts(breakdown, { rating: 4.6, reviewCount: 40, hasWebsite: true, rank: null, nearbyReviewAverage: null, plan: "grow", biggestBoost: suggestions[0] });
    const boost = facts.projections.find((p) => p.where === 'Overview "Biggest boost"')!;
    expect(boost.upTo).toBe(Math.round(suggestions[0].weightedPoints!));
    // The score card says the same whole number.
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <ScoreBand businessId="b1" score={breakdown.total} grade={breakdown.grade} history={[]} projectedScore={projectedBreakdown.total} projectedGrade={projectedBreakdown.grade} biggestBoost={suggestions[0]} />
      </LocaleProvider>
    );
    expect(html).toContain(`+${Math.round(suggestions[0].weightedPoints!)}`);
  });
});
