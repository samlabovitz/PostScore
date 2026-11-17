// Gathers the one-page report's data from the same sources as the pages
// it summarizes — so the PDF can't disagree with what the owner sees:
//   score, grade, categories → scoreBusinessById (the Overview's)
//   period + listing changes  → getReportsData's recap (the Reports page's)
//   rank                      → getLocalBenchmark (shared ownerStanding / rankBy)
//   next steps                → getActionPlan + topRecommendations (Overview)
// RLS-scoped through each action: a business the user doesn't own is
// not_found.

import { reviewCountChangeOf } from "@/lib/scanChanges";
import { reviewGoalLines } from "@/lib/reviewGoal";
import "server-only";
import { scoreBusinessById } from "@/app/actions/scoring";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getReportsData } from "@/app/actions/reports";
import { getLocalBenchmark, getPreviousCompetitorRank } from "@/app/actions/competitors";
import { getActionPlan } from "@/app/actions/actionPlan";
import { createClient } from "@/lib/supabase/server";
import { resolveBizProfile } from "@/config/bizProfiles";
import { businessRowToScoringInput } from "@/lib/scoring";
import { reportNextSteps, topRecommendations } from "@/lib/overviewTiles";
import { reportCategories } from "./reportCategories";
import { pointsText, recRangeText, wholePointRange } from "@/lib/pointRange";
import { normalizeLocale, t, tPlural, type Locale } from "@/lib/i18n";
import type { Recommendation } from "@/lib/overviewTiles";
import type { ReportData, ReportNextStep } from "./reportPdf";

export type ReportDataResult = { status: "ok"; data: ReportData } | { status: "unauthenticated" } | { status: "not_found" } | { status: "error"; message: string };

function nextStep(rec: Recommendation, locale: Locale): ReportNextStep {
  const pointsLabel =
    rec.pointsHigh !== null
      ? recRangeText(locale, rec.points, rec.pointsHigh)
      : pointsText(locale, wholePointRange(rec.points, null).low, rec.source.kind === "website");
  // Listed first, and labelled, when customers are hitting it now (lib/urgency.ts).
  const points = rec.urgent ? `${t(locale, "dashboard.overview.recs.urgent")} · ${pointsLabel}` : pointsLabel;
  if (rec.source.kind === "task") {
    const { task } = rec.source;
    return { title: task.label, detail: task.weeklyTarget ?? task.action, points };
  }
  const { banner } = rec.source;
  if (banner.kind === "improve") {
    return {
      title: t(locale, "dashboard.overview.recs.improveWebsite"),
      detail: tPlural(locale, "dashboard.growth.websiteBanner.improve", banner.improvements, { earned: banner.earned, of: banner.of, points: wholePointRange(banner.points, null).low }),
      points,
    };
  }
  return { title: t(locale, "dashboard.growth.websiteBanner.getWebsite.title"), detail: "", points };
}

/** What the report is built from, for the three-page weekly report
 * (lib/reports/weeklyReportV2Data.server.ts) — so it never loads twice. */
export interface ReportSources {
  recs: Recommendation[];
  business: Awaited<ReturnType<typeof scoreBusinessById>> extends infer R ? (R extends { status: "ok"; business: infer B } ? B : never) : never;
  breakdown: import("@/lib/scoring").ScoreBreakdown;
  profileId: string;
  nicheId: string | null;
  benchmarkNoun: string | null;
}

export async function getReportData(businessId: string, now: Date = new Date()): Promise<ReportDataResult> {
  const result = await getReportDataWithSources(businessId, now);
  return result.status === "ok" ? { status: "ok", data: result.data } : result;
}

