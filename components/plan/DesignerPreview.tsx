"use client";

// A Free showroom of a real design tool (coupon / referral designer, the
// review sign designer): the SAME designer Grow and Premium see — its real
// layout, controls, live preview and templates, with the business's real
// name and QR — under a LIGHT blur, recognisable but not usable. Nothing
// inside can be clicked or focused (inert); one transparent button over it
// opens the promo box. Above it, never blurred: its icon, name, one
// line and a small "Preview" chip. Nothing is saved, printed or shared — no calls.

import type { ReactNode } from "react";
import { IconEye, type Icon as TablerIcon } from "@tabler/icons-react";
import { t, useLocale } from "@/lib/i18n";
import type { PromoFeature } from "@/lib/upgradePromos";
import { UpgradeButton } from "@/components/upgrade/UpgradeTrigger";

const INERT = { inert: "" } as Record<string, string>;

export function DesignerPreview({
  feature = "print",
  title,
  description,
  icon: Icon,
  children,
}: {
  feature?: PromoFeature;
  /** The clear (never blurred) heading above the preview. */
  title: string;
  description: string;
  icon: TablerIcon;
  children: ReactNode;
}) {
  const locale = useLocale();
  return (
    <section data-testid="designer-preview" className="flex flex-col gap-3">
      <div className="flex items-start gap-3" data-testid="designer-preview-heading">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
          <Icon size={17} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
            <span data-testid="preview-chip" className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-white">
              <IconEye size={12} aria-hidden />
              {t(locale, "dashboard.free.previewChip")}
            </span>
          </div>
          <p className="text-[13px] text-ink-soft">{description}</p>
        </div>
      </div>
      <div className="relative overflow-hidden rounded-2xl">
        <div {...INERT} aria-hidden="true" data-testid="designer-preview-content" className="pointer-events-none select-none blur-[2.5px]">
          {children}
        </div>
        <UpgradeButton feature={feature} testId="designer-preview-open" className="absolute inset-0 h-full w-full cursor-pointer bg-transparent">
          <span className="sr-only">{title}</span>
        </UpgradeButton>
      </div>
    </section>
  );
}
