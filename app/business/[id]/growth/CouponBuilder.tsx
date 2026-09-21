"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  IconArrowDown,
  IconCalendarStats,
  IconChevronDown,
  IconDownload,
  IconQrcode,
  IconRefresh,
  IconRocket,
  IconShare2,
  IconSparkles,
  IconTicket,
  IconUserPlus,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  buildRedeemUrl,
  defaultExpiryDate,
  formatExpiry,
  generateCouponCode,
} from "@/lib/coupons";
import { downloadDataUrl, renderCouponPng } from "@/lib/couponImage";
import { buildShareCaption } from "@/lib/promos";
import type { BizProfile } from "@/config/bizProfiles";
import type { StartPromoInput, StartPromoResult } from "@/app/actions/promos";
import { ShareModal } from "./ShareModal";
import { t, tPlural, useLocale } from "@/lib/i18n";

const DEFAULT_EXPIRY_DAYS = 60;

interface OfferAngle {
  id: keyof BizProfile["couponAngles"];
  titleKey: "dashboard.growth.coupon.angleFirstTimeTitle" | "dashboard.growth.coupon.angleSeasonalTitle" | "dashboard.growth.coupon.angleSlowDayTitle";
  whyKey: "dashboard.growth.coupon.angleFirstTimeWhy" | "dashboard.growth.coupon.angleSeasonalWhy" | "dashboard.growth.coupon.angleSlowDayWhy";
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

function CouponPreview({
  businessName,
  offer,
  instructions,
  code,
  expiryLabel,
  qrDataUrl,
  terms,
}: {
  businessName: string;
  offer: string;
  instructions: string;
  code: string;
  expiryLabel: string;
  qrDataUrl: string | null;
  terms: string;
}) {
  const locale = useLocale();
  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-ink px-5 py-3.5">
        <div className="truncate text-[15px] font-bold text-white">{businessName}</div>
        <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-brass">
          {t(locale, "dashboard.growth.coupon.previewExclusiveOffer")}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-2.5 p-5">
          <div className="font-serif text-2xl font-bold leading-snug text-ink">
            {offer.trim() || t(locale, "dashboard.growth.coupon.previewOfferPlaceholder")}
          </div>
          {instructions.trim() && <p className="text-[12.5px] text-ink-soft">{instructions.trim()}</p>}
          <div className="mt-1 flex w-fit flex-col items-start gap-0.5 rounded-lg border border-brass/40 bg-brass/5 px-3 py-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-brass">
              {t(locale, "dashboard.growth.coupon.previewCodeLabel")}
            </span>
            <span className="font-mono text-sm font-bold text-ink">{code}</span>
          </div>
          <div className="mt-1 text-[12.5px] font-bold text-red">{expiryLabel}</div>
          {terms.trim() && <p className="text-[11px] text-ink-mute">{terms.trim()}</p>}
        </div>
        <div className="flex w-[160px] flex-col items-center justify-center gap-2 border-l border-dashed border-paper-deep bg-paper p-4">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt={t(locale, "dashboard.growth.coupon.previewQrAlt")} className="h-24 w-24" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-paper-deep text-ink-mute">
              <IconQrcode size={28} />
            </div>
          )}
          <div className="text-center text-[10px] text-ink-mute">
            {t(locale, "dashboard.growth.coupon.previewScanToRedeem")}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-brass">PostScore</div>
        </div>
      </div>
    </Card>
  );
}

