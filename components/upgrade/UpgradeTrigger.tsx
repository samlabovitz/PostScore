"use client";

// The one way into the promo box: put it on (or beside) anything locked.
// It opens the box only when clicked, and renders nothing for a plan that
// already has the feature (or when the page passes no upgrade data).

import { useCallback, useReducer, useRef, type ReactNode } from "react";
import { IconArrowRight, IconCrown, IconLock } from "@tabler/icons-react";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BOX_CLOSED, boxReducer, featurePlan, premiumOnly, promosFor, type BoxAction, type PromoFeature } from "@/lib/upgradePromos";
import { useUpgrade } from "./UpgradeContext";
import { PromoBox } from "./PromoBox";

/** "pair" is Free's one big comparison; "link" / "button" / "chip" are the
 * looks the triggers had before (kept on Grow and up). */
type Variant = "link" | "pair" | "button" | "chip";

/** Every locked spot. By default it's SMALL: a lock chip naming the plan
 * ("Grow", or "Premium" with a crown; "Add-on" for PostStudio) and a "See
 * plans" text link — one click opens the side-by-side Grow vs Premium box
 * with the clicked feature's plan highlighted. `variant="pair"` is the one
 * full comparison a page may carry (the showroom's top card, the Overview's
 * "More customers"): two big buttons, "Unlock with Grow" and "Unlock with
 * Premium" (Best value); for a Premium-only feature the Grow one reads "Not
 * included in Grow". `plain` drops the chip when the block already names
 * its plan (LockedPreview). Renders nothing for a plan that already has the
 * feature, or without upgrade data. */
