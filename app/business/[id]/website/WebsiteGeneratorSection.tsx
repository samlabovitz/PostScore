"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { CollapsibleGenerator } from "./CollapsibleGenerator";
import { StarterSiteBuilder } from "./StarterSiteBuilder";
import type { OpeningHoursPeriod } from "@/lib/google/places";
import type { FaqEntry } from "@/config/bizProfiles";
import { normalizeLocale, t, useLocale, type Locale } from "@/lib/i18n";

/**
 * Owns the one piece of state the FAQ card and the starter-site
 * generator need to share — the generated site's own "Site language"
 * (StarterSiteBuilder's own selector) — so the FAQ draft always matches
 * whatever language the generator is currently building in. Preserves
 * the exact section order app/business/[id]/website/page.tsx used
 * before this existed: FAQ before a collapsed generator when the
 * business already has a real website, generator before FAQ otherwise.
 */
export function WebsiteGeneratorSection({
  businessId,
  businessName,
  businessLanguage,
  category,
  phone,
  address,
  openingHours,
  openingHoursPeriods,
  rating,
  reviewCount,
  googleMapsUri,
  profileId,
  builderOfferReason,
  hasWebsite,
  faqEn,
  faqEs,
}: {
  businessId: string;
  businessName: string;
  businessLanguage: string | null;
  category: string | null;
  phone: string | null;
  address: string | null;
  openingHours: string[] | null;
  openingHoursPeriods: OpeningHoursPeriod[] | null;
  rating: number | null;
  reviewCount: number | null;
  googleMapsUri: string | null;
  profileId: string;
  builderOfferReason: "no_website" | "underperforming" | "backup";
  hasWebsite: boolean;
  /** Already token-substituted (renderFaq) for this real business, in
   * each of the two site languages. */
  faqEn: FaqEntry[];
  faqEs: FaqEntry[];
}) {
  const locale = useLocale();
  // Mirrors StarterSiteBuilder's own siteLocale state (via
  // onSiteLocaleChange below) purely so the FAQ card can pick the
  // matching language — StarterSiteBuilder's own state stays the one
  // real source of truth for what the generated site itself uses.
  const [siteLocale, setSiteLocale] = useState<Locale>(() => normalizeLocale(businessLanguage));
  const faq = siteLocale === "es" ? faqEs : faqEn;

  const faqSection = (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        {t(locale, "dashboard.website.faqDraftHeading")}
      </div>
      <p className="mb-3 text-sm text-ink-soft">{t(locale, "dashboard.website.faqDraftIntro")}</p>
      <Card className="p-5">
        <div className="flex flex-col divide-y divide-paper-line">
          {faq.map((entry) => (
            <div key={entry.question} className="py-3 first:pt-0 last:pb-0">
              <div className="text-sm font-semibold text-ink">{entry.question}</div>
              <p className="mt-0.5 text-[13px] text-ink-soft">{entry.answer}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );

  const generator = (
    <StarterSiteBuilder
      businessId={businessId}
      businessName={businessName}
      businessLanguage={businessLanguage}
      category={category}
      phone={phone}
      address={address}
      openingHours={openingHours}
      openingHoursPeriods={openingHoursPeriods}
      rating={rating}
      reviewCount={reviewCount}
      googleMapsUri={googleMapsUri}
      profileId={profileId}
      builderOfferReason={builderOfferReason}
      onSiteLocaleChange={setSiteLocale}
    />
  );

  return hasWebsite ? (
    <>
      {faqSection}
      <CollapsibleGenerator defaultExpanded={false}>{generator}</CollapsibleGenerator>
    </>
  ) : (
    <>
      {generator}
      {faqSection}
    </>
  );
}
