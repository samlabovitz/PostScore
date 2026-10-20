"use client";

// PostStudio on the Overview: one clear card that opens the full-screen
// PostStudio page (a real page — its checklist uses this business's real
// data). No price and no buy button here; the PostStudio page shows the
// price for the account's plan. "PostStudio" is a product name and is
// never translated.

import Link from "next/link";
import { IconArrowRight, IconLayoutDashboard } from "@tabler/icons-react";
import { studioHref } from "@/lib/postStudio";
import { t, useLocale } from "@/lib/i18n";

export function StudioComingSoon({ businessId }: { businessId: string }) {
  const locale = useLocale();
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--color-brass)_40%,transparent)] bg-paper px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5" data-testid="poststudio-card">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
          <IconLayoutDashboard size={17} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-serif text-base font-semibold text-ink">{t(locale, "dashboard.overview.postStudio.title")}</h2>
          <p className="text-[13px] leading-snug text-ink-soft">{t(locale, "dashboard.overview.postStudio.body")}</p>
        </div>
      </div>
      <Link
        href={studioHref(businessId, `/business/${businessId}`)}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-ink/90"
      >
        {t(locale, "dashboard.overview.postStudio.cta")}
        <IconArrowRight size={15} aria-hidden />
      </Link>
    </section>
  );
}
