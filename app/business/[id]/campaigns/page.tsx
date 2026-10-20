import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getBusinessSummary } from "@/app/actions/businesses";
import { listActivePromos } from "@/app/actions/promos";
import { getActiveReferral } from "@/app/actions/referrals";
import { getPrintStudioData } from "@/app/actions/printStudio";
import { resolveBizProfile } from "@/config/bizProfiles";
import { getPlan } from "@/lib/premium";
import { normalizeLocale } from "@/lib/i18n";
import { CampaignsView } from "./CampaignsView";

/**
 * Campaigns: the coupon and referral card designers (moved here from
 * Growth) and every running campaign with its +1 tally — the same rows
 * and actions as before, so existing tallies carry over untouched. The
 * tab is in the URL (?tab=coupons / ?tab=referrals). Printing stays gated
 * by getPlan() exactly as on Growth (Free preview / Grow basic / Premium
 * full).
 */
export default async function CampaignsPage({ params }: { params: { id: string } }) {
  const summary = await getBusinessSummary(params.id);
  if (summary.status === "unauthenticated") redirect("/login");
  if (summary.status === "not_found") notFound();

  const { business } = summary;
  const locale = normalizeLocale(business.language);
  const profile = resolveBizProfile(business.category, business.primary_type, business.business_type_override, locale, business.categories, business.name);
  const plan = getPlan();
  const [promos, referral, printData] = await Promise.all([
    profile.couponsOk ? listActivePromos(params.id) : Promise.resolve(null),
    profile.referralOk ? getActiveReferral(params.id) : Promise.resolve(null),
    profile.couponsOk || profile.referralOk ? getPrintStudioData(params.id) : Promise.resolve(null),
  ]);

  return (
    <DashboardShell business={business}>
      <CampaignsView
        businessId={params.id}
        businessName={business.name}
        businessPhone={business.phone ?? null}
        profile={profile}
        initialPromos={promos?.status === "ok" ? promos.promos : []}
        initialReferral={referral?.status === "ok" ? referral.referral : null}
        loadFailed={promos?.status === "error" || referral?.status === "error"}
        plan={plan}
        printBusiness={printData && printData.status === "ok" ? printData.business : null}
        devPlanSwitch={process.env.NODE_ENV === "development"}
      />
    </DashboardShell>
  );
}
