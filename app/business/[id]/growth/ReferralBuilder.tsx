"use client";

import { useState } from "react";
import { IconChevronDown, IconDownload, IconGift, IconRefresh, IconRocket } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { generateCouponCode } from "@/lib/coupons";
import { downloadDataUrl } from "@/lib/couponImage";
import { renderReferralPng } from "@/lib/referralImage";
import type { BizProfile } from "@/config/bizProfiles";
import type { StartReferralInput, StartReferralResult } from "@/app/actions/referrals";
import { t, useLocale } from "@/lib/i18n";

function ReferralPreview({
  businessName,
  referrerReward,
  friendReward,
  code,
}: {
  businessName: string;
  referrerReward: string;
  friendReward: string;
  code: string;
}) {
  const locale = useLocale();
  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-ink px-5 py-3.5">
        <div className="truncate text-[15px] font-bold text-white">{businessName}</div>
        <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-brass">
          {t(locale, "dashboard.growth.referral.previewBadge")}
        </div>
      </div>
      <div className="flex flex-col gap-3 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-paper-deep bg-paper p-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-mute">
              {t(locale, "dashboard.growth.referral.previewForYou")}
            </div>
            <div className="mt-1 font-serif text-lg font-bold leading-snug text-ink">
              {referrerReward.trim() || t(locale, "dashboard.growth.referral.previewYourRewardPlaceholder")}
            </div>
          </div>
          <div className="rounded-lg border border-paper-deep bg-paper p-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-mute">
              {t(locale, "dashboard.growth.referral.previewForFriend")}
            </div>
            <div className="mt-1 font-serif text-lg font-bold leading-snug text-ink">
              {friendReward.trim() || t(locale, "dashboard.growth.referral.previewTheirRewardPlaceholder")}
            </div>
          </div>
        </div>
        <div className="mt-1 flex w-fit flex-col items-start gap-0.5 rounded-lg border border-brass/40 bg-brass/5 px-3 py-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-brass">
            {t(locale, "dashboard.growth.referral.referralCodeLabel")}
          </span>
          <span className="font-mono text-sm font-bold text-ink">{code}</span>
        </div>
        <p className="text-[11px] text-ink-mute">
          {t(locale, "dashboard.growth.referral.previewGiveCodeNote")}
        </p>
      </div>
    </Card>
  );
}

export function ReferralBuilder({
  businessName,
  profile,
  activeCount,
  maxActive,
  onStart,
}: {
  businessName: string;
  profile: BizProfile;
  /** Whether a referral program is already active for this business —
   * drives the "Start & track this referral" disabled state and copy.
   * Owned by the parent ReferralSection so it stays in sync with the
   * Active referral card below. */
  activeCount: number;
  maxActive: number;
  onStart: (input: StartReferralInput) => Promise<StartReferralResult>;
}) {
  const locale = useLocale();
  const firstPreset = profile.referralPresets[0];
  const [referrerReward, setReferrerReward] = useState(() => firstPreset?.referrerReward ?? "");
  const [friendReward, setFriendReward] = useState(() => firstPreset?.friendReward ?? "");
  const [code, setCode] = useState(() => generateCouponCode());
  const [moreOpen, setMoreOpen] = useState(false);

  const [downloadState, setDownloadState] = useState<
    { kind: "idle" } | { kind: "working" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [startState, setStartState] = useState<
    { kind: "idle" } | { kind: "working" } | { kind: "success" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const hasRequiredFields = referrerReward.trim().length > 0 && friendReward.trim().length > 0;
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

  async function handleDownload() {
    setDownloadState({ kind: "working" });
    try {
      const png = await renderReferralPng({
        businessName,
        referrerReward: referrerReward.trim(),
        friendReward: friendReward.trim(),
        code,
      });
      downloadDataUrl(png, `${code}-referral.png`);
      setDownloadState({ kind: "idle" });
    } catch (err) {
      setDownloadState({
        kind: "error",
        message: err instanceof Error ? err.message : t(locale, "dashboard.growth.referral.downloadErrorFallback"),
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
                  <span className="font-semibold text-ink">
                    {t(locale, "dashboard.growth.referral.presetYouGet")}
                  </span>
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

      <div className="grid grid-cols-1 gap-6 nav:grid-cols-2">
        <Card className="flex flex-col gap-4 p-5">
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
              <IconChevronDown
                size={13}
                className={cn("transition-transform", moreOpen && "rotate-180")}
              />
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
        </Card>

        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
            {t(locale, "dashboard.growth.referral.livePreview")}
          </div>
          <ReferralPreview
            businessName={businessName}
            referrerReward={referrerReward}
            friendReward={friendReward}
            code={code}
          />

          <Button
            variant="brass"
            onClick={handleDownload}
            disabled={!hasRequiredFields || downloadState.kind === "working"}
          >
            <IconDownload size={16} />
            {downloadState.kind === "working"
              ? t(locale, "dashboard.growth.referral.downloadGenerating")
              : t(locale, "dashboard.growth.referral.downloadImage")}
          </Button>
          {!hasRequiredFields && (
            <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.growth.referral.downloadHint")}</p>
          )}
          {downloadState.kind === "error" && (
            <p className="text-[12px] text-red">{downloadState.message}</p>
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

          <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.growth.referral.disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}
