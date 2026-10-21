"use client";

import { useState } from "react";
import {
  IconArrowDown,
  IconCalendarStats,
  IconChevronDown,
  IconLock,
  IconRefresh,
  IconRocket,
  IconShare2,
  IconSparkles,
  IconTicket,
  IconUserPlus,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button, buttonClasses } from "@/components/ui/Button";
import { UpgradeButton } from "@/components/upgrade/UpgradeTrigger";
import { cn } from "@/lib/utils";
import { defaultExpiryDate, formatExpiry, generateCouponCode } from "@/lib/coupons";
import { buildShareCaption } from "@/lib/promos";
import type { Plan } from "@/lib/plan";
import { EXAMPLES, needsFilling, type CardBusiness } from "@/lib/printStudio/design";
import { CardDesigner } from "./CardDesigner";
import type { BizProfile } from "@/config/bizProfiles";
import type { StartPromoInput, StartPromoResult } from "@/app/actions/promos";
import { ShareModal } from "./ShareModal";
import { t, tPlural, useLocale } from "@/lib/i18n";

const DEFAULT_EXPIRY_DAYS = 60;

interface OfferAngle {
  id: keyof BizProfile["couponAngles"];
  titleKey:
    | "dashboard.growth.coupon.angleFirstTimeTitle"
    | "dashboard.growth.coupon.angleSeasonalTitle"
    | "dashboard.growth.coupon.angleSlowDayTitle";
  whyKey:
    | "dashboard.growth.coupon.angleFirstTimeWhy"
    | "dashboard.growth.coupon.angleSeasonalWhy"
    | "dashboard.growth.coupon.angleSlowDayWhy";
  icon: typeof IconUserPlus;
}

const ANGLES: OfferAngle[] = [
  {
    id: "firstTime",
    titleKey: "dashboard.growth.coupon.angleFirstTimeTitle",
    whyKey: "dashboard.growth.coupon.angleFirstTimeWhy",
    icon: IconUserPlus,
  },
  {
    id: "seasonal",
    titleKey: "dashboard.growth.coupon.angleSeasonalTitle",
    whyKey: "dashboard.growth.coupon.angleSeasonalWhy",
    icon: IconSparkles,
  },
  {
    id: "slowDay",
    titleKey: "dashboard.growth.coupon.angleSlowDayTitle",
    whyKey: "dashboard.growth.coupon.angleSlowDayWhy",
    icon: IconCalendarStats,
  },
];

