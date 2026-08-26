import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconCircleCheck } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getBusinessSummary } from "@/app/actions/businesses";
import { bizProfile } from "@/config/bizProfiles";

export default async function GrowthPage({ params }: { params: { id: string } }) {
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
            Growth
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Concrete next steps for a {profile.label.toLowerCase()} business — tracking and
            scheduling these is still coming together, but the ideas below are real and specific to
            how you operate.
          </p>
        </div>

        <SectionHeading title="What to do next" />
        <Card className="p-5">
          <div className="flex flex-col divide-y divide-paper-line">
            {profile.growActions.map((action) => (
              <div key={action} className="flex items-start gap-2.5 py-3 first:pt-0 last:pb-0">
                <IconCircleCheck size={17} className="mt-0.5 shrink-0 text-brass" />
                <span className="text-sm text-ink">{action}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
