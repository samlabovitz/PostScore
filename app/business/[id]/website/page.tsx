import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { StaleScanNotice } from "@/components/scoring/StaleScanNotice";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { LockedPreview } from "@/components/plan/LockedPreview";
import { getWebsitePageData } from "@/app/actions/website";
import { resolveBizProfile, renderFaq } from "@/config/bizProfiles";
import { WebsiteGeneratorSection } from "./WebsiteGeneratorSection";
import { WebsiteVisualAnalysis } from "./WebsiteVisualAnalysis";
import { WebsiteScoreBreakdown, WebsiteScoreCompact } from "./WebsiteScoreBreakdown";
import { getLastScanAt } from "@/app/actions/scoring";
import { getWebsiteRecheckStatus } from "@/app/actions/websiteRecheck";
import { WebsiteRecheck } from "@/components/scoring/WebsiteRecheck";
import { formatShortDate, normalizeLocale, t } from "@/lib/i18n";
import { HackedSiteBanner } from "@/components/scoring/HackedSiteBanner";
import { hackSignsFor } from "@/lib/siteSecurity";
import { socialPagePlatform } from "@/lib/websiteTrust";
import { resolveWebsiteBuilder, WEBSITE_BUILDER_NAMES } from "@/lib/websiteBuilder";

export default async function WebsitePage({ params }: { params: { id: string } }) {
  const [result, lastScanAt, recheck, upgrade] = await Promise.all([
    getWebsitePageData(params.id),
    getLastScanAt(params.id),
    getWebsiteRecheckStatus(params.id),
    loadUpgradeContext(params.id, "website"),
  ]);

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
  // Free: the page is open — a compact score, the starter site and the
  // screenshot card — with the how-to, Re-check, FAQ and download locked.
  const free = upgrade.plan === "free";
  const businessName = data.businessName ?? t(locale, "dashboard.website.businessNameFallback");

  const generatorSection = (pathA: ReactNode) => (
    <WebsiteGeneratorSection
      realSite={realSite}
      socialPlatform={socialPlatform}
      builderName={builderName}
      pathA={pathA}
      businessId={params.id}
      businessName={businessName}
      businessLanguage={data.language}
      category={data.category}
      phone={data.phone}
      address={data.address}
      openingHoursPeriods={data.openingHoursPeriods}
      starterSiteHours={data.starterSiteHours}
      starterSiteHoursEnabled={data.starterSiteHoursEnabled}
      starterSiteDetails={data.starterSiteDetails}
      starterSiteDetailsEnabled={data.starterSiteDetailsEnabled}
      timeZone={data.timeZone}
      placeId={data.placeId}
      socialLinks={data.verifiedSocialLinks}
      year={new Date().getFullYear()}
      storefront={data.storefront}
      mapEmbed={process.env.GOOGLE_MAPS_EMBED_KEY && data.storefront && data.placeId ? { key: process.env.GOOGLE_MAPS_EMBED_KEY, placeId: data.placeId } : null}
      profileId={profileEn.id}
      builderOfferReason={builderOffer.reason}
      faqEn={faqEn}
      faqEs={faqEs}
      free={free}
      plan={upgrade.plan}
    />
  );

  const visualAnalysis = hasWebsite ? (
    <WebsiteVisualAnalysis
      businessId={params.id}
      websiteAnalysis={data.websiteAnalysis}
      siteUrl={data.website ?? data.verifiedWebsiteUrl}
      locked={free}
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

  // Website checks still losing points (known) — path A's progress and the
  // count on Free's locked guides.
  const checksLeft = (data.websiteCategory?.checks ?? []).filter(
    (c) => (c.confidence === "VERIFIED" || c.confidence === "LIKELY") && c.earnedPoints !== null && c.earnedPoints < c.maxPoints
  ).length;

  // Free's two paths: "fix it" only for a real site — not for none, and not
  // for a social page standing in for one (lib/websiteTrust.ts).
  const siteUrl = data.website ?? data.verifiedWebsiteUrl;
  const socialPlatform = hasWebsite ? socialPagePlatform(siteUrl) : null;
  const realSite = hasWebsite && socialPlatform === null;
  const builder = resolveWebsiteBuilder(data.websiteAnalysis?.builder, siteUrl);
  const builderName = builder?.id ? WEBSITE_BUILDER_NAMES[builder.id] : null;

  const showHackedBanner =
    hasWebsite &&
    hackSignsFor(
      data.websiteCategory?.checks.find((c) => c.id === "website.security"),
      data.websiteAnalysis
    ).length > 0;

  return (
    <DashboardShell
      upgrade={upgrade}
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

        {free ? (
          // Free: the screenshot → the compact score → A) fix the current site
          // (locked how-to, Re-check, FAQ) → B) start fresh (the starter site,
          // open, then PostStudio). No real site: only B.
          <>
            {visualAnalysis}
            {hasWebsite && <WebsiteScoreCompact websiteCategory={data.websiteCategory} />}
            {generatorSection(
              <>
                <LockedPreview
                  title={t(locale, "dashboard.free.web.fixGuidesTitle")}
                  summary={checksLeft > 0 ? t(locale, "dashboard.free.sumChecks", { count: checksLeft }) : null}
                  unlock={t(locale, "dashboard.upgrade.unlock.websiteFixes")}
                  rows={Math.min(Math.max(checksLeft, 2), 4)}
                />
                <LockedPreview compact feature="recheck" title={t(locale, "dashboard.websiteRecheck.button")} unlock={t(locale, "dashboard.free.web.recheckBody")} />
              </>
            )}
          </>
        ) : (
          // Grow, Premium and Multi: the screenshot → the score + full
          // breakdown (each check's step-by-step fix is in it) → A) fix the
          // current site: progress, the guides, Re-check (N of 3 left today),
          // FAQ → B) start fresh: the starter site (collapsed next to a real
          // site), then PostStudio. No real site: only B, generator open.
          <>
            {visualAnalysis}
            <div id="website-checks" className="scroll-mt-20">
              {scoreBreakdown}
            </div>
            {generatorSection(
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="checks-left">
                  <span className="text-[14px] font-semibold text-ink">
                    {checksLeft === 0
                      ? t(locale, "dashboard.free.web.checksLeftNone")
                      : checksLeft === 1
                        ? t(locale, "dashboard.free.web.checksLeftOne")
                        : t(locale, "dashboard.free.web.checksLeft", { count: checksLeft })}
                  </span>
                  {checksLeft > 0 && (
                    <a href="#website-checks" className="text-[13px] font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink">
                      {t(locale, "dashboard.free.web.guidesLink")} ↑
                    </a>
                  )}
                </div>
                {recheck.status === "ok" && <WebsiteRecheck businessId={params.id} initialLeft={recheck.availability.left} hasWebsite={recheck.hasWebsite} />}
              </>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