export async function getReportDataWithSources(businessId: string, now: Date = new Date()): Promise<ReportDataResult | { status: "ok"; data: ReportData; sources: ReportSources }> {
  const [summary, scored, reports, benchmark] = await Promise.all([getBusinessSummary(businessId), scoreBusinessById(businessId, "business"), getReportsData(businessId), getLocalBenchmark(businessId)]);
  if (summary.status === "unauthenticated" || scored.status === "unauthenticated" || reports.status === "unauthenticated") return { status: "unauthenticated" };
  if (summary.status === "not_found" || scored.status === "not_found" || reports.status === "not_found") return { status: "not_found" };
  if (scored.status === "error") return { status: "error", message: scored.message };

  const business = scored.business;
  const locale = normalizeLocale(business.language);
  const timeZone = reports.timeZone;
  const s = summary.business;
  const profile = resolveBizProfile(s.category, s.primary_type, s.business_type_override, locale, s.categories, s.name, s.biz_type_resolved);
  const { breakdown, suggestions } = scored.result;
  const recap = reports.recap;

  const [actionPlan, previousRank, fixes] = await Promise.all([
    getActionPlan(businessId, businessRowToScoringInput(business), breakdown, suggestions, locale, {
      businessRow: business,
      businessName: business.name ?? "Your business",
      googleMapsUri: business.google_maps_uri ?? null,
      profileId: profile.id,
    }),
    benchmark.status === "ok" ? getPreviousCompetitorRank(businessId, benchmark.benchmark.scanId) : Promise.resolve(null),
    // Fixes a re-scan confirmed during the recap's own period.
    recap
      ? createClient().from("tasks").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "completed").gt("verified_at", recap.previous.created_at)
      : Promise.resolve({ count: 0 }),
  ]);

  const linkOptions = { referralOk: profile.referralOk, couponsOk: profile.couponsOk, pricingOk: profile.pricingOk };
  const recs = actionPlan.status === "ok" ? reportNextSteps(topRecommendations(actionPlan.tasks, actionPlan.websiteBanner, businessId, linkOptions, Infinity, actionPlan.urgentIssues)) : [];
  // The review count between the two latest scans, from our own change
  // records: exact only from Business Profile, otherwise "changed".
  const reviewChange = recap ? reviewCountChangeOf(recap.summary) : null;

  const sources: ReportSources = {
    recs: actionPlan.status === "ok" ? topRecommendations(actionPlan.tasks, actionPlan.websiteBanner, businessId, linkOptions, Infinity, actionPlan.urgentIssues) : [],
    business,
    breakdown,
    profileId: profile.id,
    nicheId: (s as { niche_id?: string | null }).niche_id ?? null,
    benchmarkNoun: benchmark.status === "ok" ? benchmark.benchmark.competitorNoun : null,
  };
  return {
    status: "ok",
    sources,
    data: {
      locale,
      timeZone,
      generatedAt: now.toISOString(),
      business: { name: business.name ?? t(locale, "dashboard.common.businessNameFallback"), address: business.address ?? null },
      score: { total: breakdown.total, grade: breakdown.grade },
      period: recap
        ? {
            from: recap.previous.created_at,
            to: recap.current.created_at,
            days: recap.daysBetween,
            fromScore: recap.previous.total,
            toScore: recap.current.total,
            comparable: recap.previous.scoring_version === recap.current.scoring_version,
          }
        : null,
      categories: reportCategories(breakdown.categories),
      rank:
        benchmark.status === "ok"
          ? { rank: benchmark.benchmark.rank, of: benchmark.benchmark.peerCount, noun: benchmark.benchmark.competitorNoun, previousRank }
          : null,
      headToHead: benchmark.status === "head_to_head" ? { ...benchmark.headToHead, noun: benchmark.competitorNoun } : null,
      changes: {
        listing: recap ? recap.changes.map((c) => c.description) : [],
        listingUnavailable: recap ? recap.changesUnavailable : false,
        fixesConfirmed: fixes.count ?? 0,
      },
      nextSteps: recs.map((r) => nextStep(r, locale)),
      reviews: {
        rating: business.rating,
        count: business.review_count,
        countChange: reviewChange?.kind === "exact" ? reviewChange.delta : reviewChange?.kind === "none" ? 0 : null,
        countChanged: reviewChange?.kind === "changed",
        nearbyAverage: benchmark.status === "ok" ? benchmark.benchmark.competitorReviewAverage : null,
        // The shared review goal (beat the leader), in the report's words.
        goalLines: benchmark.status === "ok" && benchmark.benchmark.reviewGoal ? reviewGoalLines(benchmark.benchmark.reviewGoal, benchmark.benchmark.reviewGroup, locale) : [],
      },
    },
  };
}
