"use client";

// The promo box: opens right where the owner clicked something locked —
// a popover beside it on wider screens, a bottom sheet on a phone. Never
// modal: no backdrop, the page keeps scrolling and working. Closes with
// ×, "Not now", Esc or a tap outside. "See plans" opens Settings → Plan &
// billing → Compare plans; nothing here charges.

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { IconCrown, IconRocket, IconX } from "@tabler/icons-react";
import { t, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { promoContent, type BoxAction, type PromoFeature } from "@/lib/upgradePromos";
import { useUpgrade } from "./UpgradeContext";

const WIDTH = 352;
const GAP = 8;

type CloseReason = Extract<BoxAction, { type: "close" }>["reason"];

export function PromoBox({ feature, anchorRef, onClose }: { feature: PromoFeature; anchorRef: RefObject<HTMLElement>; onClose: (reason: CloseReason) => void }) {
  const up = useUpgrade();
  const locale = useLocale();
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ desktop: boolean; top?: number; bottom?: number; left: number } | null>(null);

  // Place it beside the trigger (desktop) or as a bottom sheet (phone).
  useLayoutEffect(() => {
    const place = () => {
      const desktop = window.matchMedia("(min-width: 768px)").matches;
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!desktop || !rect) return setPos({ desktop: false, left: 0 });
      const left = Math.min(Math.max(GAP, rect.left), window.innerWidth - WIDTH - GAP);
      const height = boxRef.current?.offsetHeight ?? 320;
      const below = rect.bottom + GAP + height <= window.innerHeight || rect.top < height + GAP;
      setPos(below ? { desktop, top: rect.bottom + GAP, left } : { desktop, bottom: window.innerHeight - rect.top + GAP, left });
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
  const content = promoContent(feature, up.facts, locale);
  const premium = content.plan === "premium";

  const box = (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="promo-box"
      data-feature={feature}
      style={pos?.desktop ? { top: pos.top, bottom: pos.bottom, left: pos.left, width: WIDTH } : undefined}
      className={cn(
        "fixed z-[70] flex flex-col gap-3 border bg-white p-4 text-left shadow-[0_12px_40px_rgba(16,24,40,0.18)] outline-none",
        premium ? "border-[color:color-mix(in_srgb,var(--color-brass)_55%,white)]" : "border-paper-deep",
        pos?.desktop ? "rounded-xl" : "inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]",
        !pos && "invisible"
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            premium ? "bg-[color:color-mix(in_srgb,var(--color-brass)_18%,white)] text-brass" : "bg-paper text-ink"
          )}
          aria-hidden
        >
          {premium ? <IconCrown size={16} /> : <IconRocket size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-[15px] font-semibold leading-snug text-ink">
            {content.title}
          </h2>
          {content.promise && <p className="mt-0.5 text-[13px] text-ink-soft">{content.promise}</p>}
        </div>
        <button type="button" onClick={() => onClose("x")} aria-label={t(locale, "dashboard.upgrade.box.close")} className="-mr-1 -mt-1 rounded-md p-1 text-ink-soft hover:bg-paper hover:text-ink">
          <IconX size={18} />
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {content.lines.map((l) => (
          <li key={l.text} className="flex items-start gap-2 text-[13px] leading-snug text-ink">
            <span className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", premium ? "bg-brass" : "bg-green")} aria-hidden />
            <span>
              {l.text}
              {l.soon && (
                <span className="ml-1.5 inline-block rounded-full border border-paper-deep bg-paper px-1.5 align-[1px] text-[10.5px] font-semibold text-ink-soft">
                  {t(locale, "dashboard.upgrade.box.soon")}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11.5px] text-ink-mute">{t(locale, "dashboard.upgrade.box.noCheckout")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/business/${up.businessId}/settings#compare-plans`}
          onClick={() => onClose("x")}
          className="inline-flex items-center rounded-lg bg-ink px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-ink/90"
          data-testid="promo-see-plans"
        >
          {t(locale, "dashboard.upgrade.box.seePlans")}
        </Link>
        <button type="button" onClick={() => onClose("notNow")} className="rounded-lg px-3 py-2 text-[13px] font-medium text-ink-soft hover:bg-paper hover:text-ink">
          {t(locale, "dashboard.upgrade.box.notNow")}
        </button>
      </div>
    </div>
  );
  return createPortal(box, document.body);
}
