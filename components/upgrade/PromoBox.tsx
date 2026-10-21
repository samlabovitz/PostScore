"use client";

// The promo box: opens when the owner clicks something locked. It is
// never cut off: centered on screen on wider screens, a bottom sheet on a
// phone, never taller than the viewport minus a margin; the title + × and
// the footer stay put while the middle scrolls. Not modal: no backdrop, the
// page keeps working. It ALWAYS shows both plans, Grow and Premium, side by
// side (stacked on a phone): price, tagline, key benefits, Premium marked
// "Best value", a "See plans" under each, and the clicked plan highlighted.
// A feature-specific lock leads with that feature's title and lines. Closes
// with ×, "Not now", Esc or a tap outside. "See plans" opens Settings →
// Plan & billing → Compare plans; nothing here charges.
//
// PostStudio has its own box (not Grow vs Premium): what PostStudio
// includes (Website, Menu & catalog, Logo Studio — three compact tiles) and
// the ways to get it side by side (PostStudio only · Grow + PostStudio ·
// Premium + PostStudio, Best value) plus "Included in Multi", with the plan
// they're on highlighted. Footer: coming soon, nothing charged.

import { useEffect, useId, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { IconCheck, IconCrown, IconX } from "@tabler/icons-react";
import { t, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { promoContent, type BoxAction, type PromoFeature, type PromoPlan } from "@/lib/upgradePromos";
import { useUpgrade } from "./UpgradeContext";
import { PostStudioFeatures, PostStudioOptions } from "@/components/studio/PostStudioOptions";
import type { UpgradeContextData } from "@/lib/upgradePromos.server";

type CloseReason = Extract<BoxAction, { type: "close" }>["reason"];

function PlanColumn({ plan, businessId, onClose }: { plan: PromoPlan; businessId: string; onClose: () => void }) {
  const locale = useLocale();
  return (
    <div
      data-testid="promo-plan"
      data-plan={plan.plan}
      data-highlighted={plan.highlighted || undefined}
      className={cn(
        "relative flex flex-col gap-2 rounded-xl border p-3.5",
        plan.highlighted ? "border-brass ring-2 ring-[color:color-mix(in_srgb,var(--color-brass)_35%,white)]" : "border-paper-deep",
        plan.best ? "bg-[color:color-mix(in_srgb,var(--color-brass)_8%,white)]" : "bg-white"
      )}
    >
      {plan.best && (
        <span data-testid="promo-best-value" className="absolute -top-2.5 right-3 inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-white">
          <IconCrown size={11} aria-hidden className="text-brass" />
          {t(locale, "dashboard.settings.plans.bestValue")}
        </span>
      )}
      <div className="flex items-baseline gap-1.5">
        <span className="text-[15px] font-semibold text-ink">{plan.name}</span>
        <span className="text-[13px] text-ink-soft">{plan.price}</span>
      </div>
      <div className="text-[12.5px] font-semibold text-brass">{plan.tagline}</div>
      <ul className="flex flex-col gap-1">
        {plan.bullets.map((b) => (
          <li key={b} className="flex items-start gap-1.5 text-[12.5px] leading-snug text-ink">
            <IconCheck size={13} aria-hidden className="mt-0.5 shrink-0 text-green" />
            {b}
          </li>
        ))}
      </ul>
      <Link
        href={`/business/${businessId}/settings#compare-plans`}
        onClick={onClose}
        className={cn(
          "mt-auto inline-flex w-fit items-center rounded-lg px-3 py-1.5 text-[12.5px] font-semibold",
          plan.highlighted ? "bg-ink text-white hover:bg-ink/90" : "border border-paper-deep bg-white text-ink hover:border-ink-soft"
        )}
        data-testid="promo-see-plans"
      >
        {t(locale, "dashboard.upgrade.box.seePlans")}
      </Link>
    </div>
  );
}

/** The PostStudio box's body: what PostStudio includes (three compact
 * tiles), then the ways to get it. */
export function PostStudioBody({ up, businessId, onClose }: { up: UpgradeContextData; businessId: string; onClose: () => void }) {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-4" data-testid="poststudio-box">
      <PostStudioFeatures />
      <PostStudioOptions plan={up.plan} />
      <Link
        href={`/business/${businessId}/settings#compare-plans`}
        onClick={onClose}
        className="w-fit text-[12.5px] font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink"
        data-testid="promo-see-plans"
      >
        {t(locale, "dashboard.upgrade.box.seePlans")}
      </Link>
    </div>
  );
}

export function PromoBox({
  feature,
  highlight,
  anchorRef,
  onClose,
}: {
  feature: PromoFeature;
  /** The plan whose button was clicked (default: the plan the feature needs). */
  highlight?: "grow" | "premium";
  anchorRef: RefObject<HTMLElement>;
  onClose: (reason: CloseReason) => void;
}) {
  const up = useUpgrade();
  const locale = useLocale();
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    boxRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose("esc");
    };
    const onDown = (e: Event) => {
      const target = e.target as Node;
      if (boxRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose("outside");
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [anchorRef, onClose]);

  if (!up) return null;
  const studio = feature === "postStudio";
  const content = promoContent(feature, up.facts, locale, highlight);

  // Never cut off: fixed and fully on screen (centered from md, a bottom
  // sheet below), at most the viewport minus a margin; only the middle
  // scrolls, so the title + × and the footer are always visible.
  const box = (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="promo-box"
      data-feature={feature}
      className={cn(
        "fixed z-[70] flex flex-col overflow-hidden border border-paper-deep bg-white text-left shadow-[0_12px_40px_rgba(16,24,40,0.18)] outline-none",
        "inset-x-0 bottom-0 max-h-[calc(100dvh-1rem)] rounded-t-2xl",
        "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(620px,calc(100vw-2rem))] md:max-h-[calc(100dvh-2rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
      )}
    >
      <div className="flex shrink-0 items-start gap-2.5 border-b border-paper-line px-4 pb-3 pt-4" data-testid="promo-box-header">
        <h2 id={titleId} className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[15px] font-semibold leading-snug text-ink">
          {studio ? t(locale, "dashboard.postStudioPlans.box.title") : (content.feature?.title ?? t(locale, "dashboard.upgrade.box.plansHeading"))}
          {studio && <span className="rounded-full border border-paper-deep bg-paper px-2 py-0.5 text-[10.5px] font-semibold text-ink-soft">{t(locale, "dashboard.common.comingSoon")}</span>}
        </h2>
        <button type="button" onClick={() => onClose("x")} aria-label={t(locale, "dashboard.upgrade.box.close")} className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-ink-soft hover:bg-paper hover:text-ink">
          <IconX size={18} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3" data-testid="promo-box-body">
        {studio && <p className="text-[13px] leading-snug text-ink-soft">{t(locale, "dashboard.postStudioPlans.box.sub")}</p>}
        {!studio && content.feature && content.feature.lines.length > 0 && (
          <ul className="flex flex-col gap-1">
            {content.feature.lines.map((l) => (
              <li key={l.text} className="text-[13px] leading-snug text-ink">
                {l.text}
                {l.soon && (
                  <span className="ml-1.5 inline-block rounded-full border border-paper-deep bg-paper px-1.5 align-[1px] text-[10.5px] font-semibold text-ink-soft">
                    {t(locale, "dashboard.upgrade.box.soon")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {studio ? (
          <PostStudioBody up={up} businessId={up.businessId} onClose={() => onClose("x")} />
        ) : (
          <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="promo-plans">
            {content.plans.map((plan) => (
              <PlanColumn key={plan.plan} plan={plan} businessId={up.businessId} onClose={() => onClose("x")} />
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-paper-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5" data-testid="promo-box-footer">
        <p className="text-[11.5px] text-ink-mute" data-testid="promo-footer">{t(locale, studio ? "dashboard.postStudioPlans.footer" : "dashboard.upgrade.box.noCheckout")}</p>
        <button type="button" onClick={() => onClose("notNow")} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-paper hover:text-ink">
          {t(locale, "dashboard.upgrade.box.notNow")}
        </button>
      </div>
    </div>
  );
  return createPortal(box, document.body);
}
