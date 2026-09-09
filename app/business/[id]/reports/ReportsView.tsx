import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScoreHistoryChart } from "@/components/reports/ScoreHistoryChart";
import { MonthlyRecapCard } from "@/components/reports/MonthlyRecapCard";
import { VerifiedFixesCard } from "@/components/reports/VerifiedFixesCard";
import type { GetReportsDataResult } from "@/app/actions/reports";

export function ReportsView({
  businessId,
  businessName,
  reports,
}: {
  businessId: string;
  businessName: string | null;
  reports: Extract<GetReportsDataResult, { status: "ok" }>;
}) {
  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div>
        <Link
          href={`/business/${businessId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={15} />
          Back to {businessName ?? "business"}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">Reports & history</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Your real PostScore history — every number here comes from a scan you actually ran.
        </p>
      </div>

      <SectionHeading title="Score over time" />
      <ScoreHistoryChart history={reports.history} />

      <SectionHeading title="Monthly recap" />
      <MonthlyRecapCard businessName={businessName ?? "Your business"} recap={reports.recap} />

      <SectionHeading title="What we've verified" />
      <VerifiedFixesCard
        businessId={businessId}
        confirmedFixCount={reports.confirmedFixCount}
        listingChangesDetected={reports.listingChangesDetected}
        gbpConnected={reports.gbpConnected}
      />
    </div>
  );
}
