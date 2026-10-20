"use client";

// A locked feature, shown for real: the business's own data in the real
// UI, read-only (inert — nothing in it can be clicked or focused), fading
// toward the bottom under a small lock, then one unlock line (from the
// saved Free unlock lines — only when its data is real) and the lock
// control, which opens the promo box (components/upgrade). Never fake
// data, never a paid call: the caller passes content it already has.

import type { ReactNode } from "react";
import { IconLock } from "@tabler/icons-react";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { featurePlan, type PromoFeature } from "@/lib/upgradePromos";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";

// React 18 has no typed `inert`; as an attribute it makes the subtree
// non-interactive and hidden from assistive tech (the summary below is
// what a screen reader hears).
const INERT = { inert: "" } as Record<string, string>;

export function LockedPreview({
  title,
  unlock,
  feature = "grow",
  children,
  height = "max-h-40",
  className,
}: {
  /** What this is ("How to fix: Business hours") — for screen readers. */
  title: string;
  /** One unlock line (lib/upgradePromos.ts unlockLine); null hides it. */
  unlock: string | null;
  feature?: PromoFeature;
  /** The real feature, with the business's own data. */
  children: ReactNode;
  /** How much of it shows before the fade (a Tailwind max-height). */
  height?: string;
  className?: string;
}) {
  const locale = useLocale();
  const plan = featurePlan(feature);
  return (
    <section data-testid="locked-preview" className={cn("overflow-hidden rounded-xl border border-paper-deep bg-white", className)}>
      <p className="sr-only">{t(locale, "dashboard.free.lockedPreviewSr", { title })}</p>
      <div className="relative">
        <div {...INERT} aria-hidden="true" data-testid="locked-preview-content" className={cn("pointer-events-none select-none overflow-hidden p-4", height)}>
          {children}
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-b from-white/0 via-white/80 to-white" />
        <span
          aria-hidden="true"
          className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-paper-deep bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink-soft"
        >
          <IconLock size={11} className="text-brass" />
          {t(locale, "dashboard.free.lockedPreviewBadge")}
        </span>
      </div>
      <div className="flex flex-col gap-2 border-t border-paper-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {unlock && <p className="text-[13px] leading-snug text-ink">{unlock}</p>}
        <UpgradeTrigger
          feature={feature}
          variant="button"
          className="w-fit shrink-0"
          label={t(locale, `dashboard.upgrade.trigger.${plan === "grow" ? "unlockGrow" : "unlockPremium"}` as MessageKey)}
        />
      </div>
    </section>
  );
}
