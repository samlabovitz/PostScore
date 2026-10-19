"use client";

import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScoreHistoryChart } from "@/components/reports/ScoreHistoryChart";
import { MonthlyEmailReportCard } from "@/components/reports/MonthlyEmailReportCard";
import { WeeklyRecapCard } from "@/components/reports/WeeklyRecapCard";
import { PastReports } from "@/components/reports/PastReports";
import type { WeeklyRecapData } from "@/lib/weekly/weeklyData.server";
import { VerifiedFixesCard } from "@/components/reports/VerifiedFixesCard";
import type { GetReportsDataResult } from "@/app/actions/reports";
import { t, useLocale } from "@/lib/i18n";

export function ReportsView({
  businessId,
  businessName,
  reports,
  shareHeadline,
  weekly,
  weekLabels,
  rankNoun,
}: {
  businessId: string;
  businessName: string | null;
  reports: Extract<GetReportsDataResult, { status: "ok" }>;
  shareHeadline: string | null;
  /** The weekly recap (null only if the business couldn't be read). */
  weekly: WeeklyRecapData | null;
  weekLabels: Record<string, string>;
  rankNoun: string;
}) {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div>
        <Link
          href={`/business/${businessId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={15} />
          {t(locale, "dashboard.common.backTo", {
            name: businessName ?? t(locale, "dashboard.common.businessFallback"),
          })}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
          {t(locale, "dashboard.reports.pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">{t(locale, "dashboard.reports.subtitle")}</p>
      </div>

      <SectionHeading title={t(locale, "dashboard.reports.scoreOverTimeHeading")} />
      <ScoreHistoryChart history={reports.history} />

      {weekly && (
        <>
          <SectionHeading title={t(locale, "dashboard.reports.weekly.heading")} />
          <WeeklyRecapCard businessId={businessId} view={weekly.view} weeks={weekly.weeks} weekLabels={weekLabels} rankNoun={rankNoun} shareHeadline={shareHeadline} />
          <MonthlyEmailReportCard businessId={businessId} status={reports.monthlyEmailReport} />
          <SectionHeading title={t(locale, "dashboard.reports.weekly.pastHeading")} />
          {weekly.snapshotsEnabled ? (
            <PastReports businessId={businessId} initial={weekly.past} />
          ) : (
            <p className="-mt-3 text-sm text-ink-soft">{t(locale, "dashboard.reports.weekly.pastNotReady")}</p>
          )}
        </>
      )}

      <SectionHeading title={t(locale, "dashboard.reports.whatWeveVerifiedHeading")} />
      <VerifiedFixesCard
        businessId={businessId}
        confirmedFixCount={reports.confirmedFixCount}
        listingChangesDetected={reports.listingChangesDetected}
        listingChangesSince={reports.listingChangesSince}
        latestPeriodChanges={reports.recap && !reports.recap.changesUnavailable ? reports.recap.changes.length : null}
        gbpConnected={reports.gbpConnected}
      />
    </div>
  );
}
