import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getBusinessSummary } from "@/app/actions/businesses";
import { bizProfile, renderFaq } from "@/config/bizProfiles";

export default async function WebsiteReviewsPage({ params }: { params: { id: string } }) {
  const summary = await getBusinessSummary(params.id);

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }
  if (summary.status === "not_found") {
    notFound();
  }

  const { business } = summary;
  const profile = bizProfile(business.category, business.primary_type);
  const faq = renderFaq(profile.faq, business);

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
            Website & Reviews
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            A starter FAQ draft for your website, based on what customers of a{" "}
            {profile.label.toLowerCase()} business typically ask — publishing tools are still coming
            together, but you&apos;re welcome to copy this in today.
          </p>
        </div>

        <SectionHeading title="FAQ draft" />
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
    </DashboardShell>
  );
}
