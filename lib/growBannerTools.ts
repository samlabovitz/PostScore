import {
  IconUsers,
  IconTicket,
  IconCalendarCheck,
  IconTag,
  IconQrcode,
  IconTrophy,
} from "@tabler/icons-react";
import type { MessageKey } from "@/lib/i18n";

export interface GrowBannerTool {
  icon: typeof IconTicket;
  labelKey: MessageKey;
  href: string;
}

/**
 * The real destination for each Overview growth-strip chip, for a given
 * real business id. Kept in its own module (no "use server" action
 * imports) so it can be unit-tested without pulling in the server-only
 * dependency chain that BusinessScoreView.tsx's other imports carry.
 *
 * Tab destinations use the Growth page's own `?tab=` query param (read
 * on load by segmentFromParam in GrowthView.tsx); section destinations
 * use a #hash anchor on that section's own id, scrolled into view on
 * mount by useScrollToHash (lib/useScrollToHash.ts) since Next's own
 * scroll-to-hash isn't reliable across a fresh client navigation.
 *
 * `referralOk` must be the caller's own already-resolved
 * BizProfile.referralOk (config/bizProfiles.ts) — the exact same flag
 * that already hides the Growth page's own "Refer a friend" tab, false
 * today only for lawyer (referral-fee arrangements are restricted under
 * most states' rules of professional conduct). The Referrals chip is
 * suppressed when it's false, so the Overview strip never links to a
 * tab that silently isn't there for this business (see
 * segmentFromParam in GrowthView.tsx, which falls back to the default
 * "plan" segment for ?tab=referral when referralOk is false).
 */
export function buildGrowBannerTools(businessId: string, referralOk: boolean): GrowBannerTool[] {
  const tools: GrowBannerTool[] = [
    {
      icon: IconTicket,
      labelKey: "dashboard.overview.growBanner.tools.coupons.shortLabel",
      href: `/business/${businessId}/growth?tab=coupons`,
    },
  ];

  if (referralOk) {
    tools.push({
      icon: IconUsers,
      labelKey: "dashboard.overview.growBanner.tools.referral.shortLabel",
      href: `/business/${businessId}/growth?tab=referral`,
    });
  }

  tools.push(
    {
      icon: IconCalendarCheck,
      labelKey: "dashboard.overview.growBanner.tools.weeklyRoutine.shortLabel",
      href: `/business/${businessId}/growth#weekly-routine`,
    },
    {
      icon: IconTag,
      labelKey: "dashboard.overview.growBanner.tools.priceCheck.shortLabel",
      href: `/business/${businessId}/pricing`,
    },
    {
      icon: IconQrcode,
      labelKey: "dashboard.overview.growBanner.tools.reviewQrSign.shortLabel",
      href: `/business/${businessId}/website-reviews#get-more-reviews`,
    },
    {
      icon: IconTrophy,
      labelKey: "dashboard.overview.growBanner.tools.competitorCheck.shortLabel",
      href: `/business/${businessId}/competitors`,
    }
  );

  return tools;
}
