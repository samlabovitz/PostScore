"use client";

// The Website page's ONE PostStudio card, right after the starter website
// generator (Free, Grow, and Premium without the add-on): what PostStudio
// adds, four wireframe page outlines with the business's own name (clearly
// outlines, not a fake site), a compact starter-vs-PostStudio comparison,
// the price on each plan and an honest "Coming soon". One button opens the
// full-screen PostStudio page. With PostStudio (Multi) it's just "Continue
// in PostStudio →", no upsell. "PostStudio" is never translated.

import Link from "next/link";
import { IconArrowRight, IconLayoutDashboard } from "@tabler/icons-react";
import { hasPostStudio, pageOutlines, studioHref } from "@/lib/postStudio";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import type { Plan } from "@/lib/plan";

const K = (key: string) => `dashboard.website.studioShowcase.${key}` as MessageKey;
const ROWS = [
  ["rowPages", "starterPages", "studioPages"],
  ["rowHosting", "starterHosting", "studioHosting"],
  ["rowUpdates", "starterUpdates", "studioUpdates"],
  ["rowChecks", "starterChecks", "studioChecks"],
] as const;

export function PostStudioShowcase({
  businessId,
  businessName,
  plan,
  profileId,
  storefront,
}: {
  businessId: string;
  businessName: string;
  plan: Plan;
  profileId: string;
  storefront: boolean;
}) {
  const locale = useLocale();
  const href = studioHref(businessId, `/business/${businessId}/website`);

  if (hasPostStudio(plan))
    return (
      <section data-testid="poststudio-showcase" data-mode="continue" className="flex flex-col gap-3 rounded-2xl border border-paper-deep bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
            <IconLayoutDashboard size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, K("continueTitle"))}</h2>
            <p className="text-[13px] text-ink-soft">{t(locale, K("continueSub"))}</p>
          </div>
        </div>
        <Link href={href} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-ink/90">
          {t(locale, K("continueCta"))}
          <IconArrowRight size={15} aria-hidden />
        </Link>
      </section>
    );

  return (
    <section data-testid="poststudio-showcase" data-mode="showcase" className="flex flex-col gap-5 rounded-2xl border border-[color:color-mix(in_srgb,var(--color-brass)_40%,transparent)] bg-paper p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif text-xl font-semibold text-ink">{t(locale, K("title"))}</h2>
          <span className="rounded-full border border-paper-deep bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{t(locale, "dashboard.common.comingSoon")}</span>
        </div>
        <p className="max-w-2xl text-[14px] text-ink-soft">{t(locale, K("sub"))}</p>
      </div>

      {/* Wireframes, not a site: dashed outlines, their name, grey bars. */}
      <div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="poststudio-outlines">
          {pageOutlines(profileId, storefront).map((page) => (
            <li key={page.title} className="flex flex-col gap-1.5">
              <div aria-hidden className="flex aspect-[3/4] flex-col gap-1.5 rounded-lg border border-dashed border-ink-mute/60 bg-white p-2">
                <span className="truncate border-b border-dashed border-ink-mute/50 pb-1 text-[9.5px] font-semibold text-ink-soft">{businessName}</span>
                <span className="h-6 rounded bg-ink-mute/15" />
                <span className="h-1.5 w-4/5 rounded bg-ink-mute/25" />
                <span className="h-1.5 w-3/5 rounded bg-ink-mute/25" />
                <span className="mt-auto h-1.5 w-2/3 rounded bg-ink-mute/20" />
              </div>
              <span className="text-center text-[12px] font-semibold text-ink">{t(locale, page.title)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11.5px] text-ink-mute">{t(locale, K("outlineNote"))}</p>
      </div>

      <table className="w-full table-fixed border-collapse text-left text-[12.5px]" data-testid="poststudio-compare">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.06em] text-ink-mute">
            <th className="w-[34%] pb-1.5 font-medium" />
            <th className="pb-1.5 font-medium">{t(locale, "dashboard.postStudio.colStarter")}</th>
            <th className="pb-1.5 font-semibold text-ink">PostStudio</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([row, starter, studio]) => (
            <tr key={row} className="border-t border-paper-line align-top">
              <th scope="row" className="py-1.5 pr-2 font-medium text-ink-soft">{t(locale, K(row))}</th>
              <td className="py-1.5 pr-2 text-ink-soft">{t(locale, K(starter))}</td>
              <td className="py-1.5 font-semibold text-ink">{t(locale, K(studio))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col gap-3 border-t border-paper-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] font-semibold text-ink" data-testid="poststudio-price">
          {t(locale, K("price"))}
        </p>
        <Link href={href} data-testid="poststudio-cta" className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-ink/90">
          {t(locale, K("cta"))}
          <IconArrowRight size={15} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
