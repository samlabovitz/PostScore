import { notFound, redirect } from "next/navigation";
import { NEW_PAGES_LIVE, campaignsPageHref, legacyRedirectIfLive } from "@/lib/routes";
import { CampaignChannels } from "./CampaignChannels";
import { ownerPrintPhone } from "@/lib/ownerDetails.server";
import { freeShowroom } from "@/components/plan/freeShowroom";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { getBusinessSummary } from "@/app/actions/businesses";
import { listActivePromos } from "@/app/actions/promos";
import { getActiveReferral } from "@/app/actions/referrals";
import { getPrintStudioData } from "@/app/actions/printStudio";
import { resolveBizProfile } from "@/config/bizProfiles";
import { getPlan } from "@/lib/premium";
import { viewLocale } from "@/lib/viewLocale.server";
import { CampaignsView } from "./CampaignsView";
import { createClient } from "@/lib/supabase/server";
import { loadBusinessNiche } from "@/lib/businessNiche.server";
import { ownerTypeName } from "@/lib/niches";

/**
 * Campaigns: the coupon and referral card designers (moved here from
 * Growth) and every running campaign with its +1 tally — the same rows
 * and actions as before, so existing tallies carry over untouched. The
 * tab is in the URL (?tab=coupons / ?tab=referrals). Printing stays gated
 * by getPlan() exactly as on Growth (Free preview / Grow basic / Premium
 * full).
 */
export default async function CampaignsPage({ params, searchParams = {} }: { params: { id: string }; searchParams?: { tab?: string } }) {
  // Day 25B: the coupon and referral tabs move to Customer offers, once it's live (lib/routes.ts).
  const moved = legacyRedirectIfLive({ pathname: campaignsPageHref(params.id), search: searchParams.tab ? `tab=${searchParams.tab}` : "" });
  if (moved) redirect(moved);
  // Free: this tab is locked — its showroom, before any of its own data loads.
  const showroom = await freeShowroom(params.id, "campaigns");
  if (showroom) return showroom;
  const summary = await getBusinessSummary(params.id);
  if (summary.status === "unauthenticated") redirect("/login");
  if (summary.status === "not_found") notFound();
  // Day 25B step 5 (new-design preview): email, text and social only; offers live in Customer offers.
  if (NEW_PAGES_LIVE) {
    const [plan, upgrade] = await Promise.all([getPlan(), loadUpgradeContext(params.id, "campaigns")]);
    return (
      <DashboardShell upgrade={upgrade} business={summary.business}>
        <CampaignChannels businessId={params.id} plan={plan} />
      </DashboardShell>
    );
  }

  const { business } = summary;
  const locale = viewLocale(business.language);
  const profile = resolveBizProfile(business.category, business.primary_type, business.business_type_override, locale, business.categories, business.name, business.biz_type_resolved);
  // Labelled by the saved niche when there is one ("Art & pottery classes").
  const shownProfile = { ...profile, label: ownerTypeName((await loadBusinessNiche(createClient(), params.id))?.resolved.nicheId, profile.label, locale) };
  const plan = await getPlan();
  const [promos, referral, printData, upgrade] = await Promise.all([
    profile.couponsOk ? listActivePromos(params.id) : Promise.resolve(null),
    profile.referralOk ? getActiveReferral(params.id) : Promise.resolve(null),
    profile.couponsOk || profile.referralOk ? getPrintStudioData(params.id) : Promise.resolve(null),
    loadUpgradeContext(params.id, "campaigns"),
  ]);

  const printPhone = await ownerPrintPhone(createClient(), params.id);

  return (
    <DashboardShell upgrade={upgrade} business={business}>
      <CampaignsView
        businessId={params.id}
        businessName={business.name}
        // Day 23 2d-3: the phone the owner confirmed, else the listing's now.
        businessPhone={printPhone}
        profile={shownProfile}
        initialPromos={promos?.status === "ok" ? promos.promos : []}
        initialReferral={referral?.status === "ok" ? referral.referral : null}
        loadFailed={promos?.status === "error" || referral?.status === "error"}
        plan={plan}
        printBusiness={printData && printData.status === "ok" ? printData.business : null}
      />
    </DashboardShell>
  );
}
