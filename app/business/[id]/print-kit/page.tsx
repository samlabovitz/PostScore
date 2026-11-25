import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { getBusinessSummary } from "@/app/actions/businesses";
import { resolveBizProfile } from "@/config/bizProfiles";
import { getPlan } from "@/lib/premium";
import { viewLocale } from "@/lib/viewLocale.server";
import { NEW_PAGES_LIVE, PRINT_KIT_LIVE, printKitHref } from "@/lib/routes";
import { loadOffers } from "@/lib/offers.server";
import { getReviewsPageData } from "@/app/actions/reviews";
import { PrintKitView } from "./PrintKitView";

/**
 * Growth → Print kit & QR (Day 25B step 5): every printable with its QR.
 * Only on the new-design preview; elsewhere the review QR on today's
 * Reviews page. Open on Free (the review QR is free; the rest locked).
 */
export default async function PrintKitPage({ params }: { params: { id: string } }) {
  // Hidden until Day 34 / 37-Core: Get more reviews #review-link (lib/routes.ts PRINT_KIT_LIVE).
  if (!NEW_PAGES_LIVE || !PRINT_KIT_LIVE) redirect(printKitHref(params.id));
  const summary = await getBusinessSummary(params.id);
  if (summary.status === "unauthenticated") redirect("/login");
  if (summary.status === "not_found") notFound();
  const { business } = summary;
  const profile = resolveBizProfile(business.category, business.primary_type, business.business_type_override, viewLocale(business.language), business.categories, business.name, business.biz_type_resolved);
  // The place ID for the review link (DB only, no Google read).
  const [plan, upgrade, offers, reviews] = await Promise.all([getPlan(), loadUpgradeContext(params.id, "reviews"), loadOffers(params.id), getReviewsPageData(params.id, { live: false })]);
  const ok = offers.status === "ok" ? offers : null;
  return (
    <DashboardShell upgrade={upgrade} business={business}>
      <PrintKitView
        businessId={params.id}
        placeId={reviews.status === "ok" ? reviews.data.placeId : null}
        plan={plan}
        tools={{ couponsOk: profile.couponsOk, referralOk: profile.referralOk }}
        uses={{ coupons: ok ? ok.promos.reduce((n, p) => n + p.redemptions, 0) : null, referrals: ok ? ok.referral?.redemptions ?? 0 : null }}
      />
    </DashboardShell>
  );
}
