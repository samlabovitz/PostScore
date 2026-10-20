// The real facts behind the upgrade promos (lib/upgradePromos.ts), from a
// scored business and its competitor benchmark. Pure: nothing estimated —
// a fact that isn't known stays null, and the promo leaves its line out.

import { parseWebsiteAnalysis, type CheckResult, type ScoreWithSuggestions } from "@/lib/scoring";
import { resolveWebsiteBuilder, WEBSITE_BUILDER_NAMES } from "@/lib/websiteBuilder";
import { businessWebsiteUrl } from "@/lib/businessWebsite";
import type { MissingIssue, PromoFacts } from "@/lib/upgradePromos";

const MISSING_CHECKS: Array<[string, MissingIssue]> = [
  ["completeness.hours", "hours"],
  ["completeness.phone", "phone"],
  ["completeness.website_link", "website"],
  ["completeness.photos", "photos"],
  ["completeness.address", "address"],
];

const known = (c: CheckResult) => c.confidence === "VERIFIED" || c.confidence === "LIKELY";

/** The facts from a scored business and its benchmark. */
export function factsFromScore(
  business: { name: string | null; review_count: number | null; website: string | null; website_analysis_json?: unknown; verified_website_url?: string | null },
  result: ScoreWithSuggestions,
  benchmark: { rank: number; peerCount: number; competitorReviewAverage: number | null; competitorNoun: string } | null
): PromoFacts {
  const checks = result.breakdown.checks;
  const missing = MISSING_CHECKS.map(([id, issue]) => ({ issue, check: checks.find((c) => c.id === id) }))
    .filter((m) => m.check && known(m.check) && m.check.maxPoints > 0 && m.check.earnedPoints === 0)
    .sort((a, b) => b.check!.maxPoints - a.check!.maxPoints)[0];
  const websiteFailed = checks.filter((c) => c.category === "website" && known(c) && c.earnedPoints !== null && c.earnedPoints < c.maxPoints).length;
  const builderId = resolveWebsiteBuilder(parseWebsiteAnalysis(business.website_analysis_json)?.builder, businessWebsiteUrl(business as Parameters<typeof businessWebsiteUrl>[0]))?.id ?? null;
  const fixPoints = Math.round(result.projectedBreakdown.total - result.breakdown.total);
  return {
    businessName: business.name,
    score: result.breakdown.total,
    fixPoints: fixPoints > 0 ? fixPoints : null,
    issueCount: result.suggestions.length,
    missingIssue: missing?.issue ?? null,
    websiteFailed,
    builderName: builderId ? WEBSITE_BUILDER_NAMES[builderId] : null,
    rank: benchmark?.rank ?? null,
    total: benchmark?.peerCount ?? null,
    reviewCount: business.review_count,
    reviewAvg: benchmark?.competitorReviewAverage != null ? Math.round(benchmark.competitorReviewAverage) : null,
    competitorNoun: benchmark?.competitorNoun ?? null,
  };
}

