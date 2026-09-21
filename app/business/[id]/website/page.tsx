import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { getWebsitePageData } from "@/app/actions/website";
import { resolveBizProfile, renderFaq } from "@/config/bizProfiles";
import { StarterSiteBuilder } from "./StarterSiteBuilder";
import { WebsiteVisualAnalysis } from "./WebsiteVisualAnalysis";
import { WebsiteScoreBreakdown } from "./WebsiteScoreBreakdown";
import { CollapsibleGenerator } from "./CollapsibleGenerator";
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
  const profile = resolveBizProfile(data.category, data.primaryType, data.businessTypeOverride);
  const faq = renderFaq(profile.faq, { name: data.businessName, address: data.address });
  const hasWebsite = !!data.website && data.website.trim().length > 0;

  const generator = (
    <StarterSiteBuilder
      businessId={params.id}
      businessName={data.businessName ?? t(locale, "dashboard.website.businessNameFallback")}
      category={data.category}
      phone={data.phone}
      address={data.address}
      openingHours={data.openingHours}
      rating={data.rating}
      reviewCount={data.reviewCount}
      googleMapsUri={data.googleMapsUri}
      profileId={profile.id}
      builderOfferReason={builderOffer.reason}
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
            {faqSection}
            <CollapsibleGenerator defaultExpanded={false}>{generator}</CollapsibleGenerator>
          </>
        ) : (
          <>
            {generator}
            {faqSection}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