export function UpgradeTrigger({
  feature,
  variant = "link",
  plain = false,
  label,
  className,
}: {
  feature: PromoFeature;
  variant?: Variant;
  plain?: boolean;
  /** Grow and up: the trigger's own label (as before this batch). */
  label?: ReactNode;
  className?: string;
}) {
  const up = useUpgrade();
  const locale = useLocale();
  const [state, dispatch] = useReducer(boxReducer, BOX_CLOSED);
  const growRef = useRef<HTMLButtonElement>(null);
  const premiumRef = useRef<HTMLButtonElement>(null);
  const close = useCallback((reason: Extract<BoxAction, { type: "close" }>["reason"]) => {
    dispatch({ type: "close", reason });
  }, []);
  if (!up || !promosFor(up.plan, feature)) return null;
  const notInGrow = premiumOnly(feature);
  const postStudio = feature === "postStudio";
  const open = (highlight: "grow" | "premium") => (e: React.MouseEvent) => {
    // Never also toggles a label/radio it sits inside.
    e.preventDefault();
    e.stopPropagation();
    dispatch(state.open && state.highlight === highlight ? { type: "close", reason: "x" } : { type: "lockedClick", feature, highlight });
  };
  const box = state.open && (
    <PromoBox feature={state.feature} highlight={state.highlight} anchorRef={state.highlight === "premium" ? premiumRef : growRef} onClose={close} />
  );

  // Grow and up: the trigger looks exactly as it did before this batch (one
  // link / button / chip); only the box it opens is new (both plans).
  if (up.plan !== "free") {
    const plan = featurePlan(feature);
    const legacy = variant === "pair" ? "button" : variant;
    return (
      <>
        <button
          ref={plan === "premium" ? premiumRef : growRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={state.open}
          data-testid="upgrade-trigger"
          data-feature={feature}
          onClick={open(plan)}
          className={cn(
            legacy === "link" && "inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink",
            legacy === "button" && "inline-flex items-center gap-1.5 rounded-lg border border-brass bg-brass px-2.5 py-1 text-[12px] font-semibold text-ink hover:bg-[#a5772a]",
            legacy === "chip" &&
              "inline-flex items-center gap-1 rounded-full border border-[color:color-mix(in_srgb,var(--color-brass)_45%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_8%,white)] px-2 py-0.5 text-[11.5px] font-semibold text-ink hover:border-brass",
            className
          )}
        >
          {plan === "premium" ? <IconCrown size={13} aria-hidden className="text-brass" /> : <IconLock size={12} aria-hidden className="text-brass" />}
          {label ?? t(locale, `dashboard.upgrade.trigger.${plan}` as MessageKey)}
        </button>
        {box}
      </>
    );
  }

  if (variant !== "pair") {
    const plan = featurePlan(feature);
    return (
      <span data-testid="upgrade-trigger" data-variant="link" data-feature={feature} className={cn("inline-flex shrink-0 items-center gap-2 whitespace-nowrap", className)}>
        {!plain && (
          <span data-testid="lock-chip" className="inline-flex items-center gap-1 rounded-full border border-paper-deep bg-white px-2 py-0.5 text-[11px] font-semibold text-ink">
            {plan === "premium" && !postStudio ? <IconCrown size={11} aria-hidden className="text-brass" /> : <IconLock size={11} aria-hidden className="text-brass" />}
            {postStudio ? t(locale, "dashboard.free.tile.addOn") : t(locale, `dashboard.settings.plan.name.${plan}` as MessageKey)}
          </span>
        )}
        <button
          ref={plan === "premium" ? premiumRef : growRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={state.open}
          data-testid="see-plans-link"
          onClick={open(plan)}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-paper-deep bg-white px-3 py-1 text-[12.5px] font-semibold text-ink transition-colors hover:border-brass"
        >
          {t(locale, "dashboard.upgrade.box.seePlans")}
          <IconArrowRight size={13} aria-hidden className="text-brass" />
        </button>
        {box}
      </span>
    );
  }

  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold";
  return (
    <span data-testid="upgrade-trigger" data-variant="pair" data-feature={feature} className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <button
        ref={growRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={state.open && state.highlight === "grow"}
        data-testid="unlock-grow-button"
        data-not-included={notInGrow || undefined}
        onClick={open("grow")}
        className={cn(base, "border border-paper-deep bg-white text-ink hover:border-ink-soft", notInGrow && "text-ink-soft")}
      >
        {!notInGrow && <IconLock size={12} aria-hidden className="text-brass" />}
        {postStudio
          ? t(locale, "dashboard.upgrade.trigger.postStudioGrow")
          : notInGrow
            ? t(locale, "dashboard.upgrade.trigger.notInGrow")
            : t(locale, "dashboard.upgrade.trigger.unlockGrow")}
      </button>
      <button
        ref={premiumRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={state.open && state.highlight === "premium"}
        data-testid="unlock-premium-button"
        onClick={open("premium")}
        className={cn(base, "border border-brass bg-brass text-ink hover:bg-[#a5772a]")}
      >
        <IconCrown size={12} aria-hidden />
        {postStudio ? t(locale, "dashboard.upgrade.trigger.postStudioPremium") : t(locale, "dashboard.upgrade.trigger.unlockPremium")}
        <span className="rounded-full bg-ink px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-[0.05em] text-white">{t(locale, "dashboard.settings.plans.bestValue")}</span>
      </button>
      {box}
    </span>
  );
}

/** Any locked action (a designer's Save/Print/Share, a locked tile, the
 * PostAI box) as a button that opens the promo box — same look as the
 * control it replaces (`className`). Without upgrade data it renders the
 * same content disabled, so the layout never jumps. */
export function UpgradeButton({ feature, className, children, testId }: { feature: PromoFeature; className?: string; children: ReactNode; testId?: string }) {
  const up = useUpgrade();
  const [state, dispatch] = useReducer(boxReducer, BOX_CLOSED);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback((reason: Extract<BoxAction, { type: "close" }>["reason"]) => {
    dispatch({ type: "close", reason });
    if (reason !== "outside") anchorRef.current?.focus();
  }, []);
  const live = !!up && promosFor(up.plan, feature);
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={!live}
        aria-haspopup={live ? "dialog" : undefined}
        aria-expanded={live ? state.open : undefined}
        data-testid={testId ?? "upgrade-button"}
        data-feature={feature}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dispatch(state.open ? { type: "close", reason: "x" } : { type: "lockedClick", feature });
        }}
        className={className}
      >
        {children}
      </button>
      {state.open && <PromoBox feature={state.feature} anchorRef={anchorRef} onClose={close} />}
    </>
  );
}
