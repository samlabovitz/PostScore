"use client";

// The one way into the promo box: put it on (or beside) anything locked.
// It opens the box only when clicked, and renders nothing for a plan that
// already has the feature (or when the page passes no upgrade data).

import { useCallback, useReducer, useRef, type ReactNode } from "react";
import { IconCrown, IconLock } from "@tabler/icons-react";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BOX_CLOSED, boxReducer, featurePlan, promosFor, type BoxAction, type PromoFeature } from "@/lib/upgradePromos";
import { useUpgrade } from "./UpgradeContext";
import { PromoBox } from "./PromoBox";

type Variant = "link" | "button" | "chip";

export function UpgradeTrigger({ feature, label, variant = "link", className }: { feature: PromoFeature; label?: ReactNode; variant?: Variant; className?: string }) {
  const up = useUpgrade();
  const locale = useLocale();
  const [state, dispatch] = useReducer(boxReducer, BOX_CLOSED);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback((reason: Extract<BoxAction, { type: "close" }>["reason"]) => {
    dispatch({ type: "close", reason });
    if (reason === "esc" || reason === "x" || reason === "notNow") anchorRef.current?.focus();
  }, []);
  if (!up || !promosFor(up.plan, feature)) return null;
  const plan = featurePlan(feature);
  const text = label ?? t(locale, `dashboard.upgrade.trigger.${plan}` as MessageKey);
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={state.open}
        data-testid="upgrade-trigger"
        data-feature={feature}
        onClick={(e) => {
          // Never also toggles a label/radio it sits inside.
          e.preventDefault();
          e.stopPropagation();
          dispatch(state.open ? { type: "close", reason: "x" } : { type: "lockedClick", feature });
        }}
        className={cn(
          variant === "link" && "inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink",
          variant === "button" && "inline-flex items-center gap-1.5 rounded-lg border border-brass bg-brass px-2.5 py-1 text-[12px] font-semibold text-ink hover:bg-[#a5772a]",
          variant === "chip" &&
            "inline-flex items-center gap-1 rounded-full border border-[color:color-mix(in_srgb,var(--color-brass)_45%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_8%,white)] px-2 py-0.5 text-[11.5px] font-semibold text-ink hover:border-brass",
          className
        )}
      >
        {plan === "premium" ? <IconCrown size={13} aria-hidden className="text-brass" /> : <IconLock size={12} aria-hidden className="text-brass" />}
        {text}
      </button>
      {state.open && <PromoBox feature={state.feature} anchorRef={anchorRef} onClose={close} />}
    </>
  );
}
