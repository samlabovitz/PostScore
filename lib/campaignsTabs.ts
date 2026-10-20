// The Campaigns page's tabs, read from the URL (?tab=coupons /
// ?tab=referrals) so links and back/forward land on the right one. The
// old Growth tab names (?tab=referral) still work. Pure.

export type CampaignsTab = "all" | "coupons" | "referrals";

export function campaignsTabFromParam(param: string | null | undefined, tools: { couponsOk: boolean; referralOk: boolean }): CampaignsTab {
  if (param === "coupons" && tools.couponsOk) return "coupons";
  if ((param === "referrals" || param === "referral") && tools.referralOk) return "referrals";
  return "all";
}

export function campaignsHref(businessId: string, tab: CampaignsTab = "all"): string {
  return `/business/${businessId}/campaigns${tab === "all" ? "" : `?tab=${tab}`}`;
}
