"use client";

import type { OwnerHours } from "@/lib/ownerHours";
import type { StarterSiteDetails } from "@/lib/starterSiteDetails";
import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { CollapsibleGenerator } from "./CollapsibleGenerator";
import { StarterSiteBuilder } from "./StarterSiteBuilder";
import type { OpeningHoursPeriod } from "@/lib/google/places";
import type { FaqEntry } from "@/config/bizProfiles";
import { normalizeLocale, t, useLocale, type Locale } from "@/lib/i18n";
import { studioHref } from "@/lib/postStudio";
import { LockedPreview } from "@/components/plan/LockedPreview";
import type { Plan } from "@/lib/plan";
import { PostStudioShowcase } from "./PostStudioShowcase";

/**
 * Owns the one piece of state the FAQ card and the starter-site
 * generator need to share — the generated site's own "Site language"
 * (StarterSiteBuilder's own selector) — so the FAQ draft always matches
 * whatever language the generator is currently building in.
 *
 * The Website page's two paths, on every plan:
 * A) "Keep your current website — fix it with PostScore" (a real site
 *    only): `pathA` (Free: the locked how-to and Re-check; Grow+: the
 *    working ones) and the FAQ draft (locked on Free).
 * B) "Or start fresh with a new website": the starter generator (open on
 *    Free and when there's no real site; collapsed next to one on Grow+),
 *    then the PostStudio card.
 */
export function WebsiteGeneratorSection({
  businessId,
  businessName,
  businessLanguage,
  category,
  phone,
  address,
  openingHoursPeriods,
  starterSiteHours,
  starterSiteHoursEnabled,
  starterSiteDetails,
  starterSiteDetailsEnabled,
  timeZone,
  placeId,
  socialLinks,
  year,
  storefront,
  mapEmbed,
  profileId,
  builderOfferReason,
  faqEn,
  faqEs,
  free = false,
  plan,
  realSite,
  socialPlatform = null,
  builderName = null,
  pathA = null,
}: {
  plan: Plan;
  /** A real website (not none, not a social page): path A shows. */
  realSite: boolean;
  /** The social page standing in for a website ("Facebook"), if any. */
  socialPlatform?: string | null;
  /** The detected site builder's name, for path A's intro. */
  builderName?: string | null;
  /** Path A's tools above the FAQ (Free: locked blocks; Grow+: working). */
  pathA?: ReactNode;
  /** Free: the generator works fully; the download and the FAQ draft are
   * locked, and "Open full preview" shows a watermarked preview. */
  free?: boolean;
  businessId: string;
  businessName: string;
  businessLanguage: string | null;
  category: string | null;
  phone: string | null;
  address: string | null;
  openingHoursPeriods: OpeningHoursPeriod[] | null;
  starterSiteHours: OwnerHours | null;
  starterSiteHoursEnabled: boolean;
  starterSiteDetails: StarterSiteDetails | null;
  starterSiteDetailsEnabled: boolean;
  timeZone: string;
  placeId: string | null;
  socialLinks: Array<{ platform: string; url: string }>;
  year: number;
  storefront: boolean;
  mapEmbed: { key: string; placeId: string } | null;
  profileId: string;
  builderOfferReason: "no_website" | "underperforming" | "backup";
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

  const faqSection = free ? (
    <LockedPreview compact title={t(locale, "dashboard.free.web.faqTitle")} unlock={t(locale, "dashboard.upgrade.unlock.faq")} />
  ) : (
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
      openingHoursPeriods={openingHoursPeriods}
      starterSiteHours={starterSiteHours}
      starterSiteHoursEnabled={starterSiteHoursEnabled}
      starterSiteDetails={starterSiteDetails}
      starterSiteDetailsEnabled={starterSiteDetailsEnabled}
      timeZone={timeZone}
      placeId={placeId}
      socialLinks={socialLinks}
      year={year}
      storefront={storefront}
      mapEmbed={mapEmbed}
      profileId={profileId}
      builderOfferReason={builderOfferReason}
      onSiteLocaleChange={setSiteLocale}
      free={free}
      postStudioHref={free ? studioHref(businessId, `/business/${businessId}/website`) : null}
    />
  );

  // The page's ONE PostStudio card (Multi: "Continue in PostStudio →").
  const showcase = (
    <PostStudioShowcase businessId={businessId} businessName={businessName} plan={plan} profileId={profileId} storefront={storefront} />
  );
  const heading = (key: "dashboard.free.web.pathA" | "dashboard.free.web.pathB") => (
    <h2 className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-ink">{t(locale, key)}</h2>
  );
  // Free always shows the generator open ("try it free"); Grow and up keep
  // it collapsed next to a real site, open when there's none.
  const open = free || !realSite;
  const introB = realSite ? t(locale, "dashboard.free.web.pathBIntro") : socialPlatform ? t(locale, "dashboard.free.web.pathBSocial", { platform: socialPlatform }) : null;

  return (
    <>
      {/* A) Keep the current site and fix it — only for a real site. */}
      {realSite && (
        <section data-testid="path-fix" className="flex flex-col gap-4">
          <div>
            {heading("dashboard.free.web.pathA")}
            <p className="mt-1 max-w-2xl text-sm text-ink-soft">
              {t(locale, free ? "dashboard.free.web.pathAIntro" : "dashboard.free.web.pathAIntroPaid", { builder: builderName ?? t(locale, "dashboard.free.web.yourBuilder") })}
            </p>
          </div>
          {pathA}
          {faqSection}
        </section>
      )}
      {/* B) Or start fresh: the starter site, then PostStudio. */}
      <section data-testid="path-fresh" className={realSite ? "flex flex-col gap-6 border-t border-paper-deep pt-8 nav:pt-10" : "flex flex-col gap-6"}>
        {(realSite || introB) && (
          <div>
            {realSite && heading("dashboard.free.web.pathB")}
            {introB && <p className="mt-1 max-w-2xl text-sm text-ink-soft">{introB}</p>}
          </div>
        )}
        <div id="starter-site" className="scroll-mt-20">
          {open ? generator : <CollapsibleGenerator defaultExpanded={false}>{generator}</CollapsibleGenerator>}
        </div>
        {showcase}
        {/* No real site: nothing to fix, but the FAQ draft still helps (Grow and up). */}
        {!realSite && !free && faqSection}
      </section>
    </>
  );
}
