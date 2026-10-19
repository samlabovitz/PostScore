// Gathers the one-page report's data from the same sources as the pages
// it summarizes — so the PDF can't disagree with what the owner sees:
//   score, grade, categories → scoreBusinessById (the Overview's)
//   period + listing changes  → getReportsData's recap (the Reports page's)
//   rank                      → getLocalBenchmark (shared ownerStanding / rankBy)
//   next steps                → getActionPlan + topRecommendations (Overview)
// RLS-scoped through each action: a business the user doesn't own is
// not_found.

import "server-only";
import { scoreBusinessById } from "@/app/actions/scoring";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getReportsData } from "@/app/actions/reports";
import { getLocalBenchmark, getPreviousCompetitorRank } from "@/app/actions/competitors";
import { getActionPlan } from "@/app/actions/actionPlan";
import { createClient } from "@/lib/supabase/server";
import { resolveBizProfile } from "@/config/bizProfiles";
import { businessRowToScoringInput } from "@/lib/scoring";
import { categoryBarShares, categoryOutcomeCounts, topRecommendations, weightedCategoryPoints } from "@/lib/overviewTiles";
import { recRangeText, wholePointRange } from "@/lib/pointRange";
import { normalizeLocale, t, tPlural, type Locale } from "@/lib/i18n";
import type { Recommendation } from "@/lib/overviewTiles";
import type { ReportData, ReportNextStep } from "./reportPdf";

export type ReportDataResult = { status: "ok"; data: ReportData } | { status: "unauthenticated" } | { status: "not_found" } | { status: "error"; message: string };

function nextStep(rec: Recommendation, locale: Locale): ReportNextStep {
  const points =
    rec.pointsHigh !== null
      ? recRangeText(locale, rec.points, rec.pointsHigh)
      : t(locale, rec.source.kind === "website" ? "dashboard.overview.recs.pointsAbout" : "dashboard.overview.recs.points", { points: wholePointRange(rec.points, null).low });
  if (rec.source.kind === "task") {
    const { task } = rec.source;
    return { title: task.label, detail: task.weeklyTarget ?? task.action, points };
  }
  const { banner } = rec.source;
  if (banner.kind === "improve") {
    return {
      title: t(locale, "dashboard.overview.recs.improveWebsite"),
      detail: tPlural(locale, "dashboard.growth.websiteBanner.improve", banner.improvements, { score: banner.score, points: wholePointRange(banner.points, null).low }),
      points,
    };
  }
  return { title: t(locale, "dashboard.growth.websiteBanner.getWebsite.title"), detail: "", points };
}

export async function getReportData(businessId: string, now: Date = new Date()): Promise<ReportDataResult> {
  const [summary, scored, reports, benchmark] = await Promise.all([getBusinessSummary(businessId), scoreBusinessById(businessId, "business"), getReportsData(businessId), getLocalBenchmark(businessId)]);
  if (summary.status === "unauthenticated" || scored.status === "unauthenticated" || reports.status === "unauthenticated") return { status: "unauthenticated" };
  if (summary.status === "not_found" || scored.status === "not_found" || reports.status === "not_found") return { status: "not_found" };
  if (scored.status === "error") return { status: "error", message: scored.message };

  const business = scored.business;
  const locale = normalizeLocale(business.language);
  const timeZone = reports.timeZone;
  const s = summary.business;
  const profile = resolveBizProfile(s.category, s.primary_type, s.business_type_override, locale, s.categories, s.name);
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
  const recs = actionPlan.status === "ok" ? topRecommendations(actionPlan.tasks, actionPlan.websiteBanner, businessId, linkOptions, 3) : [];
  const snapshots = reports.history;
  const latestReviews = snapshots.at(-1)?.profile_snapshot_json?.reviewCount;
  const previousReviews = snapshots.at(-2)?.profile_snapshot_json?.reviewCount;

  return {
    status: "ok",
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
      categories: breakdown.categories.map((c) => {
        const shares = categoryBarShares(c);
        const counts = categoryOutcomeCounts(c);
        return { label: c.label, points: weightedCategoryPoints(c), weight: c.weight, earned: shares.earned, unchecked: shares.unchecked, ...counts };
      }),
      rank:
        benchmark.status === "ok"
          ? { rank: benchmark.benchmark.rank, of: benchmark.benchmark.peerCount, noun: benchmark.benchmark.competitorNoun, previousRank }
          : null,
      changes: {
        listing: recap ? recap.changes.map((c) => c.description) : [],
        listingUnavailable: recap ? recap.changesUnavailable : false,
        fixesConfirmed: fixes.count ?? 0,
      },
      nextSteps: recs.map((r) => nextStep(r, locale)),
      reviews: {
        rating: business.rating,
        count: business.review_count,
        countChange: typeof latestReviews === "number" && typeof previousReviews === "number" ? latestReviews - previousReviews : null,
        nearbyAverage: benchmark.status === "ok" ? benchmark.benchmark.competitorReviewAverage : null,
      },
    },
  };
}
