import { createAdminClient } from "@/lib/supabase/admin";
import { viewLocale } from "@/lib/viewLocale.server";
import { withSignedScreenshots } from "@/lib/screenshotStorage.server";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { StaleScanNotice } from "@/components/scoring/StaleScanNotice";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { LockedPreview } from "@/components/plan/LockedPreview";
import { getWebsitePageData } from "@/app/actions/website";
import { resolveBizProfile } from "@/config/bizProfiles";
import { starterComparison } from "@/lib/starterComparison";
import { WebsiteGeneratorSection } from "./WebsiteGeneratorSection";
import { WebsiteVisualAnalysis } from "./WebsiteVisualAnalysis";
import { WebsiteScoreBreakdown, WebsiteScoreCompact } from "./WebsiteScoreBreakdown";
import { getLastScanAt } from "@/app/actions/scoring";
import { getWebsiteRecheckStatus } from "@/app/actions/websiteRecheck";
import { WebsiteRecheck } from "@/components/scoring/WebsiteRecheck";
import { formatShortDate, t, tPlural } from "@/lib/i18n";
import { fixPlanPageHref, NEW_PAGES_LIVE } from "@/lib/routes";
import { canOpenNewGooglePages } from "@/lib/googlePages.server";
import { loadWebsiteFixLine } from "@/lib/fixPlan.server";
import { websiteFixWords } from "@/lib/fixPlan";
import { HackedSiteBanner } from "@/components/scoring/HackedSiteBanner";
import { hackSignsFor } from "@/lib/siteSecurity";
import { socialPagePlatform } from "@/lib/websiteTrust";
import { PlatformLinkCard } from "@/components/gbp/PlatformLinkCard";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { isPremiumPlan } from "@/lib/plan";
import { resolveWebsiteBuilder, WEBSITE_BUILDER_NAMES } from "@/lib/websiteBuilder";
import { ScanningLine } from "@/components/website/ScanningLine";
import { BrokenListingCard } from "@/components/website/BrokenListingCard";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { googleWritesPageState } from "@/app/actions/gbpWebsiteLink";
import { getWebsiteLinkUndoForPage } from "@/app/actions/gbpWebsiteLink";

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
  const locale = viewLocale(data.language);
  // The starter site's business profile (its look and sections).
  const profileEn = resolveBizProfile(
    data.category,
    data.primaryType,
    data.businessTypeOverride,
    "en",
    data.categories,
    data.businessName,
    data.bizTypeResolved
  );

  // The site PostScore grades (owner-confirmed, verified, or the listing's link).
  const hasWebsite = data.gradedSite !== null;
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
      phone={data.ownerPhone ?? data.phone}
      address={data.address}
      listingWebsite={data.website}
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
      notOnListing={data.notOnListing === true}
      comparison={starterComparison({ hasWebsite: realSite, current: data.categoryPoints ?? null, starter: builderOffer.templatePoints })}
      free={free}
      plan={upgrade.plan}
    />
  );

  // Website checks still losing points (known) — path A's progress and the
  // count on Free's locked guides.
  const checksLeft = (data.websiteCategory?.checks ?? []).filter(
    (c) => (c.confidence === "VERIFIED" || c.confidence === "LIKELY") && c.earnedPoints !== null && c.earnedPoints < c.maxPoints
  ).length;

  // Screenshots live in a private bucket: signed for this owner, for an hour.
  const signedAnalysis = hasWebsite ? await withSignedScreenshots(createAdminClient(), data.websiteAnalysis ?? null) : null;
  const visualAnalysis = hasWebsite ? (
    <WebsiteVisualAnalysis
      businessId={params.id}
      websiteAnalysis={signedAnalysis}
      siteUrl={data.gradedSite?.url ?? null}
      site={data.gradedSite}
      locked={free}
      recheck={
        free ? (
          <LockedPreview compact feature="recheck" title={t(locale, "dashboard.websiteRecheck.button")} unlock={t(locale, "dashboard.free.web.recheckBody")} />
        ) : recheck.status === "ok" ? (
          <WebsiteRecheck businessId={params.id} initialLeft={recheck.availability.left} hasWebsite={recheck.hasWebsite} compact top />
        ) : null
      }
    />
  ) : null;

  // The one merged "how is your Website score built" section — reads the
  // exact same live CategoryResult the overview page's own "Detailed
  // checks" section is built from, never a separate copy or
  // re-derivation, so a check that's excluded here (e.g. PageSpeed
  // couldn't score, a client-rendered site we couldn't fully read) shows
  // the identical honest "couldn't verify" state as everywhere else,
  // never a 0.
  // The hours as Overview and Fix plan show them (the live compare; waiting on Google is never the website's to fix).
  const hoursCheck = hasWebsite ? await websiteHoursCheck(params.id, data.websiteCategory) : null;
  const scoreBreakdown = hasWebsite ? (
    <WebsiteScoreBreakdown
      hoursCheck={hoursCheck}
      websiteCategory={data.websiteCategory}
      scoreBasis={data.scoreBasis}
      websiteAnalysis={data.websiteAnalysis}
      websiteSuggestions={data.websiteSuggestions}
      siteUrl={data.gradedSite?.url ?? null}
      businessName={data.businessName}
      points={data.categoryPoints ?? null}
      belowScore={
        <p className="flex flex-wrap items-center gap-x-1.5 text-[13.5px]" data-testid="checks-left">
          <span className="font-semibold text-ink">
            {checksLeft === 0 ? t(locale, "dashboard.free.web.checksLeftNone") : checksLeft === 1 ? t(locale, "dashboard.free.web.checksLeftOne") : t(locale, "dashboard.free.web.checksLeft", { count: checksLeft })}
          </span>
          {checksLeft > 0 && !free && (
            <>
              <span className="text-ink-mute">·</span>
              <a href="#website-checks-list" className="font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink">
                {t(locale, "dashboard.free.web.guidesLink")} ↓
              </a>
            </>
          )}
        </p>
      }
    />
  ) : null;


  // Free's two paths: "fix it" only for a real site — not for none, and not
  // for a social page standing in for one (lib/websiteTrust.ts).
  const siteUrl = data.gradedSite?.url ?? null;
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

  const gbpStatus = await getGbpConnectionStatus(params.id);
  // Shown only where the new pages can be opened (NEW_PAGES_LIVE, or the dev test login).
  const fixLine = hasWebsite && (await canOpenNewGooglePages()) ? await loadWebsiteFixLine(params.id) : null;
  const gbpConnected = gbpStatus.status === "ok" && gbpStatus.connected;

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
        {/* The listing's website link goes to an ordering / booking / review / social page. */}
        <PlatformLinkCard businessId={params.id} website={data.website} premium={isPremiumPlan(upgrade.plan)} connected={gbpConnected} />
        {/* Website-only businesses have no Google scans — no strip. */}
        {lastScanAt && <StaleScanNotice businessId={params.id} lastScanAt={lastScanAt} now={new Date().toISOString()} />}
        <div>
          {/* New design: the sidebar handles navigation. */}
          {!NEW_PAGES_LIVE && (
            <Link
              href={`/business/${params.id}`}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
            >
              <IconArrowLeft size={15} />
              {t(locale, "dashboard.website.backTo", {
                name: data.businessName ?? t(locale, "dashboard.website.businessFallback"),
              })}
            </Link>
          )}
          <h1 className="mt-2 flex flex-wrap items-baseline gap-x-3 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
            {t(locale, "dashboard.website.pageTitle")}
            {/* The saved scan's whole points, as the Overview's breakdown shows them (lib/categoryPoints.ts). */}
            {data.categoryPoints && (
              <span className="font-sans text-[15px] font-semibold text-ink-soft" data-testid="website-pts">
                {t(locale, "dashboard.googlePages.listing.pts", { earned: data.categoryPoints.earned, of: data.categoryPoints.of })}
                {data.categoryPoints.speedPending && <span className="font-normal text-ink-mute"> {t(locale, "dashboard.website.speedNotScored")}</span>}
              </span>
            )}
          </h1>
          {/* The one site PostScore grades, screenshots and shows — and "Wrong site?". */}
          <div className="mt-2">
            <ScanningLine businessId={params.id} site={data.gradedSite} />
          </div>
          {/* Day 25B step 3: this page's fixes in one line, to Fix plan (with the new pages only). */}
          {fixLine && (
            <p className="mt-3 text-[13.5px] text-ink" data-testid="website-fix-line">
              {fixLine.summary && data.categoryPoints
                ? (() => {
                    // Whole points, like the title: "gets its last point", never "29.4 → 29.9".
                    const w = websiteFixWords(fixLine.summary, data.categoryPoints);
                    return w.kind === "last"
                      ? tPlural(locale, w.points === 1 ? "dashboard.fixPlan.websiteWhole.lastOne" : "dashboard.fixPlan.websiteWhole.last", w.count, { count: w.count, points: w.points, score: w.score, after: w.after })
                      : w.kind === "goes"
                        ? tPlural(locale, "dashboard.fixPlan.websiteWhole.goes", w.count, { count: w.count, from: w.from, to: w.to, of: w.of, score: w.score, after: w.after })
                        : tPlural(locale, "dashboard.fixPlan.websiteWhole.small", w.count, { count: w.count });
                  })()
                : t(locale, "dashboard.fixPlan.websiteSummary.none")}{" "}
              {fixLine.speedPending && <span className="text-ink-soft">{t(locale, "dashboard.fixPlan.websiteSummary.speed")} </span>}
              <Link href={fixPlanPageHref(params.id)} className="font-semibold underline decoration-brass underline-offset-2">
                {t(locale, "dashboard.fixPlan.link")}
              </Link>
            </p>
          )}
        </div>

        {/* The listing's own link is parked or broken: a warning, never its picture. */}
        {data.gradedSite?.listingBroken && data.website && (
          <GbpEditProvider value={{ premium: isPremiumPlan(upgrade.plan), connected: gbpConnected, undo: null, websiteUndo: await getWebsiteLinkUndoForPage(params.id), ...(await googleWritesPageState(params.id)) }}>
            <BrokenListingCard businessId={params.id} listingUrl={data.website} suggested={data.gradedSite.source !== "listing" ? data.gradedSite.url : null} />
          </GbpEditProvider>
        )}

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
            {/* No real website: the starter site is the main action, at the top. */}
            {!realSite && generatorSection(null)}
            {visualAnalysis}
            {hasWebsite && <WebsiteScoreCompact websiteCategory={data.websiteCategory} />}
            {realSite && generatorSection(
              <>
                <LockedPreview
                  title={t(locale, "dashboard.free.web.fixGuidesTitle")}
                  summary={checksLeft > 0 ? t(locale, "dashboard.free.sumChecks", { count: checksLeft }) : null}
                  unlock={t(locale, "dashboard.upgrade.unlock.websiteFixes")}
                  rows={Math.min(Math.max(checksLeft, 2), 4)}
                />
              </>
            )}
          </>
        ) : (
          // Grow, Premium and Multi: the screenshots (Refresh + Re-check, N of 2 left today, beside them) →
          // the score card (one number; "N checks left · How to fix each check" under it) and the checks →
          // the one-page starter site. No real site: the starter site first.
          <>
            {/* No real website: the starter site is the main action, at the top. */}
            {!realSite && generatorSection(null)}
            {visualAnalysis}
            <div id="website-checks" className="scroll-mt-20">
              {scoreBreakdown}
            </div>
            {/* Re-check sits by "Refresh screenshots"; "N checks left" under the score card: no separate box here. */}
            {realSite && generatorSection(null)}
          </>
        )}
      </div>
    </DashboardShell>
  );
}

/** The live hours compare for the Website page's "Matches your Google listing" row (request-cached scoring; no read
 * at all unless the scored check is losing points). */
async function websiteHoursCheck(businessId: string, category: { checks: Array<{ id: string; earnedPoints: number | null; maxPoints: number }> } | null | undefined) {
  const check = category?.checks.find((c) => c.id === "website.info_consistency");
  if (!check || check.earnedPoints === null || check.earnedPoints >= check.maxPoints) return null;
  const [{ scoreBusinessById }, { loadHoursCheck }] = await Promise.all([import("@/app/actions/scoring"), import("@/lib/hoursCheck.server")]);
  const scored = await scoreBusinessById(businessId).catch(() => null);
  if (!scored || scored.status !== "ok") return null;
  return loadHoursCheck(businessId, scored.scoringBusiness ?? scored.business, [{ checkId: "website.info_consistency", mismatchFields: ["hours"] }]).catch(() => null);
}
