"use client";

// Free only: what upgrading gets you, made obvious. A locked "How to fix
// this" row (under a category's top issue and each check that needs
// work) and the one upgrade box right after the Score breakdown that
// every one of them scrolls to. The real fix advice is never in a Free
// page: the blurred line is a fixed placeholder, and the page gets the
// score without any advice (lib/freeUpsell.ts withoutAdvice).

import Link from "next/link";
import { useId, useState } from "react";
import { IconArrowRight, IconChevronDown, IconCrown, IconLock, IconRocket } from "@tabler/icons-react";
import { planExtraBadge, planExtrasFor } from "@/lib/planFeatures";
import { useUpgrade } from "@/components/upgrade/UpgradeContext";
import { jumpToAnchor } from "@/components/layout/AnchorHighlight";
import { FIX_PLAN_ANCHOR } from "@/lib/freeUpsell";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** A real link to the upgrade box (scrolls there and highlights it). */
function toFixPlan(e: React.MouseEvent) {
  e.preventDefault();
  jumpToAnchor(FIX_PLAN_ANCHOR);
}

/** "🔒 How to fix this — on Grow and Premium"; `blurred` adds the locked
 * fix line under it — a placeholder behind a blur, never the advice. */
export function LockedFixRow({ blurred = false, className }: { blurred?: boolean; className?: string }) {
  const locale = useLocale();
  return (
    <a href={`#${FIX_PLAN_ANCHOR}`} onClick={toFixPlan} data-testid="locked-fix" className={cn("group flex w-fit max-w-full flex-col gap-1", className)}>
      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink underline decoration-paper-line underline-offset-2 group-hover:decoration-brass">
        <IconLock size={12} aria-hidden className="shrink-0 text-brass" />
        {t(locale, "dashboard.free.fixPlan.lockedRow")}
      </span>
      {blurred && (
        <span aria-hidden data-testid="locked-fix-blur" className="pointer-events-none select-none text-[12.5px] leading-snug text-ink-soft blur-[4px]">
          {t(locale, "dashboard.free.fixPlan.placeholder")}
        </span>
      )}
    </a>
  );
}

/** The ScoreBand's Free line: what the points are, and a way to them. */
export function SeeHowToFix() {
  const locale = useLocale();
  return (
    <div data-testid="free-waiting-upsell" className="mt-2 flex flex-col items-start gap-2">
      <span className="text-[12.5px] leading-snug text-[color:color-mix(in_srgb,var(--color-paper)_75%,transparent)]">{t(locale, "dashboard.free.fixPlan.line")}</span>
      <a
        href={`#${FIX_PLAN_ANCHOR}`}
        onClick={toFixPlan}
        data-testid="see-how-to-fix"
        className="inline-flex items-center gap-1.5 rounded-lg bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-brass)_85%,white)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
      >
        {t(locale, "dashboard.free.fixPlan.seeHow")}
        <IconArrowRight size={14} aria-hidden />
      </a>
    </div>
  );
}

const PREMIUM_BORDER = "border-[color:color-mix(in_srgb,var(--color-brass)_45%,white)]";

/** Free, section B: ONE card, two halves on one background — "Earn back
 * your missing points, step by step" (Grow and Premium side by side, the
 * promo cards' look, each with "See plans" → Settings → Compare plans:
 * the card's only upgrade buttons), a soft divider, then `children` —
 * the "More customers, whatever your score" tool tiles (GrowMoreCustomers
 * embedded). "See how to fix it" and every locked row scroll here. */