export function CouponBuilder({
  businessName,
  businessPhone,
  profile,
  activeCount,
  maxActive,
  onStart,
}: {
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
}) {
  const locale = useLocale();
  const [offer, setOffer] = useState(() => profile.couponPresets[0]?.label ?? "");
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

  // The real page origin is only knowable client-side. This component
  // is loaded with ssr:false (see GrowthView), so this always runs in
  // the browser — no hydration mismatch to guard against here.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const redeemUrl = origin ? buildRedeemUrl(origin, code) : null;

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!redeemUrl) return;
    let cancelled = false;
    QRCode.toDataURL(redeemUrl, {
      margin: 1,
      width: 300,
      color: { dark: "#14243f", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [redeemUrl]);

  const [downloadState, setDownloadState] = useState<
    { kind: "idle" } | { kind: "working" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const hasRequiredFields = offer.trim().length > 0 && expiry.length > 0;
  const canDownload = hasRequiredFields && !!qrDataUrl;
  const atLimit = activeCount >= maxActive;
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

  async function handleDownload() {
    if (!qrDataUrl) return;
    setDownloadState({ kind: "working" });
    try {
      const png = await renderCouponPng({
        businessName,
        offer: offer.trim(),
        instructions: instructions.trim(),
        code,
        expiryLabel: formatExpiry(expiry),
        qrDataUrl,
        terms: terms.trim() || undefined,
      });
      downloadDataUrl(png, `${code}-coupon.png`);
      setDownloadState({ kind: "idle" });
    } catch (err) {
      setDownloadState({
        kind: "error",
        message: err instanceof Error ? err.message : t(locale, "dashboard.growth.coupon.downloadErrorFallback"),
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {ANGLES.map((angle) => (
          <Card key={angle.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brass/10 text-brass">
                <angle.icon size={16} />
              </span>
              <div className="text-sm font-semibold text-ink">{t(locale, angle.titleKey)}</div>
            </div>
            <p className="flex-1 text-[13px] text-ink-soft">{t(locale, angle.whyKey)}</p>
            <Button
              variant="default"
              size="sm"
              onClick={() => applyAngle(angle)}
              className="w-fit"
            >
              {t(locale, "dashboard.growth.coupon.useThisOffer")}
              <IconArrowDown size={13} />
            </Button>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 nav:grid-cols-2">
        <Card className="flex flex-col gap-4 p-5">
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
              {t(locale, "dashboard.growth.coupon.quickPicksFor", { label: profile.label })}
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
                      : "border-paper-deep bg-white text-ink-soft hover:border-ink-soft hover:text-ink"
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
              <IconChevronDown
                size={13}
                className={cn("transition-transform", moreOpen && "rotate-180")}
              />
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
        </Card>

        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
            {t(locale, "dashboard.growth.coupon.livePreview")}
          </div>
          <CouponPreview
            businessName={businessName}
            offer={offer}
            instructions={instructions}
            code={code}
            expiryLabel={formatExpiry(expiry)}
            qrDataUrl={qrDataUrl}
            terms={terms}
          />

          <div className="flex flex-wrap gap-2.5">
            <Button
              variant="default"
              onClick={handleDownload}
              disabled={!canDownload || downloadState.kind === "working"}
            >
              <IconDownload size={16} />
              {downloadState.kind === "working"
                ? t(locale, "dashboard.growth.coupon.downloadGenerating")
                : t(locale, "dashboard.growth.coupon.downloadImage")}
            </Button>
            <Button variant="default" onClick={() => setShareOpen(true)} disabled={!hasRequiredFields}>
              <IconShare2 size={16} />
              {t(locale, "dashboard.growth.coupon.share")}
            </Button>
          </div>
          {!canDownload && (
            <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.growth.coupon.downloadHint")}</p>
          )}
          {downloadState.kind === "error" && (
            <p className="text-[12px] text-red">{downloadState.message}</p>
          )}

          <Button variant="brass" onClick={handleStart} disabled={!canStart}>
            <IconRocket size={16} />
            {startState.kind === "working"
              ? t(locale, "dashboard.growth.coupon.starting")
              : t(locale, "dashboard.growth.coupon.startAndTrack")}
          </Button>
          {atLimit ? (
            <p className="text-[12px] text-ink-mute">
              {tPlural(locale, "dashboard.growth.coupon.atLimitMessage", maxActive)}
            </p>
          ) : startState.kind === "success" ? (
            <p className="text-[12px] text-green">{t(locale, "dashboard.growth.coupon.startSuccess")}</p>
          ) : startState.kind === "error" ? (
            <p className="text-[12px] text-red">{startState.message}</p>
          ) : null}

          <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.growth.coupon.disclaimer")}</p>
        </div>
      </div>

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
