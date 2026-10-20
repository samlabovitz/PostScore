"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { ActivePromotions } from "./ActivePromotions";
import { ActiveReferral } from "./ActiveReferral";
import { endPromo, incrementPromoRedemption } from "@/app/actions/promos";
import { endReferral, incrementReferralRedemption } from "@/app/actions/referrals";
import { MAX_ACTIVE_PROMOS, type PromoRow } from "@/lib/promos";
import { MAX_ACTIVE_REFERRALS, type ReferralRow } from "@/lib/referrals";
import { t, useLocale } from "@/lib/i18n";

/** "All campaigns": every running coupon and referral card with its code,
 * times used and +1 — the same rows and server actions the designers use,
 * so a tally is the same number on every tab. Creating one happens on the
 * Coupons and Referrals tabs (the tabs above are the way in). */
export function AllCampaigns({
  businessName,
  businessPhone,
  couponsOk,
  referralOk,
  initialPromos,
  initialReferral,
}: {
  businessName: string;
  businessPhone: string | null;
  couponsOk: boolean;
  referralOk: boolean;
  initialPromos: PromoRow[];
  initialReferral: ReferralRow | null;
}) {
  const locale = useLocale();
  const [promos, setPromos] = useState<PromoRow[]>(initialPromos);
  const [referral, setReferral] = useState<ReferralRow | null>(initialReferral);

  async function redeemPromo(id: string) {
    const result = await incrementPromoRedemption(id);
    if (result.status === "ok") setPromos((prev) => prev.map((p) => (p.id === id ? { ...p, redemptions: result.redemptions } : p)));
    return result;
  }
  async function endOnePromo(id: string) {
    const result = await endPromo(id);
    if (result.status === "ok") setPromos((prev) => prev.filter((p) => p.id !== id));
    return result;
  }
  async function redeemReferral(id: string) {
    const result = await incrementReferralRedemption(id);
    if (result.status === "ok") setReferral((prev) => (prev ? { ...prev, redemptions: result.redemptions } : prev));
    return result;
  }
  async function endTheReferral(id: string) {
    const result = await endReferral(id);
    if (result.status === "ok") setReferral(null);
    return result;
  }

  const showPromos = couponsOk && promos.length > 0;
  const showReferral = referralOk && referral !== null;
  if (!showPromos && !showReferral) {
    return (
      <Card className="p-5 text-sm text-ink-soft" data-testid="campaigns-empty">
        {t(locale, "dashboard.campaigns.noneRunning")}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {showPromos && (
        <ActivePromotions promos={promos} businessName={businessName} businessPhone={businessPhone} maxActive={MAX_ACTIVE_PROMOS} onRedeem={redeemPromo} onEnd={endOnePromo} />
      )}
      {showReferral && (
        <ActiveReferral referral={referral} businessName={businessName} businessPhone={businessPhone} maxActive={MAX_ACTIVE_REFERRALS} onRedeem={redeemReferral} onEnd={endTheReferral} />
      )}
    </div>
  );
}
