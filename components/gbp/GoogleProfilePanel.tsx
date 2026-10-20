"use client";

// The Growth page's "Google Profile" tab. Every plan sees what Google
// shows for this business today (the real fields saved from its last
// scan) and the connect status. Premium and Multi get the full tab:
// search demand (its own honest preview/awaiting states) and the
// features still coming. Free and Grow see the same real listing as a
// preview, with the Premium features listed as locked and "Unlock with
// Premium". Connecting itself happens on the Connect Google page.

import Link from "next/link";
import { IconLock } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { SectionTitle, SoonList, SoonRow } from "@/components/preview/PreviewParts";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { SearchDemandSection, type SearchDemandView } from "@/components/gbp/SearchDemandSection";
import { isPremiumPlan, type Plan } from "@/lib/plan";
import { formatShortDate, t, useLocale, useTimeZone } from "@/lib/i18n";

export interface GoogleListingFacts {
  rating: number | null;
  reviewCount: number | null;
  photoCount: number | null;
  hasHours: boolean;
  phone: string | null;
  website: string | null;
  category: string | null;
  googleMapsUri: string | null;
}

export function GoogleProfilePanel({
  businessId,
  plan,
  listing,
  websiteOnly,
  lastScanAt,
  connected,
  searchDemand,
}: {
  businessId: string;
  plan: Plan;
  /** null = no Google listing data (e.g. website-only). */
  listing: GoogleListingFacts | null;
  websiteOnly: boolean;
  lastScanAt: string | null;
  connected: boolean;
  searchDemand: SearchDemandView;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const premium = isPremiumPlan(plan);
  const missing = t(locale, "dashboard.googleProfile.notOnListing");
  const needsPremium = t(locale, "dashboard.googleProfile.needsPremium");
  const inPlanSoon = t(locale, "dashboard.googleProfile.inPlanSoon");
  const linkClass = "w-fit text-[13px] font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink";

  const rows: Array<{ label: string; value: string | null }> = listing
    ? [
        {
          label: t(locale, "dashboard.googleProfile.rowRating"),
          value: listing.rating !== null ? t(locale, "dashboard.googleProfile.ratingValue", { rating: listing.rating.toFixed(1), count: listing.reviewCount ?? 0 }) : null,
        },
        { label: t(locale, "dashboard.googleProfile.rowPhotos"), value: listing.photoCount ? t(locale, "dashboard.googleProfile.photosValue", { count: listing.photoCount }) : null },
        { label: t(locale, "dashboard.googleProfile.rowHours"), value: listing.hasHours ? t(locale, "dashboard.googleProfile.hoursListed") : null },
        { label: t(locale, "dashboard.googleProfile.rowPhone"), value: listing.phone },
        { label: t(locale, "dashboard.googleProfile.rowWebsite"), value: listing.website },
        { label: t(locale, "dashboard.googleProfile.rowCategory"), value: listing.category },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6 nav:gap-8" data-testid="google-profile-panel">
      {!premium && (
        <Card className="flex flex-col gap-2 border-brass/40 bg-brass/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2.5">
            <IconLock size={17} className="mt-0.5 shrink-0 text-brass" aria-hidden />
            <div>
              <div className="text-sm font-semibold text-ink">{t(locale, "dashboard.googleProfile.unlockPremium")}</div>
              <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.googleProfile.previewNote")}</p>
            </div>
          </div>
          <UpgradeTrigger feature="googleProfile" className="shrink-0" />
        </Card>
      )}

      <section>
        <SectionTitle>{t(locale, "dashboard.googleProfile.listingHeading")}</SectionTitle>
        <Card className="p-5">
          {websiteOnly || !listing ? (
            <p className="text-sm text-ink-soft">{t(locale, "dashboard.googleProfile.websiteOnly")}</p>
          ) : (
            <>
              <p className="mb-3 text-[12px] text-ink-mute">
                {lastScanAt
                  ? t(locale, "dashboard.googleProfile.listingAsOf", { date: formatShortDate(lastScanAt, locale, timeZone) })
                  : t(locale, "dashboard.googleProfile.listingNoScan")}
              </p>
              <dl className="flex flex-col divide-y divide-paper-line" data-testid="listing-rows">
                {rows.map((row) => (
                  <div key={row.label} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:justify-between sm:gap-4">
                    <dt className="text-[13px] font-medium text-ink-soft">{row.label}</dt>
                    <dd className={row.value ? "break-words text-sm font-semibold text-ink sm:text-right" : "text-sm text-ink-mute sm:text-right"}>{row.value ?? missing}</dd>
                  </div>
                ))}
              </dl>
              {listing.googleMapsUri && /^https:\/\//.test(listing.googleMapsUri) && (
                <a href={listing.googleMapsUri} target="_blank" rel="noopener noreferrer" className={`${linkClass} mt-3 inline-block`}>
                  {t(locale, "dashboard.googleProfile.openOnGoogle")}
                </a>
              )}
            </>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>{t(locale, "dashboard.googleProfile.connectHeading")}</SectionTitle>
        <Card className="flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className={connected ? "h-2.5 w-2.5 rounded-full bg-green" : "h-2.5 w-2.5 rounded-full bg-paper-deep"} aria-hidden />
            {connected ? t(locale, "dashboard.googleProfile.connected") : t(locale, "dashboard.googleProfile.notConnected")}
          </div>
          <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.googleProfile.connectBody")}</p>
          <Link href={`/business/${businessId}/connect-gbp`} className={linkClass}>
            {t(locale, "dashboard.googleProfile.connectLink")}
          </Link>
        </Card>
      </section>

      {premium ? (
        <>
          <section id="search-demand" className="scroll-mt-20">
            <SectionTitle>{t(locale, "dashboard.googleProfile.searchDemand")}</SectionTitle>
            <SearchDemandSection businessId={businessId} view={searchDemand} />
          </section>
          <section>
            <SectionTitle>{t(locale, "dashboard.googleProfile.featuresHeading")}</SectionTitle>
            <SoonList>
              <SoonRow title={t(locale, "dashboard.googleProfile.editing")} body={t(locale, "dashboard.googleProfile.editingBody")} status={inPlanSoon} />
              <SoonRow title={t(locale, "dashboard.googleProfile.insights")} body={t(locale, "dashboard.googleProfile.insightsBody")} status={inPlanSoon} />
            </SoonList>
          </section>
        </>
      ) : (
        <section>
          <SectionTitle>{t(locale, "dashboard.googleProfile.featuresHeading")}</SectionTitle>
          <SoonList>
            <SoonRow title={t(locale, "dashboard.googleProfile.searchDemand")} body={t(locale, "dashboard.googleProfile.searchDemandSoonBody")} status={needsPremium} />
            <SoonRow title={t(locale, "dashboard.googleProfile.editing")} body={t(locale, "dashboard.googleProfile.editingBody")} status={needsPremium} />
            <SoonRow title={t(locale, "dashboard.googleProfile.insights")} body={t(locale, "dashboard.googleProfile.insightsBody")} status={needsPremium} />
          </SoonList>
        </section>
      )}
    </div>
  );
}
