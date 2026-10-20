"use client";

import { useState } from "react";
import { IconChevronDown, IconGift, IconRefresh, IconRocket, IconShare2 } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { generateCouponCode } from "@/lib/coupons";
import type { Plan } from "@/lib/plan";
import { EXAMPLES, needsFilling, type CardBusiness, type PassOn } from "@/lib/printStudio/design";
import { ShareModal } from "./ShareModal";
import { CardDesigner } from "./CardDesigner";
import { PassOnChoice } from "./PassOnChoice";
import type { BizProfile } from "@/config/bizProfiles";
import type { StartReferralInput, StartReferralResult } from "@/app/actions/referrals";
import { t, useLocale } from "@/lib/i18n";

export function ReferralBuilder({
  businessId,
  businessName,
  passOn,
  onPassOnChange,
  profile,
  activeCount,
  maxActive,
  onStart,
  plan,
  printBusiness,
}: {
  businessId: string;
  businessName: string;
  /** How customers pass it on (decides the card layout). */
  passOn: PassOn;
  onPassOnChange: (passOn: PassOn) => void;
  profile: BizProfile;
  /** Whether a referral program is already active for this business —
   * drives the "Start & track this referral" disabled state and copy.
   * Owned by the parent ReferralSection so it stays in sync with the
   * Active referral card below. */
  activeCount: number;
  maxActive: number;
  onStart: (input: StartReferralInput) => Promise<StartReferralResult>;
  /** The account's plan — gates printing (lib/premium.ts getPlan()). */
  plan: Plan;
  /** What a printed card may show (the business's own facts). */
  printBusiness: CardBusiness;
}) {
  const locale = useLocale();
  const lang = locale === "es" ? "es" : "en";
  // Examples the owner must make their own — PostScore never picks an
  // amount. (Quick picks below are the owner's own choice.)
  const [referrerReward, setReferrerReward] = useState<string>(() => EXAMPLES.referrerReward[lang]);
  const [friendReward, setFriendReward] = useState<string>(() => EXAMPLES.friendOffer[lang]);
  const [code, setCode] = useState(() => generateCouponCode());
  const [moreOpen, setMoreOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const [startState, setStartState] = useState<
    { kind: "idle" } | { kind: "working" } | { kind: "success" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const hasRequiredFields = !needsFilling(referrerReward) && !needsFilling(friendReward);
  const atLimit = activeCount >= maxActive;
  const canStart = hasRequiredFields && !atLimit && startState.kind !== "working";

  async function handleStart() {
    setStartState({ kind: "working" });
    const result = await onStart({
      referrerReward: referrerReward.trim(),
      friendReward: friendReward.trim(),
      code,
    });
    if (result.status === "ok") {
      setStartState({ kind: "success" });
      setCode(generateCouponCode());
    } else if (result.status === "limit_reached") {
      setStartState({
        kind: "error",
        message: t(locale, "dashboard.growth.referral.startLimitError"),
      });
    } else {
      setStartState({
        kind: "error",
        message: result.status === "error" ? result.message : t(locale, "dashboard.growth.referral.startErrorFallback"),
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brass">
          <IconGift size={14} />
          {t(locale, "dashboard.growth.referral.eyebrow")}
        </div>
        <h2 className="mt-1.5 font-serif text-2xl font-bold text-ink">
          {t(locale, "dashboard.growth.referral.heading")}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">{t(locale, "dashboard.growth.referral.intro")}</p>
      </div>

      <div>
        <div className="mb-2 text-[13px] font-medium text-ink-soft">
          {t(locale, "dashboard.growth.referral.quickPicksFor", { label: profile.label })}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {profile.referralPresets.map((preset) => (
            <Card key={preset.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-col gap-1 text-[13px]">
                <div>
                  <span className="font-semibold text-ink">{t(locale, "dashboard.growth.referral.presetYouGet")}</span>
                  <span className="text-ink-soft">{preset.referrerReward}</span>
                </div>
                <div>
                  <span className="font-semibold text-ink">
                    {t(locale, "dashboard.growth.referral.presetFriendGets")}
                  </span>
                  <span className="text-ink-soft">{preset.friendReward}</span>
                </div>
              </div>
              <p className="flex-1 text-[12.5px] text-ink-mute">{preset.description}</p>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setReferrerReward(preset.referrerReward);
                  setFriendReward(preset.friendReward);
                }}
                className="w-fit"
              >
                {t(locale, "dashboard.growth.referral.useThisReward")}
              </Button>
            </Card>
          ))}
        </div>
      </div>

      <CardDesigner
        kind="referral"
        plan={plan}
        businessId={businessId}
        business={printBusiness}
        text={{
          offer: "",
          friendOffer: friendReward,
          referrerReward,
          expiration: "",
          code,
          subline: "",
          finePrint: "",
          passOn,
        }}
        onPassOnChange={onPassOnChange}
        onApplySaved={(saved) => {
          // A saved design brings its own rewards and code back (pass-on via onPassOnChange).
          if (saved.referrerReward) setReferrerReward(saved.referrerReward);
          if (saved.friendOffer) setFriendReward(saved.friendOffer);
          if (saved.code) setCode(saved.code);
        }}
        fields={
          <>
            <PassOnChoice value={passOn} onChange={onPassOnChange} />

            <div>
              <label className="mb-1 block text-[13px] font-medium text-ink-soft">
                {t(locale, "dashboard.growth.referral.referrerRewardLabel")} <span className="text-red">*</span>
              </label>
              <input
                type="text"
                value={referrerReward}
                onChange={(e) => setReferrerReward(e.target.value)}
                placeholder={t(locale, "dashboard.growth.referral.referrerRewardPlaceholder")}
                className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
              />
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-medium text-ink-soft">
                {t(locale, "dashboard.growth.referral.friendRewardLabel")} <span className="text-red">*</span>
              </label>
              <input
                type="text"
                value={friendReward}
                onChange={(e) => setFriendReward(e.target.value)}
                placeholder={t(locale, "dashboard.growth.referral.friendRewardPlaceholder")}
                className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
              />
            </div>

            <div>
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                className="flex items-center gap-1 text-[12.5px] font-medium text-brass hover:underline"
              >
                {t(locale, "dashboard.growth.referral.moreOptions")}
                <IconChevronDown size={13} className={cn("transition-transform", moreOpen && "rotate-180")} />
              </button>

              {moreOpen && (
                <div className="mt-3 flex flex-col gap-4 border-t border-paper-line pt-4">
                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-ink-soft">
                      {t(locale, "dashboard.growth.referral.referralCodeLabel")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 font-mono text-sm text-ink outline-none focus:border-ink-soft"
                      />
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => setCode(generateCouponCode())}
                        aria-label={t(locale, "dashboard.growth.referral.generateNewCodeAriaLabel")}
                      >
                        <IconRefresh size={14} />
                      </Button>
                    </div>
                    <p className="mt-1 text-[12px] text-ink-mute">
                      {t(locale, "dashboard.growth.referral.codeAutoGeneratedNote")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        }
        actions={
          <>
            {passOn === "digital" && (
              <div className="flex flex-col gap-1">
                <Button variant="default" onClick={() => setShareOpen(true)} disabled={!hasRequiredFields} className="w-fit">
                  <IconShare2 size={16} />
                  {t(locale, "dashboard.growth.referral.share")}
                </Button>
                <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.growth.referral.shareHint")}</p>
              </div>
            )}
            <Button variant="brass" onClick={handleStart} disabled={!canStart}>
              <IconRocket size={16} />
              {startState.kind === "working"
                ? t(locale, "dashboard.growth.referral.starting")
                : t(locale, "dashboard.growth.referral.startAndTrack")}
            </Button>
            {atLimit ? (
              <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.growth.referral.atLimitMessage")}</p>
            ) : startState.kind === "success" ? (
              <p className="text-[12px] text-green">{t(locale, "dashboard.growth.referral.startSuccess")}</p>
            ) : startState.kind === "error" ? (
              <p className="text-[12px] text-red">{startState.message}</p>
            ) : null}
          </>
        }
      />
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={t(locale, "dashboard.growth.referral.shareModalTitle")}
        caption={t(locale, "dashboard.growth.referral.shareCaption", { business: businessName, friendReward: friendReward.trim(), code })}
      />
    </div>
  );
}
