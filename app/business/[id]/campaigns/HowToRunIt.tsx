"use client";

// "How to run it": a collapsible five-step guide on the Coupons and
// Referrals tabs (Grow and up). Pick the offer, design and print, share,
// redeem and track with +1, end or refresh, plus the "never reward reviews"
// rule. Plain text, no calls. Free sees it as a locked block in the
// Campaigns showroom.

import { IconChevronDown, IconListNumbers, IconAlertTriangle } from "@tabler/icons-react";
import { t, useLocale, type MessageKey } from "@/lib/i18n";

export const GUIDE_STEPS = ["s1", "s2", "s3", "s4", "s5"] as const;
const G = (key: string) => `dashboard.campaigns.guide.${key}` as MessageKey;

export function HowToRunIt({ kind }: { kind: "coupons" | "referrals" }) {
  const locale = useLocale();
  return (
    <details data-testid="how-to-run-it" data-kind={kind} className="group rounded-xl border border-paper-deep bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
            <IconListNumbers size={16} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] font-semibold text-ink">{t(locale, G("heading"))}</span>
            <span className="text-[12.5px] text-ink-soft">{t(locale, G(kind === "coupons" ? "introCoupons" : "introReferrals"))}</span>
          </span>
        </span>
        <IconChevronDown size={18} aria-hidden className="shrink-0 text-ink-mute transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 border-t border-paper-line px-4 py-4">
        <ol className="flex flex-col gap-3.5">
          {GUIDE_STEPS.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">{i + 1}</span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13.5px] font-semibold text-ink">{t(locale, G(step))}</span>
                <span className="text-[13px] leading-relaxed text-ink-soft">{t(locale, G(`${kind}.${step}`))}</span>
              </span>
            </li>
          ))}
        </ol>
        <p data-testid="guide-rule" className="flex items-start gap-2 rounded-lg bg-paper px-3 py-2.5 text-[13px] leading-snug text-ink">
          <IconAlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0 text-brass" />
          {t(locale, G("rule"))}
        </p>
      </div>
    </details>
  );
}
