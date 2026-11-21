import type { ReactNode } from "react";
import { viewLocale } from "@/lib/viewLocale.server";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getListingModeForPage } from "@/components/scoring/websiteOnlyGuard";
import { PostAIDock } from "@/components/assistant/PostAIDock";
import { resolveBizProfile } from "@/config/bizProfiles";
import { LocaleProvider } from "@/lib/i18n";
import { DevLocaleProvider } from "@/components/layout/DevLocale";
import { isMonthlyReportsLive } from "@/lib/monthlyReportsFeatureFlag";
import { featureMapFor } from "@/lib/postaiFeatureMap";
import { postaiQuestionsByPage } from "@/lib/postaiDock";
import { getPlan } from "@/lib/premium";
import { createClient } from "@/lib/supabase/server";

/**
 * Every business page shares this layout for "Ask PostAI" and for bringing
 * the Account menu's notifications up to date with the saved data.
 *
 * "Ask PostAI"
 * (components/assistant/PostAIDock.tsx): a layout stays mounted while the
 * owner moves between its pages, so the open panel and its conversation
 * do too. Each page still renders its own DashboardShell.
 *
 * Cheap on purpose: the summary and listing mode are request-cached (the
 * page reads them too); the chat's data loads only when the panel opens.
 */
export default async function BusinessLayout({ children, params }: { children: ReactNode; params: { id: string } }) {
  // Notifications from the saved data, before the Account menu reads them
  // (at most once an hour per business — lib/notifications.server.ts).
  try {
    const { syncNotificationsForPage } = await import("@/lib/notifications.server");
    await syncNotificationsForPage(createClient(), params.id);
  } catch {
    // Never let notifications break a page.
  }
  // Local development only: the dev language cookie (scripts/devShot.ts --lang), never a saved setting.
  const { devLocaleOverride } = await import("@/lib/viewLocale.server");
  return (
    <DevLocaleProvider value={devLocaleOverride()}>
      {children}
      <Dock businessId={params.id} />
    </DevLocaleProvider>
  );
}

async function Dock({ businessId }: { businessId: string }) {
  try {
    const [summary, listingMode, plan, auth] = await Promise.all([
      getBusinessSummary(businessId),
      getListingModeForPage(businessId),
      getPlan(),
      createClient().auth.getUser(),
    ]);
    // Not theirs / signed out: the page itself redirects. Website-only
    // businesses have no PostAI (it reads the Google listing).
    if (summary.status !== "ok" || listingMode === "website_only") return null;
    const business = summary.business;
    const locale = viewLocale(business.language);
    const profile = resolveBizProfile(business.category, business.primary_type, business.business_type_override, locale, business.categories, business.name, business.biz_type_resolved);
    const features = featureMapFor(plan, {
      couponsOk: profile.couponsOk,
      referralOk: profile.referralOk,
      pricingOk: profile.pricingOk,
      // Only website extras (fix guides, re-check) read this; no starter
      // question depends on them.
      hasWebsite: true,
      monthlyReportsLive: isMonthlyReportsLive(),
    });
    return (
      <LocaleProvider locale={locale} timeZone={business.time_zone}>
        <PostAIDock
          businessId={businessId}
          businessName={business.name}
          questions={postaiQuestionsByPage(features, locale)}
          introSeen={auth.data.user?.user_metadata?.postai_intro_seen === true}
        />
      </LocaleProvider>
    );
  } catch {
    // Never let the button break a page.
    return null;
  }
}
