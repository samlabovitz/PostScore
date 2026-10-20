import { notFound, redirect } from "next/navigation";
import { StaleScanNotice } from "@/components/scoring/StaleScanNotice";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { Card } from "@/components/ui/Card";
import { getCompetitors } from "@/app/actions/competitors";
import { CompetitorsView } from "./CompetitorsView";
import { getLastScanAt } from "@/app/actions/scoring";
import { normalizeLocale, t } from "@/lib/i18n";

export default async function CompetitorsPage({ params }: { params: { id: string } }) {
  // Independent loads run together.
  const [websiteOnly, fetched, lastScanAt, upgrade] = await Promise.all([
    websiteOnlyGuard(params.id, "competitors"),
    getCompetitors(params.id),
    getLastScanAt(params.id),
    loadUpgradeContext(params.id, "competitors"),
  ]);
  if (websiteOnly) return websiteOnly;

  if (fetched.status === "unauthenticated") {
    redirect("/login");
  }

  if (fetched.status === "not_found") {
    notFound();
  }

  if (fetched.status === "error") {
    return (
      <DashboardShell>
        <Card className="p-5 text-sm text-red">{fetched.message}</Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      upgrade={upgrade}
      business={{
        id: params.id,
        name: fetched.businessName,
        address: fetched.businessAddress,
        language: fetched.language,
        time_zone: fetched.timeZone,
      }}
    >
      <div className="flex flex-col gap-6">
        <StaleScanNotice businessId={params.id} lastScanAt={lastScanAt} now={new Date().toISOString()} />
        <CompetitorsView businessId={params.id} data={fetched} />
        {/* Competitors have their own schedule, separate from re-scans. */}
        <p className="-mt-2 text-[12.5px] text-ink-mute">{t(normalizeLocale(fetched.language), "dashboard.rescan.competitorsSeparate")}</p>
      </div>
    </DashboardShell>
  );
}
