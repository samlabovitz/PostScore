// Server side of the locked tabs (lib/freeTabs.ts): on Free, a locked
// tab's page calls this FIRST and returns its showroom instead of the real
// page — before any of the tab's own data loads, so a Free account never
// starts a paid call there (PostAI, PageSpeed, the AI price check, Places).
// Grow, Premium and Multi get null and the page renders as normal.

import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getPlan } from "@/lib/premium";
import { SHOWROOM_PAGE, tabLocked, type ShowroomTab } from "@/lib/freeTabs";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { TabShowroom } from "./TabShowroom";
import { getPrintStudioData } from "@/app/actions/printStudio";
import { getReviewsPageData } from "@/app/actions/reviews";
import { resolveBizProfile } from "@/config/bizProfiles";
import { normalizeLocale } from "@/lib/i18n";

export async function freeShowroom(businessId: string, tab: ShowroomTab) {
  const plan = getPlan();
  if (!tabLocked(plan, tab)) return null;
  const [summary, upgrade, print, reviews] = await Promise.all([
    getBusinessSummary(businessId),
    loadUpgradeContext(businessId, SHOWROOM_PAGE[tab], plan),
    // The real designers' own data (DB only), for the tabs that show them.
    tab === "campaigns" ? getPrintStudioData(businessId).catch(() => null) : Promise.resolve(null),
    tab === "reviews" ? getReviewsPageData(businessId).catch(() => null) : Promise.resolve(null),
  ]);
  if (summary.status === "unauthenticated") redirect("/login");
  if (summary.status === "not_found") notFound();
  const b = summary.business;
  const profile = resolveBizProfile(b.category, b.primary_type, b.business_type_override, normalizeLocale(b.language), b.categories, b.name);
  // The top "With Grow | Premium adds" card is this page's one plan
  // comparison: no promo cards at the bottom.
  return (
    <DashboardShell business={summary.business} upgrade={upgrade && { ...upgrade, cards: [] }}>
      <TabShowroom
        tab={tab}
        businessId={businessId}
        businessName={summary.business.name}
        designer={print?.status === "ok" ? { profile, printBusiness: print.business, businessPhone: b.phone ?? null } : null}
        reviews={reviews?.status === "ok" ? reviews.data : null}
      />
    </DashboardShell>
  );
}
