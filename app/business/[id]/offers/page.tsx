import { notFound, redirect } from "next/navigation";
import { NEW_PAGES_LIVE, offersHref } from "@/lib/routes";
import { ownerPrintPhone } from "@/lib/ownerDetails.server";
import { freeShowroom } from "@/components/plan/freeShowroom";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getPrintStudioData } from "@/app/actions/printStudio";
import { resolveBizProfile } from "@/config/bizProfiles";
import { getPlan } from "@/lib/premium";
import { viewLocale } from "@/lib/viewLocale.server";
import { createClient } from "@/lib/supabase/server";
import { loadBusinessNiche } from "@/lib/businessNiche.server";
import { ownerTypeName } from "@/lib/niches";
import { loadOffers } from "@/lib/offers.server";
import { OffersView } from "./OffersView";

/**
 * Growth → Customer offers (Day 25B step 5): Running now with the tracking
 * summary, the Coupons and Referrals designers, First-time and Loyalty
 * "Coming soon". Only on the new-design preview; elsewhere today's
 * Campaigns page. Free: today's Campaigns showroom (spec §5).
 */
export default async function OffersPage({ params, searchParams = {} }: { params: { id: string }; searchParams?: { tab?: string } }) {
  if (!NEW_PAGES_LIVE) redirect(offersHref(params.id, searchParams.tab === "coupons" || searchParams.tab === "referrals" ? searchParams.tab : "all"));
  const showroom = await freeShowroom(params.id, "campaigns");
  if (showroom) return showroom;
  const summary = await getBusinessSummary(params.id);
  if (summary.status === "unauthenticated") redirect("/login");
  if (summary.status === "not_found") notFound();

  const { business } = summary;
  const locale = viewLocale(business.language);
  const profile = resolveBizProfile(business.category, business.primary_type, business.business_type_override, locale, business.categories, business.name, business.biz_type_resolved);
  const shownProfile = { ...profile, label: ownerTypeName((await loadBusinessNiche(createClient(), params.id))?.resolved.nicheId, profile.label, locale) };
  const [plan, offers, printData, upgrade, printPhone] = await Promise.all([
    getPlan(),
    loadOffers(params.id),
    profile.couponsOk || profile.referralOk ? getPrintStudioData(params.id) : Promise.resolve(null),
    loadUpgradeContext(params.id, "campaigns"),
    ownerPrintPhone(createClient(), params.id),
  ]);
  if (offers.status === "unauthenticated") redirect("/login");

  return (
    <DashboardShell upgrade={upgrade} business={business}>
      <OffersView
        businessId={params.id}
        businessName={business.name}
        businessPhone={printPhone}
        profile={shownProfile}
        initialPromos={offers.status === "ok" ? offers.promos : []}
        initialReferral={offers.status === "ok" ? offers.referral : null}
        summary={offers.status === "ok" ? offers.summary : { count: 0, since: null, uses: 0 }}
        testAccount={offers.status === "ok" && offers.testAccount}
        loadFailed={offers.status === "error"}
        plan={plan}
        printBusiness={printData && printData.status === "ok" ? printData.business : null}
      />
    </DashboardShell>
  );
}
