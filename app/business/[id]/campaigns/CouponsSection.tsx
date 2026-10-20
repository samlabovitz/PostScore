"use client";

import { useState } from "react";
import { CouponBuilder } from "./CouponBuilder";
import { ActivePromotions } from "./ActivePromotions";
import { MoreWaysToBringPeopleIn } from "./MoreWaysToBringPeopleIn";
import { incrementPromoRedemption, endPromo, startPromo } from "@/app/actions/promos";
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
  initialPromos,
  plan,
  printBusiness,
}: {
  businessId: string;
  businessName: string;
  businessPhone: string | null;
  profile: BizProfile;
  initialPromos: PromoRow[];
  plan: Plan;
  printBusiness: CardBusiness;
}) {
  const [promos, setPromos] = useState<PromoRow[]>(initialPromos);

  async function handleStart(input: Parameters<typeof startPromo>[1]) {
    const result = await startPromo(businessId, input);
    if (result.status === "ok") {
      setPromos((prev) => [result.promo, ...prev]);
    }
    return result;
  }

  async function handleRedeem(promoId: string) {
    const result = await incrementPromoRedemption(promoId);
    if (result.status === "ok") {
      setPromos((prev) =>
        prev.map((p) => (p.id === promoId ? { ...p, redemptions: result.redemptions } : p))
      );
    }
    return result;
  }

  async function handleEnd(promoId: string) {
    const result = await endPromo(promoId);
    if (result.status === "ok") {
      setPromos((prev) => prev.filter((p) => p.id !== promoId));
    }
    return result;
  }

  return (
    <div className="flex flex-col gap-6">
      <HowItWorks kind="coupon" businessId={businessId} />

      <PlanStrip plan={plan} />

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

      <ActivePromotions
        promos={promos}
        businessName={businessName}
        businessPhone={businessPhone}
        maxActive={MAX_ACTIVE_PROMOS}
        onRedeem={handleRedeem}
        onEnd={handleEnd}
      />

      <MoreWaysToBringPeopleIn promos={promos} businessName={businessName} />
    </div>
  );
}
