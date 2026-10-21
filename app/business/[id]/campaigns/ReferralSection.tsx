"use client";

import { useEffect, useState } from "react";
import { ReferralBuilder } from "./ReferralBuilder";
import { startReferral } from "@/app/actions/referrals";
import { MAX_ACTIVE_REFERRALS, type ReferralRow } from "@/lib/referrals";
import type { BizProfile } from "@/config/bizProfiles";
import type { Plan } from "@/lib/plan";
import type { CardBusiness } from "@/lib/printStudio/design";
import { PlanStrip } from "./CardDesigner";
import { HowItWorks } from "./HowItWorks";
import { PASS_ON_STORAGE_PREFIX } from "./PassOnChoice";
import { PASS_ON, type PassOn } from "@/lib/printStudio/design";
import { readStorage, writeStorage } from "@/lib/signStudio/design";

export function ReferralSection({
  businessId,
  businessName,
  profile,
  referral,
  plan,
  printBusiness,
  onStarted,
}: {
  businessId: string;
  businessName: string;
  /** Kept for the shared section props (sharing now lives on All campaigns). */
  businessPhone?: string | null;
  profile: BizProfile;
  /** The running referral card (owned by CampaignsView; tracked on All campaigns). */
  referral: ReferralRow | null;
  plan: Plan;
  printBusiness: CardBusiness;
  /** Saved: CampaignsView shows it on All campaigns and goes there. */
  onStarted?: (referral: ReferralRow) => void;
}) {
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
    if (result.status === "ok") onStarted?.(result.referral);
    return result;
  }

  // Free: a showroom — the real designer with the business's own name,
  // lightly faded; Save, Print, Download and Share open the promo box (the
  // builder and CardDesigner swap them on Free). No running list or tally.
  if (plan === "free")
    return (
      <div className="flex flex-col gap-6" data-testid="designer-showroom">
        <HowItWorks kind="referral" passOn={passOn} businessId={businessId} />
        <div className="opacity-90">
          <ReferralBuilder
            businessId={businessId}
            passOn={passOn}
            onPassOnChange={setPassOn}
            plan={plan}
            printBusiness={printBusiness}
            businessName={businessName}
            profile={profile}
            activeCount={referral ? 1 : 0}
            maxActive={MAX_ACTIVE_REFERRALS}
            onStart={handleStart}
          />
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <HowItWorks kind="referral" passOn={passOn} businessId={businessId} />

      <PlanStrip plan={plan} />

      <ReferralBuilder
        businessId={businessId}
        passOn={passOn}
        onPassOnChange={setPassOn}
        plan={plan}
        printBusiness={printBusiness}
        businessName={businessName}
        profile={profile}
        activeCount={referral ? 1 : 0}
        maxActive={MAX_ACTIVE_REFERRALS}
        onStart={handleStart}
      />
    </div>
  );
}
