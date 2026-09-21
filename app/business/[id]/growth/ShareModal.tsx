"use client";

import { IconBrandGoogle, IconBrandInstagram, IconMessage, IconPrinter } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { CopyBlock } from "@/components/ui/CopyBlock";
import { t, useLocale, type MessageKey } from "@/lib/i18n";

interface ShareOption {
  icon: typeof IconBrandGoogle;
  titleKey: MessageKey;
  howToKey: MessageKey;
}

const OPTIONS: ShareOption[] = [
  {
    icon: IconBrandGoogle,
    titleKey: "dashboard.growth.shareModal.optionGoogleTitle",
    howToKey: "dashboard.growth.shareModal.optionGoogleHowTo",
  },
  {
    icon: IconBrandInstagram,
    titleKey: "dashboard.growth.shareModal.optionSocialTitle",
    howToKey: "dashboard.growth.shareModal.optionSocialHowTo",
  },
  {
    icon: IconMessage,
    titleKey: "dashboard.growth.shareModal.optionTextTitle",
    howToKey: "dashboard.growth.shareModal.optionTextHowTo",
  },
  {
    icon: IconPrinter,
    titleKey: "dashboard.growth.shareModal.optionPrintTitle",
    howToKey: "dashboard.growth.shareModal.optionPrintHowTo",
  },
];

/** Honest hand-off sharing instructions, shared by the coupon and
 * referral features: the caller builds the pre-written caption
 * (buildShareCaption / buildReferralShareCaption in lib/promos.ts and
 * lib/referrals.ts) and this modal just explains where to post it —
 * PostScore never posts or sends anything itself. */
export function ShareModal({
  open,
  onClose,
  title,
  caption,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  caption: string;
}) {
  const locale = useLocale();
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] text-ink-mute">{t(locale, "dashboard.growth.shareModal.disclaimer")}</p>

        <div className="flex flex-col divide-y divide-paper-line">
          {OPTIONS.map((opt) => (
            <div key={opt.titleKey} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brass/10 text-brass">
                <opt.icon size={16} />
              </span>
              <div>
                <div className="text-[13px] font-semibold text-ink">{t(locale, opt.titleKey)}</div>
                <p className="mt-0.5 text-[12.5px] text-ink-soft">{t(locale, opt.howToKey)}</p>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-1.5 text-[13px] font-medium text-ink-soft">
            {t(locale, "dashboard.growth.shareModal.captionLabel")}
          </div>
          <CopyBlock text={caption} rows={3} />
        </div>
      </div>
    </Modal>
  );
}
