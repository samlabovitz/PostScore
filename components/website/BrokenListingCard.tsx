"use client";

// The Google listing's website link is parked or broken: a clear warning
// card (never a screenshot of that page as "what customers see") with the
// fix — the same one as the Overview's urgent alert.

import { IconAlertTriangle } from "@tabler/icons-react";
import { WebsiteLinkFix } from "@/components/gbp/WebsiteLinkFix";
import { t, useLocale } from "@/lib/i18n";

export function BrokenListingCard({ businessId, listingUrl, suggested }: { businessId: string; listingUrl: string; suggested: string | null }) {
  const locale = useLocale();
  return (
    <div id="website-link" data-testid="broken-listing-card" role="alert" className="flex scroll-mt-20 flex-col gap-2.5 rounded-xl border border-red/40 bg-red/5 px-4 py-3.5 text-[13px]">
      <p className="flex items-start gap-2 font-semibold text-ink">
        <IconAlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0 text-red" />
        {t(locale, "dashboard.website.brokenListing.title")}
      </p>
      <p className="break-all text-ink-soft">{t(locale, "dashboard.website.brokenListing.body", { url: listingUrl })}</p>
      <WebsiteLinkFix businessId={businessId} suggested={suggested} />
    </div>
  );
}
