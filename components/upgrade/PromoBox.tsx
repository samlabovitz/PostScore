"use client";

// The promo box: opens right where the owner clicked something locked —
// a popover beside it on wider screens, a bottom sheet on a phone. Never
// modal: no backdrop, the page keeps scrolling and working. It ALWAYS shows
// both plans, Grow and Premium, side by side (stacked on a phone): price,
// tagline, key benefits, Premium marked "Best value", a "See plans" under
// each, and the clicked plan highlighted. A feature-specific lock leads with
// that feature's title and lines. Closes with ×, "Not now", Esc or a tap
// outside. "See plans" opens Settings → Plan & billing → Compare plans;
// nothing here charges.

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { IconCheck, IconCrown, IconX } from "@tabler/icons-react";
import { t, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { promoContent, type BoxAction, type PromoFeature, type PromoPlan } from "@/lib/upgradePromos";
import { useUpgrade } from "./UpgradeContext";

const MAX_WIDTH = 620;
const GAP = 8;

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
  const [pos, setPos] = useState<{ desktop: boolean; top?: number; bottom?: number; left: number; width: number } | null>(null);

  // Place it beside the trigger (desktop) or as a bottom sheet (phone).
  useLayoutEffect(() => {
    const place = () => {
      const desktop = window.matchMedia("(min-width: 768px)").matches;
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!desktop || !rect) return setPos({ desktop: false, left: 0, width: 0 });
      const width = Math.min(MAX_WIDTH, window.innerWidth - GAP * 2);
      const left = Math.min(Math.max(GAP, rect.left), window.innerWidth - width - GAP);
      const height = boxRef.current?.offsetHeight ?? 420;
      const below = rect.bottom + GAP + height <= window.innerHeight || rect.top < height + GAP;
      setPos(below ? { desktop, top: rect.bottom + GAP, left, width } : { desktop, bottom: window.innerHeight - rect.top + GAP, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef]);

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
  const content = promoContent(feature, up.facts, locale, highlight);

  const box = (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="promo-box"
      data-feature={feature}
      style={pos?.desktop ? { top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width } : undefined}
      className={cn(
        "fixed z-[70] flex flex-col gap-3 border border-paper-deep bg-white p-4 text-left shadow-[0_12px_40px_rgba(16,24,40,0.18)] outline-none",
        pos?.desktop ? "max-h-[85vh] overflow-y-auto rounded-xl" : "inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]",
        !pos && "invisible"
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-[15px] font-semibold leading-snug text-ink">
            {content.feature?.title ?? t(locale, "dashboard.upgrade.box.plansHeading")}
          </h2>
          {content.feature && content.feature.lines.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1">
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
        </div>
        <button type="button" onClick={() => onClose("x")} aria-label={t(locale, "dashboard.upgrade.box.close")} className="-mr-1 -mt-1 rounded-md p-1 text-ink-soft hover:bg-paper hover:text-ink">
          <IconX size={18} />
        </button>
      </div>
      <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="promo-plans">
        {content.plans.map((plan) => (
          <PlanColumn key={plan.plan} plan={plan} businessId={up.businessId} onClose={() => onClose("x")} />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] text-ink-mute">{t(locale, "dashboard.upgrade.box.noCheckout")}</p>
        <button type="button" onClick={() => onClose("notNow")} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-paper hover:text-ink">
          {t(locale, "dashboard.upgrade.box.notNow")}
        </button>
      </div>
    </div>
  );
  return createPortal(box, document.body);
}
