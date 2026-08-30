"use client";

import { useState } from "react";
import { ReferralBuilder } from "./ReferralBuilder";
import { ActiveReferral } from "./ActiveReferral";
import { incrementReferralRedemption, endReferral, startReferral } from "@/app/actions/referrals";
import { MAX_ACTIVE_REFERRALS, type ReferralRow } from "@/lib/referrals";
import type { BizProfile } from "@/config/bizProfiles";

export function ReferralSection({
  businessId,
  businessName,
  businessPhone,
  profile,
  initialReferral,
}: {
  businessId: string;
  businessName: string;
  businessPhone: string | null;
  profile: BizProfile;
  initialReferral: ReferralRow | null;
}) {
  const [referral, setReferral] = useState<ReferralRow | null>(initialReferral);

  async function handleStart(input: Parameters<typeof startReferral>[1]) {
    const result = await startReferral(businessId, input);
    if (result.status === "ok") {
      setReferral(result.referral);
    }
    return result;
  }

  async function handleRedeem(referralId: string) {
    const result = await incrementReferralRedemption(referralId);
    if (result.status === "ok") {
      setReferral((prev) => (prev ? { ...prev, redemptions: result.redemptions } : prev));
    }
    return result;
  }

  async function handleEnd(referralId: string) {
    const result = await endReferral(referralId);
    if (result.status === "ok") {
      setReferral(null);
    }
    return result;
  }

  return (
    <div className="flex flex-col gap-6">
      <ReferralBuilder
        businessName={businessName}
        profile={profile}
        activeCount={referral ? 1 : 0}
        maxActive={MAX_ACTIVE_REFERRALS}
        onStart={handleStart}
      />

      <ActiveReferral
        referral={referral}
        businessName={businessName}
        businessPhone={businessPhone}
        maxActive={MAX_ACTIVE_REFERRALS}
        onRedeem={handleRedeem}
        onEnd={handleEnd}
      />
    </div>
  );
}
