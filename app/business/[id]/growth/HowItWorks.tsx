"use client";

// "How it works" — three plain steps at the top of the coupon and
// referral designers, then "Confused? Ask PostAI →". Honest about the
// one manual part: the owner taps +1 to count a redemption; PostScore
// never sees the register. Referral steps follow how customers pass the
// card on (and say how the owner knows who referred the friend). The
// coupon page keeps its "What you need to know" details.

import { useState } from "react";
import { IconCash, IconDeviceMobileMessage, IconGift, IconHandClick, IconInfoCircle, IconPencil, IconPrinter, IconScissors, IconSend, IconUsers } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import type { PassOn } from "@/lib/printStudio/design";
import { AskPostAI } from "@/components/studio/AskPostAI";
import { t, useLocale, type MessageKey } from "@/lib/i18n";

const STEPS = {
  coupon: [IconPrinter, IconHandClick, IconCash],
  single: [IconPencil, IconGift, IconUsers],
  tear: [IconGift, IconScissors, IconUsers],
  digital: [IconSend, IconDeviceMobileMessage, IconUsers],
} as const;

export function HowItWorks({ kind, passOn = "single", businessId }: { kind: "coupon" | "referral"; passOn?: PassOn; businessId: string }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const variant = kind === "coupon" ? "coupon" : passOn;
  const key = (k: string) => (kind === "coupon" ? `dashboard.growth.howItWorks.coupon.${k}` : `dashboard.growth.howItWorks.referral.${passOn}.${k}`) as MessageKey;
  return (
    <>
      <section data-testid="how-it-works" className="rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-mute">{t(locale, "dashboard.growth.howItWorks.heading")}</h3>
          {kind === "coupon" && (
            <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brass hover:underline">
              <IconInfoCircle size={14} aria-hidden />
              {t(locale, "dashboard.growth.howCouponsWork.whatYouNeedToKnow")}
            </button>
          )}
        </div>
        <ol className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STEPS[variant].map((Icon, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span aria-hidden className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
                <Icon size={17} />
                <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white">{i + 1}</span>
              </span>
              <p className="text-[13px] leading-snug text-ink">{t(locale, key(`step${i + 1}`))}</p>
            </li>
          ))}
        </ol>
        <div className="mt-3 border-t border-paper-line pt-2.5">
          <AskPostAI businessId={businessId} question={kind === "coupon" ? "coupon_cards" : "referral_cards"} />
        </div>
      </section>

      {kind === "coupon" && (
        <Modal open={open} onClose={() => setOpen(false)} title={t(locale, "dashboard.growth.howCouponsWork.modalTitle")}>
          <div className="flex flex-col gap-3 text-[13px] text-ink-soft">
            {(["Build", "Share", "Customer", "Staff"] as const).map((part) => (
              <p key={part}>
                <span className="font-semibold text-ink">{t(locale, `dashboard.growth.howCouponsWork.modal${part}Label` as MessageKey)}</span>{" "}
                {t(locale, `dashboard.growth.howCouponsWork.modal${part}Body` as MessageKey)}
              </p>
            ))}
            <div className="mt-1 rounded-lg bg-paper p-3 text-[12.5px] text-ink-mute">{t(locale, "dashboard.growth.howCouponsWork.modalHonestNote")}</div>
          </div>
        </Modal>
      )}
    </>
  );
}
