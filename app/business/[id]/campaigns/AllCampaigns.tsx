"use client";

import { Card } from "@/components/ui/Card";
import { ActivePromotions } from "./ActivePromotions";
import { ActiveReferral } from "./ActiveReferral";
import { endPromo, incrementPromoRedemption } from "@/app/actions/promos";
import { endReferral, incrementReferralRedemption } from "@/app/actions/referrals";
import { MAX_ACTIVE_PROMOS, type PromoRow } from "@/lib/promos";
import { MAX_ACTIVE_REFERRALS, type ReferralRow } from "@/lib/referrals";
import { t, useLocale } from "@/lib/i18n";

/** "All campaigns" — the tracking home (Grow and up): every running coupon
 * and referral card with its type, code, start date, times used, +1, Share
 * and End. The rows live in CampaignsView, so one saved on the Coupons or
 * Referrals tab (design only) shows up here at once, highlighted. */
export function AllCampaigns({
  businessName,
  businessPhone,
  couponsOk,
  referralOk,
  promos,
  referral,
  onPromosChange,
  onReferralChange,
  highlightId = null,
}: {
  businessName: string;
  businessPhone: string | null;
  couponsOk: boolean;
  referralOk: boolean;
  promos: PromoRow[];
  referral: ReferralRow | null;
  onPromosChange: (update: (prev: PromoRow[]) => PromoRow[]) => void;
  onReferralChange: (update: (prev: ReferralRow | null) => ReferralRow | null) => void;
  /** Just saved: highlighted for a few seconds. */
  highlightId?: string | null;
}) {
  const locale = useLocale();
  const setPromos = onPromosChange;
  const setReferral = onReferralChange;

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
    if (result.status === "ok") setReferral(() => null);
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

  const referralFirst = showReferral && referral?.id === highlightId;
  return (
    <div className={referralFirst ? "flex flex-col-reverse gap-6" : "flex flex-col gap-6"}>
      {showPromos && (
        <ActivePromotions promos={promos} businessName={businessName} businessPhone={businessPhone} maxActive={MAX_ACTIVE_PROMOS} onRedeem={redeemPromo} onEnd={endOnePromo} highlightId={highlightId} />
      )}
      {showReferral && (
        <ActiveReferral referral={referral} businessName={businessName} businessPhone={businessPhone} maxActive={MAX_ACTIVE_REFERRALS} onRedeem={redeemReferral} onEnd={endTheReferral} highlighted={!!referral && referral.id === highlightId} />
      )}
    </div>
  );
}
