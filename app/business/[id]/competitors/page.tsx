import { notFound, redirect } from "next/navigation";
import { ScanStatusStrip } from "@/components/scoring/ScanStatusStrip";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { getCompetitors } from "@/app/actions/competitors";
import { CompetitorsView } from "./CompetitorsView";
import { getLastScanAt } from "@/app/actions/scoring";
import { normalizeLocale, t } from "@/lib/i18n";

export default async function CompetitorsPage({ params }: { params: { id: string } }) {
  const websiteOnly = await websiteOnlyGuard(params.id, "competitors");
  if (websiteOnly) return websiteOnly;

  const fetched = await getCompetitors(params.id);

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

  const lastScanAt = await getLastScanAt(params.id);
  return (
    <DashboardShell
      business={{
        id: params.id,
        name: fetched.businessName,
        address: fetched.businessAddress,
        language: fetched.language,
        time_zone: fetched.timeZone,
      }}
    >
      <div className="flex flex-col gap-6">
        <ScanStatusStrip businessId={params.id} lastScanAt={lastScanAt} now={new Date().toISOString()} mode="link" note={t(normalizeLocale(fetched.language), "dashboard.rescan.competitorsSeparate")} />
        <CompetitorsView businessId={params.id} data={fetched} />
      </div>
    </DashboardShell>
  );
}