export function FixPlanBox({ businessId, children, extras = null }: { businessId: string; children?: React.ReactNode; extras?: { hasWebsite: boolean } | null }) {
  const locale = useLocale();
  const builderName = useUpgrade()?.facts.builderName ?? null;
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  const plans: Array<{ kind: "grow" | "premium"; lineKey: MessageKey }> = [
    { kind: "grow", lineKey: "dashboard.free.fixPlan.grow" },
    { kind: "premium", lineKey: "dashboard.free.fixPlan.premium" },
  ];
  return (
    <section id={FIX_PLAN_ANCHOR} data-testid="fix-plan-box" className="flex scroll-mt-20 flex-col rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-4" data-testid="fix-plan-top">
        <h3 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.free.fixPlan.heading")}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="fix-plan-plans">
          {plans.map(({ kind, lineKey }) => {
            const premium = kind === "premium";
            return (
              <div
                key={kind}
                data-testid="fix-plan-card"
                data-kind={kind}
                className={cn(
                  "relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border p-4",
                  premium ? cn(PREMIUM_BORDER, "bg-gradient-to-br from-[color:color-mix(in_srgb,var(--color-brass)_12%,white)] to-white") : "border-paper-deep bg-white"
                )}
              >
                {premium && (
                  <span className="absolute right-3 top-0 rounded-b-md bg-ink px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-white">
                    {t(locale, "dashboard.settings.plans.bestValue")}
                  </span>
                )}
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", premium ? "bg-[color:color-mix(in_srgb,var(--color-brass)_20%,white)] text-brass" : "bg-paper text-ink")}
                  >
                    {premium ? <IconCrown size={17} /> : <IconRocket size={17} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
                      {t(locale, `dashboard.settings.plan.name.${kind}` as MessageKey)} · {t(locale, `dashboard.settings.plans.price.${kind}` as MessageKey)}
                    </div>
                    <div className="text-[14.5px] font-semibold leading-snug text-ink">{t(locale, lineKey)}</div>
                  </div>
                </div>
                <Link
                  href={`/business/${businessId}/settings#compare-plans`}
                  data-testid="fix-plan-see-plans"
                  className="mt-auto inline-flex w-fit items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink/90"
                >
                  {t(locale, "dashboard.upgrade.box.seePlans")}
                  <IconArrowRight size={13} aria-hidden />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
      {children && (
        <>
          {/* A soft divider — the two halves share one card. */}
          <div aria-hidden className="my-5 h-px bg-paper-line" />
          <div data-testid="fix-plan-tools">{children}</div>
        </>
      )}
      {extras && (
        <>
          <div aria-hidden className="my-5 h-px bg-paper-line" />
          {/* Third part: everything else each plan adds — collapsed. */}
          <div data-testid="fix-plan-extras">
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              aria-controls={listId}
              data-testid="fix-plan-extras-toggle"
              className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left text-[14px] font-semibold text-ink hover:text-brass focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass"
            >
              {t(locale, showAll ? "dashboard.free.fixPlan.hideEverything" : "dashboard.free.fixPlan.seeEverything")}
              <IconChevronDown size={18} aria-hidden className={cn("shrink-0 text-ink-soft transition-transform", showAll && "rotate-180")} />
            </button>
            <ul id={listId} hidden={!showAll} className={cn("mt-2 flex-col divide-y divide-paper-line", showAll && "flex")} data-testid="fix-plan-extras-list">
              {planExtrasFor(extras.hasWebsite).map((extra) => {
                const badge = planExtraBadge(extra);
                return (
                  <li key={extra.id} data-testid={`plan-extra-${extra.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0 text-[13.5px] text-ink">
                      {t(locale, extra.titleKey, { builder: builderName ?? t(locale, "dashboard.free.tile.yourWebsite") })}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {extra.soon && <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{t(locale, "dashboard.common.comingSoon")}</span>}
                      <span className="inline-flex items-center gap-1 rounded-full border border-paper-deep bg-white px-2 py-0.5 text-[11px] font-semibold text-ink">
                        <IconLock size={10} aria-hidden className="text-brass" />
                        {badge === "addOn" ? t(locale, "dashboard.free.tile.addOn") : t(locale, `dashboard.settings.plan.name.${badge}` as MessageKey)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
