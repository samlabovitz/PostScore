import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getBusinessSummary } from "@/app/actions/businesses";
import { bizProfile } from "@/config/bizProfiles";

export default async function PricingPage({ params }: { params: { id: string } }) {
  const summary = await getBusinessSummary(params.id);

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }
  if (summary.status === "not_found") {
    notFound();
  }

  const { business } = summary;
  const profile = bizProfile(business.category, business.primary_type);

  return (
    <DashboardShell business={business}>
      <div className="flex flex-col gap-6 nav:gap-8">
        <div>
          <Link
            href={`/business/${business.id}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
          >
            <IconArrowLeft size={15} />
            Back to {business.name ?? "business"}
          </Link>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
            Pricing
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Coupon and offer presets suited to a {profile.label.toLowerCase()} business — sending
            and full customization tools are still coming together, but these are real, tested
            structures to start from.
          </p>
        </div>

        <SectionHeading title="Coupon presets" />
        <Card className="p-5">
          <div className="flex flex-col divide-y divide-paper-line">
            {profile.couponPresets.map((preset) => (
              <div key={preset.id} className="py-3 first:pt-0 last:pb-0">
                <div className="text-sm font-semibold text-ink">{preset.label}</div>
                <p className="mt-0.5 text-[13px] text-ink-soft">{preset.description}</p>
              </div>
            ))}
          </div>
        </Card>

        <SectionHeading title="Offer templates" />
        <Card className="p-5">
          <div className="flex flex-col divide-y divide-paper-line">
            {profile.offerTemplates.map((offer) => (
              <div key={offer.id} className="py-3 first:pt-0 last:pb-0">
                <div className="text-sm font-semibold text-ink">{offer.label}</div>
                <p className="mt-0.5 text-[13px] text-ink-soft">{offer.description}</p>
              </div>
            ))}
          </div>
        </Card>

        {profile.referralOk && (
          <>
            <SectionHeading title="Referral program" />
            <Card className="p-5 text-sm text-ink-soft">
              A referral program is a good fit for this type of business — pair a coupon above with
              a reward for the friend who sends someone your way.
            </Card>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
