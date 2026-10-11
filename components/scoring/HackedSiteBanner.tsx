"use client";

import Link from "next/link";
import { IconAlertTriangle } from "@tabler/icons-react";
import { t, useLocale } from "@/lib/i18n";

/**
 * The one short, urgent "your website may be hacked" banner — shown at
 * the top of the Overview and the Website page only when the Site
 * security check found real spam (see hackSignsFor in
 * lib/siteSecurity.ts). Never says the site IS hacked, and never shows
 * the snippet itself: the full evidence lives on the Website page's
 * Site security row, which `href` points to.
 */
export function HackedSiteBanner({ href }: { href: string }) {
  const locale = useLocale();
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red/30 bg-red/5 px-4 py-3">
      <IconAlertTriangle size={18} className="mt-0.5 shrink-0 text-red" />
      <p className="text-[13.5px] text-ink">
        <span className="font-semibold">{t(locale, "dashboard.hackedBanner.message")}</span>{" "}
        <Link href={href} className="whitespace-nowrap font-medium text-red hover:underline">
          {t(locale, "dashboard.hackedBanner.link")}
        </Link>
      </p>
    </div>
  );
}
