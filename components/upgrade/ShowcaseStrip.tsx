"use client";

// The showcase strip above the footer of the main pages (Free and Grow):
// what the next plan does, as 3 chips relevant to this page that rotate
// one at a time. "See what's included" opens the promo box; × hides it
// for 14 days for this business. Premium sees one PostStudio line on the
// Website page only; Multi sees nothing.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { IconCrown, IconRocket, IconX } from "@tabler/icons-react";
import { t, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  BOX_CLOSED,
  boxReducer,
  hiddenUntilFrom,
  isHidden,
  readLocalHidden,
  stripChips,
  stripPromoKey,
  visibleChips,
  writeLocalHidden,
  type BoxAction,
} from "@/lib/upgradePromos";
import { useUpgrade } from "./UpgradeContext";
import { PromoBox } from "./PromoBox";

const ROTATE_MS = 6000;

export function ShowcaseStrip() {
  const up = useUpgrade();
  const locale = useLocale();
  const strip = up?.strip ?? null;
  const key = strip ? stripPromoKey(strip.page) : "";
  // Hidden on this device: read after mount (the first render matches
  // the server's).
  const [hidden, setHidden] = useState(() => !!strip && isHidden(strip.hiddenUntil, new Date()));
  const [step, setStep] = useState(0);
  const [box, dispatch] = useReducer(boxReducer, BOX_CLOSED);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback((reason: Extract<BoxAction, { type: "close" }>["reason"]) => dispatch({ type: "close", reason }), []);

  useEffect(() => {
    if (up && strip && isHidden(readLocalHidden(up.businessId, key), new Date())) setHidden(true);
  }, [up, strip, key]);

  const chips = strip ? stripChips(strip.audience, strip.page) : [];
  const rotates = chips.length > 3;
  useEffect(() => {
    if (!rotates || hidden) return;
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      // Older browsers: rotate.
    }
    if (reduced) return;
    const id = window.setInterval(() => setStep((s) => s + 1), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [rotates, hidden]);

  if (!up || !strip || hidden) return null;

  function hide() {
    if (!up || !strip) return;
    setHidden(true);
    writeLocalHidden(up.businessId, key, hiddenUntilFrom(new Date()));
  }

  const hideButton = (
    <button type="button" onClick={hide} aria-label={t(locale, "dashboard.upgrade.strip.hide")} title={t(locale, "dashboard.upgrade.strip.hide")} className="shrink-0 rounded-md p-1 text-ink-soft hover:bg-white hover:text-ink" data-testid="strip-hide">
      <IconX size={16} />
    </button>
  );

  if (strip.audience === "postStudio") {
    return (
      <aside data-testid="showcase-strip" data-audience="postStudio" className="mt-10 flex items-center gap-2 rounded-lg border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-white px-3 py-2 text-[12.5px] text-ink">
        <IconCrown size={14} aria-hidden className="shrink-0 text-brass" />
        <span className="min-w-0 flex-1">{t(locale, "dashboard.upgrade.strip.postStudioLine")}</span>
        {hideButton}
      </aside>
    );
  }

  const premium = strip.audience === "premium";
  const shown = visibleChips(chips, step);
  const fixLine = !premium && up.facts.fixPoints && up.facts.businessName ? t(locale, "dashboard.upgrade.strip.fixPoints", { n: up.facts.fixPoints, name: up.facts.businessName }) : null;

  return (
    <aside
      aria-label={t(locale, "dashboard.upgrade.strip.label")}
      data-testid="showcase-strip"
      data-audience={strip.audience}
      className={cn(
        "mt-10 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4",
        premium
          ? "border-[color:color-mix(in_srgb,var(--color-brass)_45%,white)] bg-gradient-to-r from-[color:color-mix(in_srgb,var(--color-brass)_10%,white)] to-white"
          : "border-paper-deep bg-white"
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5 sm:w-[17rem] sm:shrink-0">
        <span
          className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", premium ? "bg-[color:color-mix(in_srgb,var(--color-brass)_20%,white)] text-brass" : "bg-paper text-ink")}
          aria-hidden
        >
          {premium ? <IconCrown size={17} /> : <IconRocket size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold leading-snug text-ink">{t(locale, premium ? "dashboard.upgrade.strip.premiumTitle" : "dashboard.upgrade.strip.growTitle")}</div>
          {fixLine && <div className="text-[12px] text-ink-soft">{fixLine}</div>}
        </div>
        <span className="sm:hidden">{hideButton}</span>
      </div>
      <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5" data-testid="strip-chips">
        {shown.map((c) => (
          <li key={c.key} className="inline-flex items-center gap-1 rounded-full border border-paper-deep bg-white px-2.5 py-1 text-[12px] font-medium text-ink">
            {t(locale, c.key)}
            {c.soon && <span className="rounded-full bg-paper px-1.5 text-[10px] font-semibold text-ink-soft">{t(locale, "dashboard.upgrade.chip.soon")}</span>}
          </li>
        ))}
      </ul>
      <div className="flex shrink-0 items-center gap-2">
        <button
          ref={anchorRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={box.open}
          onClick={() => dispatch(box.open ? { type: "close", reason: "x" } : { type: "lockedClick", feature: premium ? "premium" : "grow" })}
          className="inline-flex items-center rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink/90"
          data-testid="strip-see-included"
        >
          {t(locale, "dashboard.upgrade.strip.seeIncluded")}
        </button>
        <span className="hidden sm:inline-flex">{hideButton}</span>
      </div>
      {box.open && <PromoBox feature={box.feature} anchorRef={anchorRef} onClose={close} />}
    </aside>
  );
}
