import { notFound, redirect } from "next/navigation";
import { StaleScanNotice } from "@/components/scoring/StaleScanNotice";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getWebsitePageData } from "@/app/actions/website";
import { resolveBizProfile, renderFaq } from "@/config/bizProfiles";
import { WebsiteGeneratorSection } from "./WebsiteGeneratorSection";
import { WebsiteVisualAnalysis } from "./WebsiteVisualAnalysis";
import { WebsiteScoreBreakdown } from "./WebsiteScoreBreakdown";
import { getLastScanAt } from "@/app/actions/scoring";
import { getWebsiteRecheckStatus } from "@/app/actions/websiteRecheck";
import { WebsiteRecheck } from "@/components/scoring/WebsiteRecheck";
import { formatShortDate, normalizeLocale, t } from "@/lib/i18n";
import { HackedSiteBanner } from "@/components/scoring/HackedSiteBanner";
import { hackSignsFor } from "@/lib/siteSecurity";

export default async function WebsitePage({ params }: { params: { id: string } }) {
  const [result, lastScanAt, recheck] = await Promise.all([getWebsitePageData(params.id), getLastScanAt(params.id), getWebsiteRecheckStatus(params.id)]);

  if (result.status === "unauthenticated") {
    redirect("/login");
  }
  if (result.status === "not_found") {
    notFound();
  }

  const { data, builderOffer } = result;
  const locale = normalizeLocale(data.language);
  // The generator's own "Site language" selector (StarterSiteBuilder)
  // defaults to this same locale but the owner can switch it — so the
  // profile/FAQ are resolved once per language here, and the client
  // side (WebsiteGeneratorSection) picks between them at render time.
  const profileEn = resolveBizProfile(
    data.category,
    data.primaryType,
    data.businessTypeOverride,
    "en",
    data.categories,
    data.businessName
  );
  const profileEs = resolveBizProfile(
    data.category,
    data.primaryType,
    data.businessTypeOverride,
    "es",
    data.categories,
    data.businessName
  );
  const faqEn = renderFaq(profileEn.faq, { name: data.businessName, address: data.address });
  const faqEs = renderFaq(profileEs.faq, { name: data.businessName, address: data.address });
  const hasWebsite = (!!data.website && data.website.trim().length > 0) || !!data.verifiedWebsiteUrl;
  const businessName = data.businessName ?? t(locale, "dashboard.website.businessNameFallback");

  const generatorSection = (
    <WebsiteGeneratorSection
      businessId={params.id}
      businessName={businessName}
      businessLanguage={data.language}
      category={data.category}
      phone={data.phone}
      address={data.address}
      openingHours={data.openingHours}
      openingHoursPeriods={data.openingHoursPeriods}
      starterSiteHours={data.starterSiteHours}
      starterSiteHoursEnabled={data.starterSiteHoursEnabled}
      timeZone={data.timeZone}
      rating={data.rating}
      reviewCount={data.reviewCount}
      googleMapsUri={data.googleMapsUri}
      priceLevel={data.priceLevel}
      socialLinks={data.verifiedSocialLinks}
      year={new Date().getFullYear()}
      ratingAsOf={lastScanAt}
      profileId={profileEn.id}
      builderOfferReason={builderOffer.reason}
      hasWebsite={hasWebsite}
      faqEn={faqEn}
      faqEs={faqEs}
    />
  );

  const visualAnalysis = hasWebsite ? (
    <WebsiteVisualAnalysis
      businessId={params.id}
      websiteAnalysis={data.websiteAnalysis}
      siteUrl={data.website ?? data.verifiedWebsiteUrl}
    />
  ) : null;

  // The one merged "how is your Website score built" section — reads the
  // exact same live CategoryResult the overview page's own "Detailed
  // checks" section is built from, never a separate copy or
  // re-derivation, so a check that's excluded here (e.g. PageSpeed
  // couldn't score, a client-rendered site we couldn't fully read) shows
  // the identical honest "couldn't verify" state as everywhere else,
  // never a 0.
  const scoreBreakdown = hasWebsite ? (
    <WebsiteScoreBreakdown
      websiteCategory={data.websiteCategory}
      scoreBasis={data.scoreBasis}
      websiteAnalysis={data.websiteAnalysis}
      websiteSuggestions={data.websiteSuggestions}
      siteUrl={data.website ?? data.verifiedWebsiteUrl}
      businessName={data.businessName}
    />
  ) : null;

  const showHackedBanner =
    hasWebsite &&
    hackSignsFor(
      data.websiteCategory?.checks.find((c) => c.id === "website.security"),
      data.websiteAnalysis
    ).length > 0;

  return (
    <DashboardShell
      business={{
        id: params.id,
        name: data.businessName,
        address: data.address,
        category: data.category,
        primary_type: data.primaryType,
        language: data.language,
        time_zone: data.timeZone,
      }}
    >
      <div className="flex flex-col gap-8 nav:gap-10">
        {showHackedBanner && <HackedSiteBanner href="#check-security" />}
        {/* Website-only businesses have no Google scans — no strip. */}
        {lastScanAt && <StaleScanNotice businessId={params.id} lastScanAt={lastScanAt} now={new Date().toISOString()} />}
        <div>
          <Link
            href={`/business/${params.id}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
          >
            <IconArrowLeft size={15} />
            {t(locale, "dashboard.website.backTo", {
              name: data.businessName ?? t(locale, "dashboard.website.businessFallback"),
            })}
          </Link>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
            {t(locale, "dashboard.website.pageTitle")}
          </h1>
        </div>

        {data.googleListingMissingWebsiteSince && (
          <div className="rounded-lg border border-amber/30 bg-amber/5 px-4 py-3 text-[13px] text-ink-soft">
            {t(locale, "dashboard.website.googleListingMissingWebsite")}
          </div>
        )}

        {data.googleListingWebsiteRemovedSince && (
          <div className="rounded-lg border border-red/30 bg-red/5 px-4 py-3 text-[13px] text-ink-soft">
            {data.googleListingLastKnownWebsiteAt
              ? t(locale, "dashboard.website.googleListingWebsiteRemoved", {
                  date: formatShortDate(data.googleListingLastKnownWebsiteAt, locale, data.timeZone),
                })
              : t(locale, "dashboard.website.googleListingWebsiteRemovedUnknownDate")}
          </div>
        )}

        {hasWebsite ? (
          <>
            {/* Website-only businesses keep their own re-check (Overview). */}
            {recheck.status === "ok" && <WebsiteRecheck businessId={params.id} initialLeft={recheck.availability.left} hasWebsite={recheck.hasWebsite} />}
            {visualAnalysis}
            {scoreBreakdown}
          </>
        ) : null}
        <div id="starter-site" className="scroll-mt-20">
          {generatorSection}
        </div>
      </div>
    </DashboardShell>
  );
}
