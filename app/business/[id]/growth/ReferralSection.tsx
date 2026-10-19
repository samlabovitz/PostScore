"use client";

import { useEffect, useState } from "react";
import { ReferralBuilder } from "./ReferralBuilder";
import { ActiveReferral } from "./ActiveReferral";
import { incrementReferralRedemption, endReferral, startReferral } from "@/app/actions/referrals";
import { MAX_ACTIVE_REFERRALS, type ReferralRow } from "@/lib/referrals";
import type { BizProfile } from "@/config/bizProfiles";
import type { Plan } from "@/lib/plan";
import type { CardBusiness } from "@/lib/printStudio/design";
import { PlanStrip } from "./CardDesigner";
import { HowItWorks } from "./HowItWorks";
import { PASS_ON_STORAGE_PREFIX, PassOnChoice } from "./PassOnChoice";
import { PASS_ON, type PassOn } from "@/lib/printStudio/design";
import { readStorage, writeStorage } from "@/lib/signStudio/design";

export function ReferralSection({
  businessId,
  businessName,
  businessPhone,
  profile,
  initialReferral,
  plan,
  printBusiness,
}: {
  businessId: string;
  businessName: string;
  businessPhone: string | null;
  profile: BizProfile;
  initialReferral: ReferralRow | null;
  plan: Plan;
  printBusiness: CardBusiness;
}) {
  const [referral, setReferral] = useState<ReferralRow | null>(initialReferral);
  // How customers pass it on — remembered on this device; Single card by
  // default (read after mount, so no hydration mismatch).
  const [passOn, setPassOnState] = useState<PassOn>("single");
  useEffect(() => {
    const saved = readStorage(PASS_ON_STORAGE_PREFIX + businessId);
    if (saved && (PASS_ON as string[]).includes(saved)) setPassOnState(saved as PassOn);
  }, [businessId]);
  const setPassOn = (v: PassOn) => {
    setPassOnState(v);
    writeStorage(PASS_ON_STORAGE_PREFIX + businessId, v);
  };

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
      <PassOnChoice value={passOn} onChange={setPassOn} />

      <HowItWorks kind="referral" passOn={passOn} businessId={businessId} />

      <PlanStrip plan={plan} />

      <ReferralBuilder
        businessId={businessId}
        passOn={passOn}
        plan={plan}
        printBusiness={printBusiness}
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
