import { notFound, redirect } from "next/navigation";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { freeShowroom } from "@/components/plan/freeShowroom";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { Card } from "@/components/ui/Card";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getPrices, getPricingAssessment } from "@/app/actions/pricing";
import { resolveBizProfile } from "@/config/bizProfiles";
import { normalizeLocale } from "@/lib/i18n";
import { PricingView } from "./PricingView";
import { getLastScanAt } from "@/app/actions/scoring";
import { StaleScanNotice } from "@/components/scoring/StaleScanNotice";
import { showRescanNotice } from "@/lib/rescanPolicy";
import { createClient } from "@/lib/supabase/server";
import { loadBusinessNiche } from "@/lib/businessNiche.server";
import { ownerTypeName } from "@/lib/niches";
import { ownerCompetitorNoun } from "@/lib/competitorQuery";

export default async function PricingPage({ params }: { params: { id: string } }) {
  // Free: this tab is locked — its showroom, before any of its own data loads.
  const showroom = await freeShowroom(params.id, "pricing");
  if (showroom) return showroom;
  // Independent loads run together (prices, assessment and last scan
  // need only the id too).
  const [websiteOnly, summary, pricesResult, assessmentResult, lastScanAt, upgrade] = await Promise.all([
    websiteOnlyGuard(params.id, "pricing"),
    getBusinessSummary(params.id),
    getPrices(params.id),
    getPricingAssessment(params.id),
    getLastScanAt(params.id),
    loadUpgradeContext(params.id, "pricing"),
  ]);
  if (websiteOnly) return websiteOnly;

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }
  if (summary.status === "not_found") {
    notFound();
  }

  const { business } = summary;
  const locale = normalizeLocale(business.language);
  const profile = resolveBizProfile(
    business.category,
    business.primary_type,
    business.business_type_override,
    locale,
    business.categories,
    business.name,
    business.biz_type_resolved
  );
  // Labelled by the saved niche when there is one ("Art & pottery classes").
  const nicheId = (await loadBusinessNiche(createClient(), params.id))?.resolved.nicheId;
  const shownProfile = { ...profile, label: ownerTypeName(nicheId, profile.label, locale), competitorNoun: ownerCompetitorNoun(nicheId, profile.competitorNoun, locale) };

  if (pricesResult.status === "unauthenticated" || assessmentResult.status === "unauthenticated") {
    redirect("/login");
  }
  if (pricesResult.status === "error") {
    return (
      <DashboardShell business={business}>
        <Card className="p-5 text-sm text-red">{pricesResult.message}</Card>
      </DashboardShell>
    );
  }
  if (assessmentResult.status === "error") {
    return (
      <DashboardShell business={business}>
        <Card className="p-5 text-sm text-red">{assessmentResult.message}</Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell upgrade={upgrade} business={business}>
      {showRescanNotice(lastScanAt, new Date()) && (
        <div className="mb-6">
          <StaleScanNotice businessId={business.id} lastScanAt={lastScanAt} now={new Date().toISOString()} />
        </div>
      )}
      <PricingView
        businessId={business.id}
        businessName={business.name}
        profile={shownProfile}
        initialPrices={pricesResult.prices}
        initialAssessment={assessmentResult.assessment}
      />
    </DashboardShell>
  );
}