export function CouponBuilder({
  preview = false,
  businessId,
  businessName,
  businessPhone,
  profile,
  activeCount,
  maxActive,
  onStart,
  plan,
  printBusiness,
}: {
  /** The Free showroom page: the top cards hidden, Customize open. */
  preview?: boolean;
  businessId: string;
  businessName: string;
  businessPhone: string | null;
  profile: BizProfile;
  /** How many promos are currently active for this business — drives
   * the "Start & track this offer" disabled state and copy. Owned by
   * the parent CouponsSection so it stays in sync with the Active
   * promotions list below. */
  activeCount: number;
  maxActive: number;
  onStart: (input: StartPromoInput) => Promise<StartPromoResult>;
  /** The account's plan — gates printing (lib/premium.ts getPlan()). */
  plan: Plan;
  /** What a printed card may show (the business's own facts). */
  printBusiness: CardBusiness;
}) {
  const locale = useLocale();
  // An example the owner must make their own — PostScore never picks an
  // amount. (Quick picks below are the owner's own choice.)
  const [offer, setOffer] = useState<string>(() => EXAMPLES.offer[locale === "es" ? "es" : "en"]);
  const [expiry, setExpiry] = useState(() => defaultExpiryDate(DEFAULT_EXPIRY_DAYS, new Date()));
  const [code, setCode] = useState(() => generateCouponCode());
  const [moreOpen, setMoreOpen] = useState(false);
  const [instructions, setInstructions] = useState(() => t(locale, "dashboard.growth.coupon.defaultInstructions"));
  const [terms, setTerms] = useState(() => t(locale, "dashboard.growth.coupon.defaultTerms"));
  const [angleId, setAngleId] = useState<string>("custom");
  const [shareOpen, setShareOpen] = useState(false);
  const [startState, setStartState] = useState<
    { kind: "idle" } | { kind: "working" } | { kind: "success" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  function applyAngle(angle: OfferAngle) {
    setOffer(profile.couponAngles[angle.id]);
    setCode(generateCouponCode());
    setAngleId(angle.id);
    setStartState({ kind: "idle" });
  }

  const hasRequiredFields = !needsFilling(offer) && expiry.length > 0;
  const atLimit = activeCount >= maxActive;
  // Free: a showroom — the designer works, but saving, sharing and
  // tracking open the promo box instead (5f).
  const showroom = plan === "free";
  const canStart = hasRequiredFields && !atLimit && startState.kind !== "working";

  async function handleStart() {
    setStartState({ kind: "working" });
    const result = await onStart({
      type: angleId,
      offer: offer.trim(),
      code,
      instructions: instructions.trim(),
      terms: terms.trim(),
      expiry,
    });
    if (result.status === "ok") {
      setStartState({ kind: "success" });
      setCode(generateCouponCode());
    } else if (result.status === "limit_reached") {
      setStartState({
        kind: "error",
        message: tPlural(locale, "dashboard.growth.coupon.startLimitError", maxActive),
      });
    } else {
      setStartState({
        kind: "error",
        message: result.status === "error" ? result.message : t(locale, "dashboard.growth.coupon.startErrorFallback"),
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brass">
          <IconTicket size={14} />
          {t(locale, "dashboard.growth.coupon.eyebrow")}
        </div>
        <h2 className="mt-1.5 font-serif text-2xl font-bold text-ink">
          {t(locale, "dashboard.growth.coupon.heading")}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">{t(locale, "dashboard.growth.coupon.intro")}</p>
      </div>

      {!preview && (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {ANGLES.map((angle) => (
          <Card key={angle.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
                <angle.icon size={16} />
              </span>
              <div className="text-sm font-semibold text-ink">{t(locale, angle.titleKey)}</div>
            </div>
            <p className="flex-1 text-[13px] text-ink-soft">{t(locale, angle.whyKey)}</p>
            <Button variant="default" size="sm" onClick={() => applyAngle(angle)} className="w-fit">
              {t(locale, "dashboard.growth.coupon.useThisOffer")}
              <IconArrowDown size={13} />
            </Button>
          </Card>
        ))}
      </div>
      )}

      <CardDesigner
        kind="coupon"
        showroom={preview}
        plan={plan}
        businessId={businessId}
        business={printBusiness}
        text={{
          offer,
          expiration: expiry,
          code,
          subline: instructions,
          finePrint: terms,
          friendOffer: "",
          referrerReward: "",
        }}
        onApplySaved={(saved) => {
          // A saved design brings its own offer, expiry, code and fine print back.
          if (saved.offer) setOffer(saved.offer);
          setExpiry(saved.expiration);
          if (saved.code) setCode(saved.code);
          setInstructions(saved.subline);
          setTerms(saved.finePrint);
          setAngleId("custom");
        }}
        fields={
          <>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-ink-soft">
                {t(locale, "dashboard.growth.coupon.offerLabel")} <span className="text-red">*</span>
              </label>
              <input
                type="text"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder={t(locale, "dashboard.growth.coupon.offerPlaceholder")}
                className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
              />
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-ink-soft">
                {t(locale, "dashboard.growth.coupon.quickPicksFor", {
                  label: profile.label,
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {profile.couponPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setOffer(preset.label)}
                    title={preset.description}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-left text-[12.5px] font-medium transition-colors",
                      offer === preset.label
                        ? "border-brass bg-brass/10 text-brass"
                        : "border-paper-deep bg-white text-ink-soft hover:border-ink-soft hover:text-ink",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-medium text-ink-soft">
                {t(locale, "dashboard.growth.coupon.expiresLabel")} <span className="text-red">*</span>
              </label>
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
              />
            </div>

            <div>
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                className="flex items-center gap-1 text-[12.5px] font-medium text-brass hover:underline"
              >
                {t(locale, "dashboard.growth.coupon.moreOptions")}
                <IconChevronDown size={13} className={cn("transition-transform", moreOpen && "rotate-180")} />
              </button>

              {moreOpen && (
                <div className="mt-3 flex flex-col gap-4 border-t border-paper-line pt-4">
                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-ink-soft">
                      {t(locale, "dashboard.growth.coupon.redemptionCodeLabel")}
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
                        aria-label={t(locale, "dashboard.growth.coupon.generateNewCodeAriaLabel")}
                      >
                        <IconRefresh size={14} />
                      </Button>
                    </div>
                    <p className="mt-1 text-[12px] text-ink-mute">
                      {t(locale, "dashboard.growth.coupon.codeAutoGeneratedNote")}
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-ink-soft">
                      {t(locale, "dashboard.growth.coupon.instructionsLabel")}
                    </label>
                    <textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[13px] font-medium text-ink-soft">
                      {t(locale, "dashboard.growth.coupon.termsLabel")}{" "}
                      <span className="font-normal text-ink-mute">
                        {t(locale, "dashboard.growth.coupon.optionalHint")}
                      </span>
                    </label>
                    <textarea
                      value={terms}
                      onChange={(e) => setTerms(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        }
        actions={
          <>
            {showroom ? (
              <>
                <UpgradeButton feature="print" className={buttonClasses("default", "default", "w-fit")}>
                  <IconLock size={16} aria-hidden />
                  {t(locale, "dashboard.growth.coupon.share")}
                </UpgradeButton>
                <UpgradeButton feature="print" className={buttonClasses("brass")}>
                  <IconLock size={16} aria-hidden />
                  {t(locale, "dashboard.growth.coupon.startAndTrack")}
                </UpgradeButton>
              </>
            ) : (
              <>
            <Button
              variant="default"
              onClick={() => setShareOpen(true)}
              disabled={!hasRequiredFields}
              className="w-fit"
            >
              <IconShare2 size={16} />
              {t(locale, "dashboard.growth.coupon.share")}
            </Button>
            <Button variant="brass" onClick={handleStart} disabled={!canStart}>
              <IconRocket size={16} />
              {startState.kind === "working"
                ? t(locale, "dashboard.growth.coupon.starting")
                : t(locale, "dashboard.growth.coupon.startAndTrack")}
            </Button>
              </>
            )}
            {atLimit ? (
              <p className="text-[12px] text-ink-mute">
                {tPlural(locale, "dashboard.growth.coupon.atLimitMessage", maxActive)}
              </p>
            ) : startState.kind === "idle" && !showroom ? (
              <p className="text-[12px] text-ink-mute" data-testid="track-on-all">{t(locale, "dashboard.campaigns.trackOnAll")}</p>
            ) : startState.kind === "success" ? (
              <p className="text-[12px] text-green">{t(locale, "dashboard.growth.coupon.startSuccess")}</p>
            ) : startState.kind === "error" ? (
              <p className="text-[12px] text-red">{startState.message}</p>
            ) : null}
          </>
        }
      />

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={t(locale, "dashboard.growth.coupon.shareModalTitle")}
        caption={buildShareCaption({
          businessName,
          offer,
          code,
          expiryLabel: formatExpiry(expiry),
          phone: businessPhone,
        })}
      />
    </div>
  );
}
