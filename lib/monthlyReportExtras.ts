// The monthly report's facts that come straight from the current scan
// and the app's own pages — the security alert, the "partly checked"
// score basis, the Growth page's website banner, the report's top
// action-plan task, and the competitor standing from a saved scan. Pure,
// and shared by the cron route (app/api/cron/monthly-reports/route.ts)
// and scripts/preview-report.ts, so a preview and a real send can't
// drift apart.

import { closureOf } from "@/lib/businessStatus";
import {
  applyGrowthWebsiteRules,
  buildWebsiteBanner,
  GOOGLE_MISMATCH_CHECK_ID,
  type ActionPlanTask,
} from "@/lib/actionPlan";
import { reportStanding } from "@/lib/competitorComparison";
import { t, type Locale } from "@/lib/i18n";
import type { CompetitorSnapshot, FocusTopActionPlanTask, ReportExtras, ReportSecurityAlert } from "@/lib/monthlyReport";
import { groupSavedScans, type SavedScanRow } from "@/lib/savedCompetitorScans";
import { hasAnalyzableWebsite, partlyCheckedScoreBasis, type BusinessScoringInput, type ScoreBreakdown } from "@/lib/scoring";
import { keyForInfoConflict } from "@/lib/websiteTrust";
import type { CompetitorScope } from "@/lib/competitorScope";


/** Spam or a Safe Browsing flag — only when Site security actually lost
 * its points this scan (the same facts the Website page shows). */
function securityAlert(input: BusinessScoringInput, breakdown: ScoreBreakdown): ReportSecurityAlert | null {
  const check = breakdown.checks.find((c) => c.id === "website.security");
  if (!check || check.earnedPoints !== 0) return null;
  const trust = input.websiteAnalysis?.websiteTrust;
  if (!trust) return null;
  if (trust.safeBrowsingThreat?.threatFound) return { kind: "safe_browsing", types: trust.safeBrowsingThreat.threatTypes };
  const spam = trust.spamSignals[0];
  return spam ? { kind: "spam", category: spam.category } : null;
}

export function buildReportExtras(input: BusinessScoringInput, breakdown: ScoreBreakdown): ReportExtras {
  const banner = buildWebsiteBanner(breakdown, input, null);
  return {
    closure: closureOf(input.businessStatus),
    securityAlert: securityAlert(input, breakdown),
    scoreBasis: partlyCheckedScoreBasis(breakdown.categories, hasAnalyzableWebsite(input)),
    websiteImprovement:
      banner?.kind === "improve" && banner.improvements > 0
        ? { score: banner.score, improvements: banner.improvements, points: banner.points }
        : null,
  };
}

/** "Your site says X, Google says Y" for each real, not-overridden
 * mismatch — null when no field has both values to quote. */
function mismatchText(input: BusinessScoringInput, locale: Locale): string | null {
  const trust = input.websiteAnalysis?.websiteTrust;
  if (!trust) return null;
  const overridden = new Set((input.websiteTrustOverrides ?? []).map((o) => o.key));
  const lines = (["phone", "address", "hours"] as const).flatMap((field) =>
    trust.infoConflicts
      .filter((f) => f.field === field && f.comparison === "conflicts" && !overridden.has(keyForInfoConflict(f)))
      .filter((f) => f.siteValue && f.googleValue)
      .map((f) => t(locale, "report.focus.mismatch", { site: f.siteValue!, google: f.googleValue! }))
  );
  return lines.length > 0 ? lines.join(" ") : null;
}

/**
 * The report's one action-plan item — the Growth page's view of the plan
 * (applyGrowthWebsiteRules: website.* tasks are covered by the website
 * pointer instead, except the Google mismatch). A task with only the
 * generic fallback text is skipped so the next real task is used.
 */
export function reportTopTask(tasks: ActionPlanTask[], input: BusinessScoringInput, locale: Locale): FocusTopActionPlanTask | null {
  const fallback = t(locale, "content.actionPlan.fallback.action").trim();
  for (const task of applyGrowthWebsiteRules(tasks, input, locale)) {
    if (task.action.trim() === fallback) continue;
    const action = task.checkId === GOOGLE_MISMATCH_CHECK_ID ? mismatchText(input, locale) ?? task.action : task.action;
    return { checkId: task.checkId, label: task.label, action };
  }
  return null;
}

/** The owner's standing in one saved scan — the same ranking as the
 * Competitors page (reportStanding). */
export function snapshotFromSavedRows(rows: SavedScanRow[], scope?: CompetitorScope | null): CompetitorSnapshot | null {
  const scan = groupSavedScans(rows)[0];
  const standing = scan ? reportStanding(scan, scope) : null;
  return standing ? { rank: standing.rank, totalCompetitors: standing.total, topCompetitorReviewCount: standing.topReviewCount } : null;
}
