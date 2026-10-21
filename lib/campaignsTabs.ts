// The Campaigns page's tabs, read from the URL (?tab=coupons /
// ?tab=referrals) so links and back/forward land on the right one. The
// old Growth tab names (?tab=referral) still work. Pure.

export type CampaignsTab = "all" | "coupons" | "referrals";

/** `hubFirst`: Premium/Multi open on "All campaigns" (the hub); Grow opens
 * on its first designer tab, since the hub is a Premium preview for it
 * (?tab=all still opens that preview). */
export function campaignsTabFromParam(param: string | null | undefined, tools: { couponsOk: boolean; referralOk: boolean }, hubFirst: boolean = true): CampaignsTab {
  if (param === "coupons" && tools.couponsOk) return "coupons";
  if ((param === "referrals" || param === "referral") && tools.referralOk) return "referrals";
  if (param === "all" || hubFirst) return "all";
  return tools.couponsOk ? "coupons" : tools.referralOk ? "referrals" : "all";
}

export function campaignsHref(businessId: string, tab: CampaignsTab = "all"): string {
  return `/business/${businessId}/campaigns${tab === "all" ? "" : `?tab=${tab}`}`;
}
