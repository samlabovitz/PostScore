"use client";

// The Website page's "Scanning: newarkcolorfulyunnan.com" line: the one
// site PostScore grades, screenshots and shows (lib/businessWebsite.ts),
// with its favicon and where it came from — and "Wrong site?" beside it.

import { useState } from "react";
import { IconWorld } from "@tabler/icons-react";
import { WrongSite } from "@/components/website/WrongSite";
import { siteHost } from "@/lib/ownerWebsite";
import type { WebsiteSource } from "@/lib/businessWebsite";
import { t, useLocale, type MessageKey } from "@/lib/i18n";

/** The site's own /favicon.ico (no third-party favicon service). */
function faviconUrl(url: string): string | null {
  try {
    return `${new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).origin}/favicon.ico`;
  } catch {
    return null;
  }
}

export function ScanningLine({ businessId, site }: { businessId: string; site: { url: string; source: WebsiteSource } | null }) {
  const locale = useLocale();
  const [iconFailed, setIconFailed] = useState(false);
  const icon = site ? faviconUrl(site.url) : null;
  return (
    <div data-testid="scanning-line" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-soft">
      {site ? (
        <>
          <span className="font-semibold text-ink">{t(locale, "dashboard.website.scanning")}</span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {icon && !iconFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" width={16} height={16} className="h-4 w-4 shrink-0 rounded-sm" onError={() => setIconFailed(true)} />
            ) : (
              <IconWorld size={15} aria-hidden className="shrink-0 text-brass" />
            )}
            <a href={site.url} target="_blank" rel="noreferrer" className="truncate font-semibold text-ink underline-offset-2 hover:underline">
              {siteHost(site.url)}
            </a>
          </span>
          <span className="rounded-full bg-paper-deep px-2 py-px text-[11.5px] font-semibold text-ink-soft">{t(locale, `dashboard.wrongSite.source.${site.source}` as MessageKey)}</span>
        </>
      ) : (
        <span>{t(locale, "dashboard.wrongSite.none")}</span>
      )}
      <WrongSite businessId={businessId} />
    </div>
  );
}
