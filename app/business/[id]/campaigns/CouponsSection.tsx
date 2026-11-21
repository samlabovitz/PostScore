"use client";

import { CouponBuilder } from "./CouponBuilder";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { WeekPost } from "@/components/gbp/WeekPost";
import { isPremiumPlan } from "@/lib/plan";
import { t, useLocale } from "@/lib/i18n";
import { startPromo } from "@/app/actions/promos";
import { MAX_ACTIVE_PROMOS, type PromoRow } from "@/lib/promos";
import type { BizProfile } from "@/config/bizProfiles";
import type { Plan } from "@/lib/plan";
import type { CardBusiness } from "@/lib/printStudio/design";
import { PlanStrip } from "./CardDesigner";
import { HowItWorks } from "./HowItWorks";

export function CouponsSection({
  businessId,
  businessName,
  businessPhone,
  profile,
  promos,
  plan,
  printBusiness,
  onStarted,
}: {
  businessId: string;
  businessName: string;
  businessPhone: string | null;
  profile: BizProfile;
  /** The running coupons (owned by CampaignsView; tracked on All campaigns). */
  promos: PromoRow[];
  plan: Plan;
  printBusiness: CardBusiness;
  /** Saved: CampaignsView adds it to All campaigns and goes there. */
  onStarted?: (promo: PromoRow) => void;
}) {
  const locale = useLocale();
  const [posting, setPosting] = useState(false);
  async function handleStart(input: Parameters<typeof startPromo>[1]) {
    const result = await startPromo(businessId, input);
    if (result.status === "ok") onStarted?.(result.promo);
    return result;
  }

  // Free: a showroom — the real designer with the business's own name,
  // lightly faded; Save, Print, Download and Share open the promo box (the
  // builder and CardDesigner swap them on Free). No running list or tally.
  if (plan === "free")
    return (
      <div className="flex flex-col gap-6" data-testid="designer-showroom">
        <HowItWorks kind="coupon" businessId={businessId} />
        <div className="opacity-90">
          <CouponBuilder
            businessId={businessId}
            plan={plan}
            printBusiness={printBusiness}
            businessName={businessName}
            businessPhone={businessPhone}
            profile={profile}
            activeCount={promos.length}
            maxActive={MAX_ACTIVE_PROMOS}
            onStart={handleStart}
          />
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <HowItWorks kind="coupon" businessId={businessId} />

      <PlanStrip plan={plan} />

      {/* "Deals → Go there" lands here: the new-offer designer. */}
      <div id="new-offer" className="scroll-mt-20" />
      <CouponBuilder
        businessId={businessId}
        plan={plan}
        printBusiness={printBusiness}
        businessName={businessName}
        businessPhone={businessPhone}
        profile={profile}
        activeCount={promos.length}
        maxActive={MAX_ACTIVE_PROMOS}
        onStart={handleStart}
      />

      {/* Day 23E: the running offer goes on Google through the same post flow as the Growth page (a Google Offer post on Premium). */}
      {promos[0] && (
        <button type="button" onClick={() => setPosting(true)} className="w-fit text-[13px] font-semibold text-ink underline decoration-brass underline-offset-2" data-testid="post-offer-link">
          {t(locale, "dashboard.googleTab.w.offerLink")}
        </button>
      )}
      <Modal open={posting} onClose={() => setPosting(false)} title={t(locale, "dashboard.googleTab.w.offerModalTitle")}>
        {posting && promos[0] && <WeekPost businessId={businessId} premium={isPremiumPlan(plan)} promoId={promos[0].id} />}
      </Modal>
    </div>
  );
}
