import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { getWebsitePageData } from "@/app/actions/website";
import { bizProfile, renderFaq } from "@/config/bizProfiles";
import { StarterSiteBuilder } from "./StarterSiteBuilder";

export default async function WebsitePage({ params }: { params: { id: string } }) {
  const result = await getWebsitePageData(params.id);

  if (result.status === "unauthenticated") {
    redirect("/login");
  }
  if (result.status === "not_found") {
    notFound();
  }

  const { data } = result;
  const profile = bizProfile(data.category, data.primaryType);
  const faq = renderFaq(profile.faq, { name: data.businessName, address: data.address });
  const hasWebsite = !!data.website && data.website.trim().length > 0;

  const generator = (
    <StarterSiteBuilder
      businessId={params.id}
      businessName={data.businessName ?? "Your business"}
      category={data.category}
      phone={data.phone}
      address={data.address}
      openingHours={data.openingHours}
      rating={data.rating}
      reviewCount={data.reviewCount}
      googleMapsUri={data.googleMapsUri}
      profileId={profile.id}
      hasWebsite={hasWebsite}
    />
  );

  const faqSection = (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        FAQ draft
      </div>
      <p className="mb-3 text-sm text-ink-soft">
        A starter FAQ for your website, based on what customers of this kind of business typically
        ask — publishing tools are still coming together, but you&apos;re welcome to copy this in
        today.
      </p>
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
      }}
    >
      <div className="flex flex-col gap-8 nav:gap-10">
        <div>
          <Link
            href={`/business/${params.id}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
          >
            <IconArrowLeft size={15} />
            Back to {data.businessName ?? "business"}
          </Link>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">Website</h1>
        </div>

        {hasWebsite ? (
          <>
            {faqSection}
            {generator}
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
