"use client";

import { useState } from "react";
import { IconHandClick, IconInfoCircle, IconSend, IconWalk } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { t, useLocale, type MessageKey } from "@/lib/i18n";

interface Step {
  icon: typeof IconSend;
  titleKey: MessageKey;
  bodyKey: MessageKey;
}

const STEPS: Step[] = [
  {
    icon: IconSend,
    titleKey: "dashboard.growth.howCouponsWork.step1Title",
    bodyKey: "dashboard.growth.howCouponsWork.step1Body",
  },
  {
    icon: IconWalk,
    titleKey: "dashboard.growth.howCouponsWork.step2Title",
    bodyKey: "dashboard.growth.howCouponsWork.step2Body",
  },
  {
    icon: IconHandClick,
    titleKey: "dashboard.growth.howCouponsWork.step3Title",
    bodyKey: "dashboard.growth.howCouponsWork.step3Body",
  },
];

export function HowCouponsWork() {
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
            {t(locale, "dashboard.growth.howCouponsWork.heading")}
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brass hover:underline"
          >
            <IconInfoCircle size={14} />
            {t(locale, "dashboard.growth.howCouponsWork.whatYouNeedToKnow")}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.titleKey} className="flex flex-col gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brass/10 text-brass">
                <step.icon size={16} />
              </span>
              <div className="text-[13px] font-semibold text-ink">{t(locale, step.titleKey)}</div>
              <p className="text-[12.5px] text-ink-soft">{t(locale, step.bodyKey)}</p>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t(locale, "dashboard.growth.howCouponsWork.modalTitle")}>
        <div className="flex flex-col gap-3 text-[13px] text-ink-soft">
          <p>
            <span className="font-semibold text-ink">
              {t(locale, "dashboard.growth.howCouponsWork.modalBuildLabel")}
            </span>{" "}
            {t(locale, "dashboard.growth.howCouponsWork.modalBuildBody")}
          </p>
          <p>
            <span className="font-semibold text-ink">
              {t(locale, "dashboard.growth.howCouponsWork.modalShareLabel")}
            </span>{" "}
            {t(locale, "dashboard.growth.howCouponsWork.modalShareBody")}
          </p>
          <p>
            <span className="font-semibold text-ink">
              {t(locale, "dashboard.growth.howCouponsWork.modalCustomerLabel")}
            </span>{" "}
            {t(locale, "dashboard.growth.howCouponsWork.modalCustomerBody")}
          </p>
          <p>
            <span className="font-semibold text-ink">
              {t(locale, "dashboard.growth.howCouponsWork.modalStaffLabel")}
            </span>{" "}
            {t(locale, "dashboard.growth.howCouponsWork.modalStaffBody")}
          </p>
          <div className="mt-1 rounded-lg bg-paper p-3 text-[12.5px] text-ink-mute">
            {t(locale, "dashboard.growth.howCouponsWork.modalHonestNote")}
          </div>
        </div>
      </Modal>
    </>
  );
}
