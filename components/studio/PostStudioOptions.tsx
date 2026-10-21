"use client";

// The ways to get PostStudio, side by side (stacked on a phone):
// "PostStudio only" $30/mo · "Grow + PostStudio" $40/mo · "Premium +
// PostStudio" $58/mo (Best value), then "Included in Multi". The plan the
// owner is on is highlighted. Shared by the PostStudio box, Settings →
// Compare plans and the full-screen PostStudio page. PostStudioFeatures:
// what PostStudio includes — Website, Menu & catalog, Logo Studio. Coming soon: nothing
// here can be bought and nothing links to a checkout.

import { IconCheck, IconCrown, IconListDetails, IconPalette, IconWorldWww } from "@tabler/icons-react";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { POSTSTUDIO_PRICES, postStudioOptionFor } from "@/lib/postStudio";
import type { Plan } from "@/lib/plan";

const K = (key: string) => `dashboard.postStudioPlans.${key}` as MessageKey;
const PAID = ["solo", "grow", "premium"] as const;

export function PostStudioOptions({ plan, className }: { plan: Plan; className?: string }) {
  const locale = useLocale();
  const current = postStudioOptionFor(plan);
  return (
    <div className={cn("flex flex-col gap-2.5", className)} data-testid="poststudio-options">
      <div className="grid grid-cols-1 gap-3 pt-1.5 sm:grid-cols-3">
        {PAID.map((option) => {
          const price = POSTSTUDIO_PRICES[option];
          const highlighted = option === current;
          const best = option === "premium";
          return (
            <div
              key={option}
              data-testid="poststudio-option"
              data-option={option}
              data-highlighted={highlighted || undefined}
              className={cn(
                "relative flex flex-col gap-1 rounded-xl border p-3",
                highlighted ? "border-brass ring-2 ring-[color:color-mix(in_srgb,var(--color-brass)_35%,white)]" : "border-paper-deep",
                best ? "bg-[color:color-mix(in_srgb,var(--color-brass)_8%,white)]" : "bg-white"
              )}
            >
              {best && (
                <span className="absolute -top-2.5 right-3 inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-white">
                  <IconCrown size={11} aria-hidden className="text-brass" />
                  {t(locale, "dashboard.settings.plans.bestValue")}
                </span>
              )}
              <span className="text-[13.5px] font-semibold text-ink">{t(locale, K(`option.${option}.name`))}</span>
              <span className="text-[17px] font-semibold text-ink">{t(locale, K("perMonth"), { amount: price.total })}</span>
              <span className="text-[12px] leading-snug text-ink-soft">{t(locale, K(`option.${option}.note`), { addOn: price.addOn })}</span>
              {highlighted && <span className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-brass">{t(locale, K("yourPlan"))}</span>}
            </div>
          );
        })}
      </div>
      <p
        data-testid="poststudio-option"
        data-option="multi"
        data-highlighted={current === "multi" || undefined}
        className={cn("flex items-center gap-1.5 text-[12.5px] text-ink", current === "multi" && "font-semibold")}
      >
        <IconCheck size={14} aria-hidden className="shrink-0 text-green" />
        {t(locale, K("option.multi"))}
        {current === "multi" && <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-brass">· {t(locale, K("yourPlan"))}</span>}
      </p>
    </div>
  );
}

/** What PostStudio is, in 5 short lines (multi-page site, hosted, own
 * domain, auto-updates, built to pass every check). */
export const POSTSTUDIO_BULLETS: MessageKey[] = ["pages", "hosted", "domain", "updates", "checks"].map((id) => K(`bullet.${id}`));

export function PostStudioBullets({ className }: { className?: string }) {
  const locale = useLocale();
  return (
    <ul className={cn("flex flex-col gap-1", className)} data-testid="poststudio-bullets">
      {POSTSTUDIO_BULLETS.map((key) => (
        <li key={key} className="flex items-start gap-1.5 text-[12.5px] leading-snug text-ink">
          <IconCheck size={13} aria-hidden className="mt-0.5 shrink-0 text-green" />
          {t(locale, key)}
        </li>
      ))}
    </ul>
  );
}

/** Everything PostStudio includes, as three compact tiles (icon + title +
 * one line, each coming soon): Website, Menu & catalog, Logo Studio. */
const FEATURES = [
  { id: "website", Icon: IconWorldWww },
  { id: "menu", Icon: IconListDetails },
  { id: "logo", Icon: IconPalette },
] as const;

export function PostStudioFeatures({ className }: { className?: string }) {
  const locale = useLocale();
  return (
    <ul className={cn("grid grid-cols-1 gap-2 sm:grid-cols-3", className)} data-testid="poststudio-features">
      {FEATURES.map(({ id, Icon }) => (
        <li key={id} data-feature={id} className="flex items-start gap-2.5 rounded-lg border border-paper-deep bg-white p-2.5 sm:flex-col sm:gap-1.5">
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md ps-icon-tile">
            <Icon size={15} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13px] font-semibold text-ink">{t(locale, K(`feature.${id}.title`))}</span>
              <span className="rounded-full border border-paper-deep bg-paper px-1.5 text-[10px] font-semibold text-ink-soft">{t(locale, "dashboard.common.comingSoon")}</span>
            </div>
            <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">{t(locale, K(`feature.${id}.body`))}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
