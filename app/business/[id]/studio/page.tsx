import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { IconCircle, IconCircleCheckFilled } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/preview/PreviewParts";
import { LeavePostStudio } from "@/components/studio/LeavePostStudio";
import { getWebsitePageData } from "@/app/actions/website";
import { resolveBizProfile } from "@/config/bizProfiles";
import { cityFromAddress } from "@/lib/starterSite";
import { getPlan } from "@/lib/premium";
import { postStudioPriceKey } from "@/lib/navPlans";
import { hasPostStudio, leaveHref, pageOutlines, siteChecklist } from "@/lib/postStudio";
import { LocaleProvider, normalizeLocale, t, type MessageKey } from "@/lib/i18n";

/**
 * PostStudio: a focused full-screen page (no sidebar) opened from the
 * Overview or the Website page. The studio itself isn't built: with
 * PostStudio in the plan (Multi, until the add-on can be bought) it shows
 * the site checklist, the four page outlines and "Building tools coming
 * soon"; without it, the same real-data checklist and outlines as an
 * honest info page with the price for their plan. Nothing here is a
 * fake site — the outlines are wireframes and say so.
 */
export default async function PostStudioPage({ params, searchParams = {} }: { params: { id: string }; searchParams?: { from?: string } }) {
  const result = await getWebsitePageData(params.id);
  if (result.status === "unauthenticated") redirect("/login");
  if (result.status === "not_found") notFound();

  const { data } = result;
  const locale = normalizeLocale(data.language);
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(locale, key, vars);
  const name = data.businessName ?? tr("dashboard.common.businessNameFallback");
  const profile = resolveBizProfile(data.category, data.primaryType, data.businessTypeOverride, locale, data.categories, data.businessName);
  const plan = await getPlan();
  const included = hasPostStudio(plan);
  const checklist = siteChecklist({
    businessName: data.businessName,
    category: data.category,
    phone: data.phone,
    address: data.address,
    storefront: data.storefront,
    city: cityFromAddress(data.address, !data.storefront) ?? cityFromAddress(data.address),
    hasHours: !!data.starterSiteHours || !!data.openingHours?.length,
    rating: data.rating,
    verifiedSocialCount: data.verifiedSocialLinks.length,
    profileId: profile.id,
  });
  const outlines = pageOutlines(profile.id, data.storefront);
  const compare: Array<[MessageKey, MessageKey, MessageKey]> = [
    ["dashboard.postStudio.rowPages", "dashboard.postStudio.starterPages", "dashboard.postStudio.studioPages"],
    ["dashboard.postStudio.rowHosting", "dashboard.postStudio.starterHosting", "dashboard.postStudio.studioHosting"],
    ["dashboard.postStudio.rowUpdates", "dashboard.postStudio.starterUpdates", "dashboard.postStudio.studioUpdates"],
    ["dashboard.postStudio.rowChecks", "dashboard.postStudio.starterChecks", "dashboard.postStudio.studioChecks"],
  ];

  return (
    <LocaleProvider locale={locale} timeZone={data.timeZone}>
      <div className="min-h-screen bg-paper">
        <header className="sticky top-0 z-20 bg-ink">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-baseline gap-2.5">
              <span className="font-serif text-[18px] font-semibold text-white">PostStudio</span>
              <span className="truncate text-[13px] text-[#9FB0C7]">{name}</span>
            </div>
            <LeavePostStudio href={leaveHref(params.id, searchParams.from)} label={tr("dashboard.postStudio.leave")} confirmText={tr("dashboard.postStudio.leaveConfirm")} />
          </div>
        </header>

        <main className="mx-auto flex max-w-5xl flex-col gap-7 px-4 py-6 nav:gap-9 nav:py-10">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[30px]">{tr("dashboard.postStudio.heroTitle")}</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">{tr("dashboard.postStudio.heroBody")}</p>
          </div>

          {included ? (
            <Card className="flex flex-col gap-1 border-brass/40 bg-brass/5 p-4" data-testid="studio-included">
              <p className="text-sm font-semibold text-ink">{tr("dashboard.postStudio.buildingSoon")}</p>
              <p className="text-[13px] text-ink-soft">{tr("dashboard.postStudio.buildingSoonBody")}</p>
            </Card>
          ) : (
            <Card className="flex flex-col gap-1 border-brass/40 bg-brass/5 p-4">
              <p className="text-sm font-semibold text-ink" data-testid="studio-price">{tr(postStudioPriceKey(plan))}</p>
              <p className="text-[13px] text-ink-soft">{tr("dashboard.postStudio.notOpenYet")}</p>
            </Card>
          )}

          <section>
            <SectionTitle>{tr("dashboard.postStudio.checklistHeading")}</SectionTitle>
            <Card className="p-5">
              <ul className="flex flex-col divide-y divide-paper-line" data-testid="site-checklist">
                {checklist.map((item) => (
                  <li key={item.key} data-ready={item.ready ? "true" : "false"} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    {item.ready ? (
                      <IconCircleCheckFilled size={18} className="mt-0.5 shrink-0 text-green" aria-hidden />
                    ) : (
                      <IconCircle size={18} className="mt-0.5 shrink-0 text-ink-mute" aria-hidden />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <span className="text-sm font-medium text-ink">{tr(item.key)}</span>
                      <span className={item.ready ? "text-[12.5px] font-semibold text-ink-soft" : "text-[12.5px] text-ink-mute"}>
                        {item.ready ? tr("dashboard.postStudio.ready") : tr("dashboard.postStudio.youllAdd")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section>
            <SectionTitle>{tr("dashboard.postStudio.pagesHeading")}</SectionTitle>
            <p className="mb-3 text-[12.5px] text-ink-mute">{tr("dashboard.postStudio.outlineNote")}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="page-outlines">
              {outlines.map((page) => (
                <div key={page.title} className="rounded-xl border border-dashed border-ink-mute/50 bg-white p-4" aria-label={tr(page.title)}>
                  <div className="mb-3 flex items-center gap-2">
                    <span aria-hidden className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-paper-deep" />
                      <span className="h-2 w-2 rounded-full bg-paper-deep" />
                      <span className="h-2 w-2 rounded-full bg-paper-deep" />
                    </span>
                    <span className="text-[13px] font-semibold text-ink">{tr(page.title)}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {page.blocks.map((block) => (
                      <div key={block} className="rounded-md border border-paper-deep bg-paper px-3 py-2.5 text-[12px] text-ink-soft">
                        {tr(block)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {!included && (
            <>
              <section>
                <SectionTitle>{tr("dashboard.postStudio.compareHeading")}</SectionTitle>
                <Card className="overflow-hidden p-0">
                  <div className="hidden grid-cols-[1fr_1.2fr_1.2fr] gap-4 border-b border-paper-line bg-paper px-5 py-2.5 text-[12px] font-semibold text-ink-soft sm:grid">
                    <span />
                    <span>{tr("dashboard.postStudio.colStarter")}</span>
                    <span>PostStudio</span>
                  </div>
                  <dl className="flex flex-col divide-y divide-paper-line" data-testid="studio-compare">
                    {compare.map(([row, starter, studio]) => (
                      <div key={row} className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[1fr_1.2fr_1.2fr] sm:gap-4">
                        <dt className="text-[13px] font-semibold text-ink">{tr(row)}</dt>
                        <dd className="text-[13px] text-ink-soft">
                          <span className="font-semibold sm:hidden">{tr("dashboard.postStudio.colStarter")}: </span>
                          {tr(starter)}
                        </dd>
                        <dd className="text-[13px] text-ink">
                          <span className="font-semibold sm:hidden">PostStudio: </span>
                          {tr(studio)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              </section>
              <Link
                href={`/business/${params.id}/website#starter-site`}
                className="w-fit text-sm font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink"
              >
                {tr("dashboard.postStudio.starterNow")}
              </Link>
            </>
          )}
        </main>
      </div>
    </LocaleProvider>
  );
}
