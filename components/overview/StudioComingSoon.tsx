"use client";

// PostStudio — announced, not sold: a "Coming soon" pill and no buy or
// upgrade button, and no price, until checkout works. "PostStudio" is a
// product name and is never translated.

import { IconBrush, IconClipboardList, IconWorld, IconLayoutDashboard } from "@tabler/icons-react";
import { t, useLocale } from "@/lib/i18n";

const PARTS = [
  { icon: IconWorld, key: "dashboard.overview.studio.website" },
  { icon: IconClipboardList, key: "dashboard.overview.studio.menu" },
  { icon: IconBrush, key: "dashboard.overview.studio.logo" },
] as const;

export function StudioComingSoon() {
  const locale = useLocale();
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--color-brass)_40%,transparent)] bg-paper px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
          <IconLayoutDashboard size={17} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-base font-semibold text-ink">PostStudio</h2>
            <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-paper">{t(locale, "dashboard.overview.studio.comingSoon")}</span>
          </div>
          <p className="text-[12.5px] font-medium text-ink">{t(locale, "dashboard.overview.studio.subtitle")}</p>
          <p className="text-[13px] leading-snug text-ink-soft">{t(locale, "dashboard.overview.studio.body")}</p>
        </div>
      </div>
      {/* One line of chips beside the text on wider screens; below it on
          phones, wrapping if the longer labels need it. */}
      <ul className="flex shrink-0 flex-wrap gap-1.5 sm:flex-nowrap">
        {PARTS.map(({ icon: Icon, key }) => (
          <li key={key} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-paper-deep bg-white px-2.5 py-1 text-[12px] font-semibold text-ink">
            <Icon size={13} className="text-brass" aria-hidden />
            {t(locale, key)}
          </li>
        ))}
      </ul>
    </section>
  );
}
