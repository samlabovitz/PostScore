import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getWebsitePageData } from "@/app/actions/website";
import { resolveBizProfile, renderFaq } from "@/config/bizProfiles";
import { WebsiteGeneratorSection } from "./WebsiteGeneratorSection";
import { WebsiteVisualAnalysis } from "./WebsiteVisualAnalysis";
import { WebsiteScoreBreakdown } from "./WebsiteScoreBreakdown";
import { normalizeLocale, t } from "@/lib/i18n";

export default async function WebsitePage({ params }: { params: { id: string } }) {
  const result = await getWebsitePageData(params.id);

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
  const profileEn = resolveBizProfile(data.category, data.primaryType, data.businessTypeOverride, "en");
  const profileEs = resolveBizProfile(data.category, data.primaryType, data.businessTypeOverride, "es");
  const faqEn = renderFaq(profileEn.faq, { name: data.businessName, address: data.address });
  const faqEs = renderFaq(profileEs.faq, { name: data.businessName, address: data.address });
  const hasWebsite = !!data.website && data.website.trim().length > 0;
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
      rating={data.rating}
      reviewCount={data.reviewCount}
      googleMapsUri={data.googleMapsUri}
      profileId={profileEn.id}
      builderOfferReason={builderOffer.reason}
      hasWebsite={hasWebsite}
      faqEn={faqEn}
      faqEs={faqEs}
    />
  );

  const visualAnalysis = hasWebsite ? (
    <WebsiteVisualAnalysis businessId={params.id} websiteAnalysis={data.websiteAnalysis} />
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
      websiteAnalysis={data.websiteAnalysis}
      websiteSuggestions={data.websiteSuggestions}
    />
  ) : null;

  return (
    <DashboardShell
      business={{
        id: params.id,
        name: data.businessName,
        address: data.address,
        category: data.category,
        primary_type: data.primaryType,
        language: data.language,
      }}
    >
      <div className="flex flex-col gap-8 nav:gap-10">
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

        {hasWebsite ? (
          <>
            {visualAnalysis}
            {scoreBreakdown}
          </>
        ) : null}
        {generatorSection}
      </div>
    </DashboardShell>
  );
}
