import { notFound, redirect } from "next/navigation";
import { IconCalendarEvent } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getPlan } from "@/lib/premium";
import { t } from "@/lib/i18n";
import { viewLocale } from "@/lib/viewLocale.server";
import { NEW_PAGES_LIVE, growthPlanHref } from "@/lib/routes";

/** Growth → Local events (Day 25B step 5): "Coming soon" + what it will do,
 * until Day 25D. Only on the new-design preview. Same on every plan. */
export default async function LocalEventsPage({ params }: { params: { id: string } }) {
  if (!NEW_PAGES_LIVE) redirect(growthPlanHref(params.id));
  const summary = await getBusinessSummary(params.id);
  if (summary.status === "unauthenticated") redirect("/login");
  if (summary.status === "not_found") notFound();
  const locale = viewLocale(summary.business.language);
  return (
    <DashboardShell business={summary.business} plan={await getPlan()}>
      <div className="flex flex-col gap-6" data-testid="local-events">
        <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">{t(locale, "dashboard.nav.localEvents")}</h1>
        <Card className="flex flex-col gap-2 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <IconCalendarEvent size={18} aria-hidden className="text-brass" />
            <span className="rounded-full border border-paper-deep bg-paper px-2.5 py-0.5 text-[11.5px] font-semibold text-ink-soft">{t(locale, "dashboard.common.comingSoon")}</span>
          </div>
          <p className="text-[14px] text-ink">{t(locale, "dashboard.localEvents.line1")}</p>
          <p className="text-[14px] text-ink-soft">{t(locale, "dashboard.localEvents.line2")}</p>
        </Card>
      </div>
    </DashboardShell>
  );
}
