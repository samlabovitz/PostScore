"use client";

// "More customers, whatever your score" — Reviews is the featured tile
// (the business's real review count, and the nearby average when a saved
// competitor scan has one), with the review link & QR sign as its button;
// the other growth tools sit beside it as smaller tiles. Every number is
// real; nothing here is score-dependent. Light theme, PostScore palette.

import Link from "next/link";
import { IconArrowRight, IconBuildingStore, IconStar } from "@tabler/icons-react";
import { buildGrowBannerTools, reviewToolHref, type ProfileTools } from "@/lib/growBannerTools";
import { formatCount, t, tPlural, useLocale, type Locale } from "@/lib/i18n";

/** The Reviews tile's one real stat line. Pure; exported for tests. */
export function reviewStatLine(reviewCount: number | null, nearbyAverage: number | null, locale: Locale): string {
  if (reviewCount === null || reviewCount === 0) return t(locale, "dashboard.overview.growBanner.reviews.none");
  const count = formatCount(reviewCount, locale);
  return nearbyAverage !== null
    ? tPlural(locale, "dashboard.overview.growBanner.reviews.vsNearby", reviewCount, { count, average: formatCount(nearbyAverage, locale) })
    : tPlural(locale, "dashboard.overview.growBanner.reviews.countOnly", reviewCount, { count });
}

export function GrowMoreCustomers({
  businessId,
  profileTools,
  reviewCount,
  nearbyReviewAverage,
}: {
  businessId: string;
  profileTools: ProfileTools;
  reviewCount: number | null;
  /** Mean review count of nearby competitors (saved scan), or null. */
  nearbyReviewAverage: number | null;
}) {
  const locale = useLocale();
  const tools = buildGrowBannerTools(businessId, profileTools);

  return (
    <section className="rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.overview.growBanner.heading")}</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Featured: Reviews. */}
        <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_30%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_6%,white)] p-4 sm:p-5">
          <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl ps-icon-tile">
            <IconStar size={20} />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-base font-semibold text-ink">{t(locale, "dashboard.overview.growBanner.reviews.title")}</h3>
            <p className="text-[13.5px] leading-snug text-ink-soft">{reviewStatLine(reviewCount, nearbyReviewAverage, locale)}</p>
          </div>
          <Link
            href={reviewToolHref(businessId)}
            className="mt-auto inline-flex w-fit max-w-full items-center rounded-lg bg-brass px-3.5 py-2 text-[13.5px] font-semibold text-ink transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-brass)_85%,white)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {t(locale, "dashboard.overview.growBanner.reviews.cta")}
          </Link>
        </div>

        {/* The other tools — equal-height tiles that line up with the
            bottom of the Reviews tile. */}
        <ul className="grid h-full min-w-0 auto-rows-fr grid-cols-1 gap-2.5 sm:grid-cols-2">
          {tools.map((tool) => (
            <li key={tool.labelKey} className="min-w-0">
              <Link
                href={tool.href}
                className="group flex h-full min-w-0 items-start gap-3 rounded-xl border border-paper-deep bg-white p-3 transition duration-200 hover:-translate-y-0.5 hover:border-[color:color-mix(in_srgb,var(--color-brass)_50%,white)] hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
                  <tool.icon size={17} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center justify-between gap-2 text-[13.5px] font-semibold text-ink">
                    <span className="min-w-0 break-words">{t(locale, tool.labelKey)}</span>
                    <IconArrowRight size={14} className="shrink-0 text-ink-mute transition-colors group-hover:text-brass" aria-hidden />
                  </span>
                  <span className="break-words text-[12.5px] leading-snug text-ink-soft">{t(locale, tool.descKey)}</span>
                </span>
              </Link>
            </li>
          ))}
          {/* Shop: announced, not live — no link, no arrow, until the
              storefront shop exists. */}
          <li className="min-w-0">
            <div className="flex h-full min-w-0 cursor-default items-start gap-3 rounded-xl border border-paper-deep bg-paper p-3">
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile opacity-70">
                <IconBuildingStore size={17} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] font-semibold text-ink-soft">
                  <span className="min-w-0 break-words">{t(locale, "dashboard.overview.growBanner.tools.shop.shortLabel")}</span>
                  <span className="rounded-full border border-paper-deep bg-white px-2 py-px text-[10.5px] font-semibold text-ink-soft">
                    {t(locale, "dashboard.overview.studio.comingSoon")}
                  </span>
                </span>
                <span className="break-words text-[12.5px] leading-snug text-ink-mute">{t(locale, "dashboard.overview.growBanner.tools.shop.desc")}</span>
              </span>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
