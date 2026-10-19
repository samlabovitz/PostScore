import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { SearchDemandSection, type SearchDemandView } from "@/components/gbp/SearchDemandSection";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { canConnectGbp } from "@/lib/premium";
import { SEARCH_DEMAND_EXAMPLE } from "@/lib/gbp/searchDemand";
import { normalizeLocale, t } from "@/lib/i18n";

/**
 * Search demand (Premium). Until the Google connection launches
 * (canConnectGbp), everyone sees the locked preview: example data under
 * an "Example" watermark. A connected business sees an honest "waiting"
 * state — PostScore doesn't read Performance data yet, and nothing is
 * estimated in its place. See docs/search-demand.md.
 */
export default async function SearchDemandPage({ params }: { params: { id: string } }) {
  const [summary, gbp] = await Promise.all([getBusinessSummary(params.id), getGbpConnectionStatus(params.id)]);
  if (summary.status === "unauthenticated") redirect("/login");
  if (summary.status === "not_found") notFound();

  const { business } = summary;
  const locale = normalizeLocale(business.language);
  const connected = gbp.status === "ok" && gbp.connected;
  const view: SearchDemandView = canConnectGbp() && connected ? { kind: "awaiting" } : { kind: "preview", data: SEARCH_DEMAND_EXAMPLE };

  return (
    <DashboardShell business={business}>
      <div className="flex flex-col gap-6 nav:gap-8">
        <div>
          <Link href={`/business/${params.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink">
            <IconArrowLeft size={15} />
            {t(locale, "dashboard.common.backTo", { name: business.name ?? t(locale, "dashboard.common.businessFallback") })}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">{t(locale, "dashboard.searchDemand.pageTitle")}</h1>
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-paper">{t(locale, "dashboard.overview.connectPremiumPill")}</span>
          </div>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">{t(locale, "dashboard.searchDemand.pageSubtitle")}</p>
          {view.kind === "preview" && (
            <Link
              href={`/business/${params.id}/connect-gbp`}
              className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline"
            >
              {t(locale, "dashboard.searchDemand.connectLink")}
              <IconArrowRight size={13} aria-hidden />
            </Link>
          )}
        </div>
        <SearchDemandSection businessId={params.id} view={view} />
      </div>
    </DashboardShell>
  );
}
