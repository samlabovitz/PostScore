"use client";

import type { OwnerHours } from "@/lib/ownerHours";
import type { StarterSiteDetails } from "@/lib/starterSiteDetails";
import type { ReactNode } from "react";
import Link from "next/link";
import { googleListingHref } from "@/lib/routes";
import { StarterSiteBuilder } from "./StarterSiteBuilder";
import type { OpeningHoursPeriod } from "@/lib/google/places";
import { t, useLocale } from "@/lib/i18n";
import { studioHref } from "@/lib/postStudio";
import type { Plan } from "@/lib/plan";
import type { StarterComparison } from "@/lib/starterComparison";

/**
 * The Website page's two parts, on every plan, one short heading each:
 * A) "Fix your website" (a real site only): `pathA` — "1 check left · How to
 *    fix each check ↑" and Re-check (Free: locked).
 * B) "One-page starter site": what it would score next to the current site
 *    (both from the real website scoring, lib/starterComparison.ts), and the
 *    generator, always open — first on the page when there's no real site.
 *    Then one line: "Want a full website? PostStudio is coming soon."
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
  listingWebsite = null,
  profileId,
  builderOfferReason,
  comparison = null,
  notOnListing = false,
  free = false,
  realSite,
  socialPlatform = null,
  pathA = null,
}: {
  /** Kept for the page's call; the section no longer varies by plan beyond `free`. */
  plan: Plan;
  /** A real website (not none, not a social page): path A shows. */
  realSite: boolean;
  /** The social page standing in for a website ("Facebook"), if any. */
  socialPlatform?: string | null;
  /** The detected site builder's name (unused since the intro line was removed). */
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
  /** The Google listing's website field (pre-fills the site's button). */
  listingWebsite?: string | null;
  profileId: string;
  builderOfferReason: "no_website" | "underperforming" | "backup";
  /** The current site's Website points next to the starter's (null: can't be compared honestly yet). */
  comparison?: StarterComparison | null;
  /** The site isn't linked on the Google listing (read live): say so, with the way to add it. */
  notOnListing?: boolean;
}) {
  const locale = useLocale();
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
      listingWebsite={listingWebsite}
      profileId={profileId}
      builderOfferReason={builderOfferReason}
      free={free}
      postStudioHref={free ? studioHref(businessId, `/business/${businessId}/website`) : null}
      compactHeader
    />
  );

  const W = (k: string) => `dashboard.website.v2.${k}` as Parameters<typeof t>[1];
  const heading = (key: string) => <h2 className="font-serif text-xl font-semibold text-ink">{t(locale, W(key))}</h2>;

  return (
    <>
      {/* A) Fix the current site — only for a real one, and only with something to show (Free's locked how-to). */}
      {realSite && pathA && (
        <section data-testid="path-fix" className="flex flex-col gap-3">
          {heading("fixTitle")}
          {pathA}
        </section>
      )}
      {/* B) The one-page starter site: always open; first when there's no real site. */}
      <section data-testid="path-fresh" className={realSite ? "flex flex-col gap-4 border-t border-paper-deep pt-8 nav:pt-10" : "flex flex-col gap-4"}>
        {heading("starterTitle")}
        {socialPlatform && <p className="text-sm text-ink-soft">{t(locale, "dashboard.free.web.pathBSocial", { platform: socialPlatform })}</p>}
        {notOnListing && (
          <p className="text-[13.5px] text-ink" data-testid="not-on-listing">
            {t(locale, W("notOnListing"))}{" "}
            <Link href={googleListingHref(businessId, { hash: "listing-website" })} className="font-semibold underline decoration-brass underline-offset-2">
              {t(locale, W("addIt"))}
            </Link>
          </p>
        )}
        {comparison && <StarterCompare comparison={comparison} />}
        <p className="text-[13px] text-ink-mute" data-testid="starter-points-note">{t(locale, W("pointsNote"))}</p>
        <div id="starter-site" className="scroll-mt-20">
          {generator}
        </div>
        <p className="text-[13.5px] text-ink-soft" data-testid="poststudio-line">{t(locale, W("postStudio"))}</p>
      </section>
    </>
  );
}

/** "Your website scores 28 / 30. A PostScore starter site would score 30 / 30." — both from the real scoring. */
export function StarterCompare({ comparison: c }: { comparison: StarterComparison }) {
  const locale = useLocale();
  const W = (k: string) => `dashboard.website.v2.${k}` as Parameters<typeof t>[1];
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-paper-deep bg-white px-4 py-3 text-[14px] text-ink sm:flex-row sm:items-center sm:justify-between" data-testid="starter-compare" data-kind={c.kind}>
      <p className="min-w-0">
        {c.kind === "add" ? (
          t(locale, W(c.gain === 1 ? "compare.addOne" : "compare.add"), { gain: c.gain })
        ) : (
          <>
            {t(locale, W("compare.scores"), { current: c.current, starter: c.starter, of: c.of })}{" "}
            {c.kind === "keep" && <span className="text-ink-soft">{t(locale, W(c.starter === c.current ? "compare.keepEqual" : "compare.keep"))}</span>}
          </>
        )}
      </p>
      {c.kind === "recommended" && (
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-brass bg-[color:color-mix(in_srgb,var(--color-brass)_12%,white)] px-2 py-0.5 text-[12px] font-semibold text-brass" data-testid="starter-recommended">
            {t(locale, W("compare.recommended"))}
          </span>
          <a href="#starter-site" className="inline-flex items-center rounded-lg bg-brass px-3.5 py-2 text-[13.5px] font-semibold text-ink hover:bg-[color:color-mix(in_srgb,var(--color-brass)_85%,white)]">
            {t(locale, W("compare.build"))}
          </a>
        </div>
      )}
    </div>
  );
}
